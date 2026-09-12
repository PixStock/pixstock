import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Keypair, VersionedMessage, VersionedTransaction } from '@solana/web3.js';
import { parseSecretKey } from '../../config';
import { SolanaService } from '../solana/solana.service';

export interface SimulationResult {
  ok: boolean;
  /** Compute units the transaction actually used. */
  unitsConsumed?: number;
  /** The program error, when it failed. */
  error?: string;
  /** Program logs, trimmed. The useful part of a failure. */
  logs: string[];
}

export interface BroadcastResult {
  signature: string;
}

/**
 * Custody of the hot key: co-signing, simulating, and — only when explicitly
 * enabled — sending.
 *
 * The key pays fees and the rent of token accounts. It is never a token
 * authority and never signs a transfer; R3 checks that before this service is
 * ever asked to add a signature.
 */
@Injectable()
export class RelayerService {
  private readonly logger = new Logger(RelayerService.name);
  private readonly keypair: Keypair | null;

  constructor(
    private readonly config: ConfigService,
    private readonly solana: SolanaService,
  ) {
    const bytes = parseSecretKey(config.get<string>('relayer.secretKey') ?? '');
    this.keypair = bytes ? Keypair.fromSeed(bytes.slice(0, 32)) : null;
  }

  get canSign(): boolean {
    return this.keypair !== null;
  }

  get canBroadcast(): boolean {
    return this.canSign && this.config.get<boolean>('relayer.allowBroadcast') === true;
  }

  get publicKey(): string | null {
    return this.keypair?.publicKey.toBase58() ?? null;
  }

  /**
   * Assembles the signed transaction: the vault's signature plus the
   * relayer's, each in the slot the message assigned it.
   */
  private assemble(messageBytes: Uint8Array, vaultSignature: Uint8Array): VersionedTransaction {
    if (!this.keypair) throw new Error('relayer: no key configured');

    const message = VersionedMessage.deserialize(Buffer.from(messageBytes));
    const transaction = new VersionedTransaction(message);

    const signers = message.staticAccountKeys.slice(0, message.header.numRequiredSignatures);
    const relayerIndex = signers.findIndex((key) => key.equals(this.keypair!.publicKey));
    if (relayerIndex < 0) {
      // R3 should have caught this already; failing here means the checks and
      // the signing disagree, which is worse than either being wrong.
      throw new Error('relayer: this key is not a required signer of that message');
    }

    // Whichever slot is not ours is the vault's.
    const vaultIndex = signers.findIndex((_, i) => i !== relayerIndex);
    transaction.signatures[vaultIndex] = Buffer.from(vaultSignature);
    transaction.sign([this.keypair]);

    return transaction;
  }

  /**
   * Runs the transaction against a node without sending it.
   *
   * Free, and the only way to know whether an order would actually execute
   * before spending anything on it. The blockhash is replaced because a stored
   * order's is usually stale by now, and signature validity is R2's job — what
   * this answers is whether the instructions work.
   */
  async simulate(messageBytes: Uint8Array, vaultSignature: Uint8Array): Promise<SimulationResult> {
    const transaction = this.assemble(messageBytes, vaultSignature);

    const response = await this.solana.rpc.simulateTransaction(transaction, {
      replaceRecentBlockhash: true,
      sigVerify: false,
      commitment: 'confirmed',
    });

    const logs = (response.value.logs ?? []).slice(-25);

    if (response.value.err) {
      return {
        ok: false,
        error: JSON.stringify(response.value.err),
        logs,
      };
    }

    return {
      ok: true,
      unitsConsumed: response.value.unitsConsumed,
      logs,
    };
  }

  /**
   * Sends it. Spends real SOL, and cannot be undone.
   *
   * Refuses unless RELAYER_ALLOW_BROADCAST is explicitly true — the default is
   * off precisely because every other method here is reversible and this one
   * is not.
   */
  async broadcast(messageBytes: Uint8Array, vaultSignature: Uint8Array): Promise<BroadcastResult> {
    if (!this.canBroadcast) {
      throw new Error(
        'relayer: broadcasting is disabled. Set RELAYER_ALLOW_BROADCAST=true to enable it.',
      );
    }

    const transaction = this.assemble(messageBytes, vaultSignature);
    const signature = await this.solana.rpc.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });

    this.logger.log(`Broadcast ${signature}`);
    return { signature };
  }

  /** Lamports the hot key holds. Used by the health check and the balance alert. */
  async balance(): Promise<number | null> {
    if (!this.keypair) return null;
    try {
      return await this.solana.rpc.getBalance(this.keypair.publicKey);
    } catch {
      return null;
    }
  }
}
