import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, type Order, type Prisma } from '@prisma/client';
import { decimalsOfMint, symbolOfMint } from '@pixstock/shared';
import { DatabaseService } from '../../database/database.service';
import { TxBuilderService } from '../tx-builder/tx-builder.service';
import type { CreateOrderDto } from './dto/create-order.dto';
import {
  ENFORCED_RULES,
  UNENFORCED_RULES,
  checkRelayerPolicy,
  sha256Hex,
  type RelayerViolation,
} from './relayer-policy';

/**
 * An order without a durable nonce is tied to a recent blockhash, which
 * Solana forgets after about a minute and a half. Scanning, reading the
 * ticket and confirming takes longer than that, which is precisely why the
 * design calls for a nonce — until the nonce pool exists, an order is marked
 * expired rather than left to fail on chain for an unexplained reason.
 */
export const BLOCKHASH_ORDER_TTL_MS = 90_000;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly builder: TxBuilderService,
    private readonly config: ConfigService,
  ) {}

  /** The relayer's own public key, or null when no key is configured. */
  private get relayerPublicKey(): string | null {
    return this.config.get<string>('relayer.publicKey') || null;
  }

  async create(dto: CreateOrderDto) {
    const relayer = this.relayerPublicKey;
    if (!relayer) {
      // Building against a placeholder would produce an order nobody can
      // broadcast, and the vault would sign it before finding that out.
      throw new BadRequestException(
        'This relayer has no key configured, so it cannot be the fee payer of an order',
      );
    }

    const built = await this.builder.build({
      vault: dto.vault,
      feePayer: relayer,
      legs: dto.legs,
      slippageBps: dto.slippageBps,
    });

    const manifest = {
      kind: built.kind,
      legs: built.legs.map((leg) => ({
        inMint: leg.inMint,
        outMint: leg.outMint,
        inAmount: leg.inAmount,
        expectedOutAmount: leg.expectedOutAmount,
        minOutAmount: leg.minOutAmount,
        symbol: symbolOfMint(leg.outMint),
        decimals: decimalsOfMint(leg.outMint),
        route: leg.route,
      })),
      slippageBps: dto.slippageBps,
      feePayer: relayer,
      dapp: this.config.get<string>('app.dapp') ?? 'app.pixstock.xyz',
      quotedAt: Math.floor(Date.now() / 1000),
    };

    const order = await this.db.order.create({
      data: {
        vault: dto.vault,
        kind: built.kind,
        manifest: manifest as unknown as Prisma.InputJsonValue,
        txMessages: built.messages.map((m) => Buffer.from(m).toString('base64')),
        // Recorded now so a signature can be checked against the message this
        // relayer built, not against whatever comes back later.
        messageHashes: built.messages.map(sha256Hex),
        nonceAccount: '',
        status: OrderStatus.AWAITING_SIGNATURE,
      },
    });

    await this.audit(order.id, 'order.built', {
      sizes: built.sizes,
      expiry: built.expiry,
      legs: built.legs.length,
    });

    return this.present(order, built.sizes, built.expiry);
  }

  async find(id: string) {
    const order = await this.db.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException(`No order ${id}`);
    return this.present(await this.expireIfStale(order));
  }

  /**
   * Takes the vault's signature, checks it, and stops short of broadcasting.
   *
   * Co-signing and sending need the hot key, which is not configured. Rather
   * than pretend, the order moves to SIGNED and says what is missing — a
   * status of BROADCAST that never reached a validator would be worse than
   * useless.
   */
  async submitSignature(id: string, signaturesBase64: string[]) {
    const found = await this.db.order.findUnique({ where: { id } });
    if (!found) throw new NotFoundException(`No order ${id}`);

    const order = await this.expireIfStale(found);
    const relayer = this.relayerPublicKey;
    if (!relayer) throw new BadRequestException('This relayer has no key configured');

    if (signaturesBase64.length !== order.txMessages.length) {
      throw new BadRequestException(
        `This order needs ${order.txMessages.length} signature(s), ${signaturesBase64.length} given`,
      );
    }

    const violations: RelayerViolation[] = [];
    signaturesBase64.forEach((signature, i) => {
      violations.push(
        ...checkRelayerPolicy({
          messageBytes: Uint8Array.from(Buffer.from(order.txMessages[i]!, 'base64')),
          expectedHash: order.messageHashes[i]!,
          signature: Uint8Array.from(Buffer.from(signature, 'base64')),
          vault: order.vault,
          relayer,
          status: order.status,
          alreadySigned: order.vaultSigs.length > 0,
          maxComputeUnitPrice: BigInt(
            this.config.get<number>('relayer.maxComputeUnitPrice') ?? 1_000_000,
          ),
        }),
      );
    });

    if (violations.length > 0) {
      await this.audit(order.id, 'signature.refused', { violations });
      this.logger.warn(`Refused a signature for ${order.id}: ${violations.map((v) => v.rule).join(', ')}`);
      throw new ConflictException({
        message: 'This signature was refused',
        violations,
        enforced: ENFORCED_RULES,
        unenforced: UNENFORCED_RULES,
      });
    }

    const signed = await this.db.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.SIGNED, vaultSigs: signaturesBase64 },
    });
    await this.audit(order.id, 'signature.accepted', { count: signaturesBase64.length });

    return {
      ...this.present(signed),
      // Named so nobody reads SIGNED as "sent".
      pending: ['The relayer has no key, so it cannot co-sign or broadcast this'],
    };
  }

  /** Marks a blockhash-bound order expired once it can no longer land. */
  private async expireIfStale(order: Order): Promise<Order> {
    const terminal: OrderStatus[] = [
      OrderStatus.CONFIRMED,
      OrderStatus.FAILED,
      OrderStatus.EXPIRED,
    ];
    if (terminal.includes(order.status)) return order;
    if (order.nonceAccount) return order; // A durable nonce does not expire.
    if (Date.now() - order.createdAt.getTime() < BLOCKHASH_ORDER_TTL_MS) return order;

    await this.audit(order.id, 'order.expired', { ageMs: Date.now() - order.createdAt.getTime() });
    return this.db.order.update({ where: { id: order.id }, data: { status: OrderStatus.EXPIRED } });
  }

  private present(order: Order, sizes?: number[], expiry?: string) {
    return {
      orderId: order.id,
      status: order.status,
      vault: order.vault,
      kind: order.kind,
      txMessages: order.txMessages,
      manifest: order.manifest,
      txSignatures: order.txSignatures,
      error: order.error,
      createdAt: order.createdAt.toISOString(),
      ...(sizes ? { sizes } : {}),
      ...(expiry ? { expiry } : {}),
    };
  }

  private async audit(orderId: string, type: string, detail: unknown) {
    await this.db.relayerEvent.create({
      data: { orderId, type, detail: detail as Prisma.InputJsonValue },
    });
  }
}
