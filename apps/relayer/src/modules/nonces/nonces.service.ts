import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Keypair,
  NONCE_ACCOUNT_LENGTH,
  NonceAccount,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import { parseSecretKey } from '../../config';
import { DatabaseService } from '../../database/database.service';
import { SolanaService } from '../solana/solana.service';

export interface ReservedNonce {
  account: string;
  authority: string;
  /** The nonce's current value, which stands in for a recent blockhash. */
  value: string;
}

export interface NonceStatus {
  pubkey: string;
  inUse: boolean;
  orderId: string | null;
  /** False when the account is recorded but no longer on chain. */
  onChain: boolean;
  value: string | null;
}

/**
 * The pool of durable nonces.
 *
 * A message tied to a recent blockhash dies in about ninety seconds — less
 * time than it takes to scan a screen, read an order ticket and confirm with a
 * fingerprint. A durable nonce removes that clock entirely: the signature stays
 * valid until the nonce is advanced, which happens as the transaction lands.
 *
 * That is why the design calls for one, and it is the single thing standing
 * between the current ninety-second expiry and an order someone can take their
 * time over.
 */
@Injectable()
export class NoncesService {
  private readonly logger = new Logger(NoncesService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly solana: SolanaService,
    private readonly config: ConfigService,
  ) {}

  private get keypair(): Keypair | null {
    const bytes = parseSecretKey(this.config.get<string>('relayer.secretKey') ?? '');
    return bytes ? Keypair.fromSeed(bytes.slice(0, 32)) : null;
  }

  /** Creating nonce accounts spends SOL, so it is off by the same gate as sending. */
  get canCreate(): boolean {
    return this.keypair !== null && this.config.get<boolean>('relayer.allowBroadcast') === true;
  }

  /**
   * Takes a free nonce and marks it in use.
   *
   * Returns null when the pool is empty, and the caller falls back to a
   * blockhash — with the short life that implies, which the order says.
   */
  async reserve(orderId: string): Promise<ReservedNonce | null> {
    const authority = this.keypair?.publicKey.toBase58();
    if (!authority) return null;

    const free = await this.db.nonceAccount.findFirst({ where: { inUse: false } });
    if (!free) return null;

    const value = await this.readValue(free.pubkey, authority);
    if (!value) {
      // Recorded but gone, or no longer ours. Drop it rather than hand out a
      // nonce that would make every signature invalid.
      await this.db.nonceAccount.delete({ where: { pubkey: free.pubkey } });
      this.logger.warn(`Dropped ${free.pubkey}: not a nonce account we control`);
      return this.reserve(orderId);
    }

    await this.db.nonceAccount.update({
      where: { pubkey: free.pubkey },
      data: { inUse: true, orderId, lastValue: value },
    });

    return { account: free.pubkey, authority, value };
  }

  /** Puts a nonce back, whether the order succeeded or not. */
  async release(orderId: string): Promise<void> {
    await this.db.nonceAccount.updateMany({
      where: { orderId },
      data: { inUse: false, orderId: null },
    });
  }

  async status(): Promise<NonceStatus[]> {
    const authority = this.keypair?.publicKey.toBase58() ?? '';
    const recorded = await this.db.nonceAccount.findMany({ orderBy: { pubkey: 'asc' } });

    return Promise.all(
      recorded.map(async (nonce) => ({
        pubkey: nonce.pubkey,
        inUse: nonce.inUse,
        orderId: nonce.orderId,
        value: await this.readValue(nonce.pubkey, authority),
        onChain: (await this.readValue(nonce.pubkey, authority)) !== null,
      })),
    );
  }

  /** Lamports of rent one nonce account costs, from the cluster itself. */
  async rentPerAccount(): Promise<number> {
    return this.solana.rpc.getMinimumBalanceForRentExemption(NONCE_ACCOUNT_LENGTH);
  }

  /**
   * Creates nonce accounts and records them.
   *
   * Spends roughly 0.0015 SOL of rent each, and is therefore behind the same
   * switch as broadcasting: real, irreversible spending is never a side effect
   * of a service starting up.
   */
  async create(count: number): Promise<string[]> {
    const payer = this.keypair;
    if (!payer) throw new Error('nonces: no relayer key configured');
    if (!this.canCreate) {
      throw new Error(
        'nonces: creating accounts spends SOL and is disabled. ' +
          'Set RELAYER_ALLOW_BROADCAST=true to enable it.',
      );
    }

    const rent =
      await this.solana.rpc.getMinimumBalanceForRentExemption(NONCE_ACCOUNT_LENGTH);
    const created: string[] = [];

    for (let i = 0; i < count; i++) {
      const nonce = Keypair.generate();
      const transaction = new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: payer.publicKey,
          newAccountPubkey: nonce.publicKey,
          lamports: rent,
          space: NONCE_ACCOUNT_LENGTH,
          programId: SystemProgram.programId,
        }),
        SystemProgram.nonceInitialize({
          noncePubkey: nonce.publicKey,
          authorizedPubkey: payer.publicKey,
        }),
      );

      const { blockhash } = await this.solana.rpc.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = payer.publicKey;
      transaction.sign(payer, nonce);

      const signature = await this.solana.rpc.sendRawTransaction(transaction.serialize());
      await this.solana.rpc.confirmTransaction(signature, 'confirmed');

      await this.db.nonceAccount.create({ data: { pubkey: nonce.publicKey.toBase58() } });
      created.push(nonce.publicKey.toBase58());
      this.logger.log(`Created nonce account ${nonce.publicKey.toBase58()}`);
    }

    return created;
  }

  /** The nonce's current value, or null if it is not a nonce we control. */
  private async readValue(pubkey: string, authority: string): Promise<string | null> {
    try {
      const info = await this.solana.rpc.getAccountInfo(new PublicKey(pubkey), 'confirmed');
      if (!info) return null;

      const nonce = NonceAccount.fromAccountData(info.data);
      if (nonce.authorizedPubkey.toBase58() !== authority) return null;
      return nonce.nonce;
    } catch {
      return null;
    }
  }
}
