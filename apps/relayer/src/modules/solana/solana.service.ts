import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AddressLookupTableAccount, Connection, PublicKey } from '@solana/web3.js';

@Injectable()
export class SolanaService {
  private readonly logger = new Logger(SolanaService.name);
  private readonly connection: Connection;

  /**
   * Lookup tables are append-only and change rarely, so one fetch per address
   * per process is enough. Without this cache every order build would make an
   * RPC round trip for data that has not moved.
   */
  private readonly lookupTables = new Map<string, AddressLookupTableAccount>();

  constructor(private readonly config: ConfigService) {
    this.connection = new Connection(config.get<string>('solana.rpcUrl')!, 'confirmed');
  }

  get rpc(): Connection {
    return this.connection;
  }

  /** The endpoint's host, for error messages. Never the key in the query. */
  private get endpointName(): string {
    try {
      return new URL(this.connection.rpcEndpoint).host;
    } catch {
      return 'the configured RPC';
    }
  }

  /**
   * Resolves address lookup tables by address.
   *
   * Jupiter names the tables its route uses but returns their contents empty,
   * so they have to be read from chain. It matters more than it sounds: a
   * table moves eleven accounts out of the message at 32 bytes each, and
   * without it a single swap grows by roughly 350 bytes — enough to push a
   * two-leg basket past the transaction limit.
   */
  async getLookupTables(addresses: string[]): Promise<AddressLookupTableAccount[]> {
    const missing = addresses.filter((address) => !this.lookupTables.has(address));

    if (missing.length > 0) {
      let accounts;
      try {
        accounts = await this.connection.getMultipleAccountsInfo(
          missing.map((address) => new PublicKey(address)),
        );
      } catch (err) {
        // An unconfigured RPC fails here, and the message it produces on its
        // own — "401 Unauthorized: missing api key" surfacing as a 500 — says
        // nothing about what to do next.
        throw new ServiceUnavailableException(
          `Cannot read address lookup tables from ${this.endpointName}: ${(err as Error).message}. ` +
            'Set SOLANA_RPC_URL to a working endpoint.',
        );
      }

      missing.forEach((address, i) => {
        const account = accounts[i];
        if (!account) {
          this.logger.warn(`Lookup table ${address} not found; its accounts stay inline`);
          return;
        }
        this.lookupTables.set(
          address,
          new AddressLookupTableAccount({
            key: new PublicKey(address),
            state: AddressLookupTableAccount.deserialize(account.data),
          }),
        );
      });
    }

    return addresses
      .map((address) => this.lookupTables.get(address))
      .filter((table): table is AddressLookupTableAccount => table !== undefined);
  }
}
