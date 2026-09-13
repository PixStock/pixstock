import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createId } from '@paralleldrive/cuid2';
import { OrderStatus, type Order, type Prisma } from '@prisma/client';
import { decimalsOfMint, symbolOfMint } from '@pixstock/shared';
import { DatabaseService } from '../../database/database.service';
import { MintStateService } from '../market/mint-state.service';
import { NoncesService } from '../nonces/nonces.service';
import { PythService } from '../pyth/pyth.service';
import { RelayerService, type ConfirmResult } from '../relayer/relayer.service';
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
    private readonly relayer: RelayerService,
    private readonly nonces: NoncesService,
    private readonly mints: MintStateService,
    private readonly pyth: PythService,
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

    // A durable nonce removes the ninety-second clock. Without one the order
    // still works, but it has to be scanned and confirmed inside a blockhash's
    // life, and the response says which it got.
    const orderId = createId();
    const nonce = await this.nonces.reserve(orderId);

    const built = await this.builder.build({
      vault: dto.vault,
      feePayer: relayer,
      legs: dto.legs,
      slippageBps: dto.slippageBps,
      ...(nonce ? { nonce } : {}),
    });

    // The multiplier is on the mint, and the device that has to display it is
    // in airplane mode. So it is read here and carried — see P11 in
    // packages/tx-policy for what the vault is able to check about it.
    const facts = await this.mintFacts(built.legs);

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
      mints: facts,
    };

    // The signed price, if the stream has a current one. The relayer cannot
    // vouch for it and does not try: it carries bytes it cannot forge from
    // Pyth to a phone with no network, and the phone decides.
    const attestation = this.pyth.attestation();

    const order = await this.db.order.create({
      data: {
        id: orderId,
        vault: dto.vault,
        kind: built.kind,
        manifest: manifest as unknown as Prisma.InputJsonValue,
        attestation: attestation ? Buffer.from(attestation.bytes).toString('base64') : null,
        txMessages: built.messages.map((m) => Buffer.from(m).toString('base64')),
        // Recorded now so a signature can be checked against the message this
        // relayer built, not against whatever comes back later.
        messageHashes: built.messages.map(sha256Hex),
        nonceAccount: nonce?.account ?? '',
        status: OrderStatus.AWAITING_SIGNATURE,
      },
    });

    await this.audit(order.id, 'order.built', {
      sizes: built.sizes,
      expiry: built.expiry,
      legs: built.legs.length,
      nonceAccount: nonce?.account ?? null,
      attestedFeeds: attestation?.feedIds ?? [],
    });

    return this.present(order, built.sizes, built.expiry);
  }

  /**
   * Mint state for every scaling mint the order touches.
   *
   * A failure here fails the order. The alternative is an order whose ticket
   * shows amounts that are quietly wrong, and the vault refuses those anyway
   * under P11 — better to say so now, with the reason, than after a scan.
   */
  private async mintFacts(legs: Array<{ inMint: string; outMint: string }>) {
    try {
      return await this.mints.factsFor(legs.flatMap((leg) => [leg.inMint, leg.outMint]));
    } catch (err) {
      throw new ServiceUnavailableException(
        `Could not read the mints this order touches, so its amounts cannot be shown correctly: ${(err as Error).message}`,
      );
    }
  }

  async find(id: string) {
    const order = await this.db.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException(`No order ${id}`);
    return this.present(await this.refreshIfInFlight(await this.expireIfStale(order)));
  }

  /**
   * Takes the vault's signature, checks it, and sends the transaction.
   *
   * The order of operations is the whole safety argument: the policy runs
   * before anything is stored, the simulation runs before anything is spent,
   * and the broadcast runs only if the simulation agreed. An order that gets
   * as far as SIGNED but no further always says why — a status of BROADCAST
   * that never reached a validator would be worse than useless.
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

    // R6 — would this actually execute? Costs nothing, changes nothing, and
    // is the only honest answer available before spending anything.
    const simulation = this.relayer.canSign
      ? await this.simulate(signed.id, order.txMessages[0]!, signaturesBase64[0]!)
      : null;

    // A simulation that failed is a transaction that would fail on chain, at
    // the relayer's expense. It is never sent.
    const sent =
      simulation?.ok && this.relayer.canBroadcast
        ? await this.send(signed, signaturesBase64)
        : null;

    return {
      ...this.present(sent ?? signed),
      ...(simulation ? { simulation } : {}),
      // Named so nobody reads SIGNED as "sent". The reason matters: a missing
      // key and a refused simulation are different problems with different
      // fixes, and saying the wrong one sends someone looking in the wrong
      // place.
      pending: this.pendingReasons(simulation),
    };
  }

  /**
   * Sends every message of the order, in order, and records what happened.
   *
   * A basket normally fits in one transaction; when it does not, the second
   * only goes out if the first was accepted, and a partial send is recorded
   * as such — with the signatures that did leave — rather than rolled up into
   * a single word.
   */
  private async send(order: Order, signaturesBase64: string[]): Promise<Order> {
    const signatures: string[] = [];

    for (let i = 0; i < order.txMessages.length; i++) {
      try {
        const { signature } = await this.relayer.broadcast(
          Uint8Array.from(Buffer.from(order.txMessages[i]!, 'base64')),
          Uint8Array.from(Buffer.from(signaturesBase64[i]!, 'base64')),
        );
        signatures.push(signature);
        await this.audit(order.id, 'order.broadcast', { signature, index: i });
      } catch (err) {
        const message = (err as Error).message;
        this.logger.error(`Broadcast of ${order.id} failed at message ${i}: ${message}`);
        await this.audit(order.id, 'broadcast.failed', { index: i, message, signatures });
        return this.db.order.update({
          where: { id: order.id },
          data: {
            status: OrderStatus.FAILED,
            txSignatures: signatures,
            error:
              signatures.length > 0
                ? `Sent ${signatures.length} of ${order.txMessages.length} transactions, then: ${message}`
                : message,
          },
        });
      }
    }

    const broadcast = await this.db.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.BROADCAST, txSignatures: signatures },
    });

    // Confirmation takes about a second, and the caller should not wait on
    // it: the signature is already a fact, and a read of the order settles
    // the row on its own if this process dies before the cluster answers.
    void this.settle(broadcast).catch((err: Error) =>
      this.logger.error(`Settling ${order.id} failed: ${err.message}`),
    );

    return broadcast;
  }

  /**
   * Asks the cluster what became of the signatures and writes the answer down.
   *
   * "Not seen yet" is left alone deliberately: the next read asks again, and
   * an order that is genuinely in flight must not be filed as failed because
   * one poll was early.
   */
  private async settle(order: Order): Promise<Order> {
    if (order.txSignatures.length === 0) return order;

    const results = await Promise.all(
      order.txSignatures.map((signature) => this.relayer.confirm(signature)),
    );
    return this.recordOutcome(order, results);
  }

  /**
   * Asks the cluster about an order that is still in flight, once.
   *
   * A read of an order should be fast, so this polls rather than waits; an
   * order the cluster has not seen yet stays exactly as it was.
   */
  private async refreshIfInFlight(order: Order): Promise<Order> {
    if (order.status !== OrderStatus.BROADCAST || order.txSignatures.length === 0) return order;
    try {
      const results = await Promise.all(
        order.txSignatures.map((signature) => this.relayer.status(signature)),
      );
      return await this.recordOutcome(order, results);
    } catch (err) {
      // An unreachable RPC leaves the order exactly as it was.
      this.logger.warn(`Could not refresh ${order.id}: ${(err as Error).message}`);
      return order;
    }
  }

  /** Turns what the cluster said into a terminal status, or leaves it pending. */
  private async recordOutcome(order: Order, results: ConfirmResult[]): Promise<Order> {
    const failed = results.find((result) => result.error);
    if (failed) {
      await this.audit(order.id, 'order.failed', { error: failed.error });
      await this.nonces.release(order.id);
      return this.db.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.FAILED, error: `The cluster rejected it: ${failed.error}` },
      });
    }

    if (results.some((result) => result.pending)) return order;

    await this.audit(order.id, 'order.confirmed', {
      signatures: order.txSignatures,
      slots: results.map((result) => result.slot),
    });
    await this.nonces.release(order.id);
    return this.db.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.CONFIRMED },
    });
  }

  /** Why an order that is SIGNED has not been sent. */
  private pendingReasons(simulation: { ok: boolean; error?: string } | null): string[] {
    if (!this.relayer.canSign) return ['The relayer has no key, so it cannot co-sign this'];
    if (simulation && !simulation.ok) {
      return [
        'It was not sent: the simulation says it would fail on chain ' +
          `(${simulation.error ?? 'no reason given'}).`,
      ];
    }
    if (!this.relayer.canBroadcast) {
      return [
        'Broadcasting is off. It spends real SOL and cannot be undone, ' +
          'so it stays disabled until RELAYER_ALLOW_BROADCAST is set.',
      ];
    }
    return [];
  }

  private async simulate(orderId: string, messageBase64: string, signatureBase64: string) {
    try {
      const result = await this.relayer.simulate(
        Uint8Array.from(Buffer.from(messageBase64, 'base64')),
        Uint8Array.from(Buffer.from(signatureBase64, 'base64')),
      );
      await this.audit(orderId, result.ok ? 'simulation.ok' : 'simulation.failed', {
        error: result.error,
        unitsConsumed: result.unitsConsumed,
      });
      return result;
    } catch (err) {
      // A simulation that could not run is not a simulation that passed.
      const message = (err as Error).message;
      await this.audit(orderId, 'simulation.unavailable', { message });
      return { ok: false, error: `Simulation could not run: ${message}`, logs: [] };
    }
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
    await this.nonces.release(order.id);
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
      // Base64 of the `solana` message Pyth signed, or null. The web app
      // passes it across the gap untouched; editing it would only break a
      // signature it cannot make.
      attestation: order.attestation,
      txSignatures: order.txSignatures,
      // Built here rather than in the browser: only this process knows which
      // cluster the order was built against, and a link to the wrong explorer
      // is a link that says the transaction does not exist.
      explorerUrls: order.txSignatures.map((signature) => this.explorerUrl(signature)),
      error: order.error,
      createdAt: order.createdAt.toISOString(),
      ...(sizes ? { sizes } : {}),
      ...(expiry ? { expiry } : {}),
    };
  }

  /** Where a holder can go and look at the transaction themselves. */
  private explorerUrl(signature: string): string {
    const cluster = this.config.get<string>('solana.cluster');
    return cluster === 'mainnet-beta'
      ? `https://solscan.io/tx/${signature}`
      : `https://solscan.io/tx/${signature}?cluster=${cluster ?? 'devnet'}`;
  }

  private async audit(orderId: string, type: string, detail: unknown) {
    await this.db.relayerEvent.create({
      data: { orderId, type, detail: detail as Prisma.InputJsonValue },
    });
  }
}
