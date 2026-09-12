import {
  AddressLookupTableAccount,
  PublicKey,
  TransactionInstruction,
} from '@solana/web3.js';

/** Jupiter's wire shape for an instruction. */
export interface JupiterInstruction {
  programId: string;
  accounts: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
  data: string;
}

export interface SwapInstructions {
  computeBudgetInstructions: JupiterInstruction[];
  setupInstructions: JupiterInstruction[];
  swapInstruction: JupiterInstruction;
  cleanupInstruction: JupiterInstruction | null;
  otherInstructions: JupiterInstruction[];
  addressLookupTableAddresses: string[];
  /**
   * Jupiter hands back the contents of every lookup table it used, so the
   * relayer can compile a v0 message without a round trip to an RPC node.
   */
  addressesByLookupTableAddress?: Record<string, string[]>;
}

export function toInstruction(ix: JupiterInstruction): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.accounts.map((account) => ({
      pubkey: new PublicKey(account.pubkey),
      isSigner: account.isSigner,
      isWritable: account.isWritable,
    })),
    data: Buffer.from(ix.data, 'base64'),
  });
}

/**
 * Rebuilds the lookup table accounts from what Jupiter returned.
 *
 * Only `addresses` is read when compiling a v0 message; the slot fields exist
 * to satisfy the type and are never consulted.
 */
export function toLookupTables(swap: SwapInstructions): AddressLookupTableAccount[] {
  const byAddress = swap.addressesByLookupTableAddress ?? {};

  return swap.addressLookupTableAddresses
    .filter((address) => byAddress[address])
    .map(
      (address) =>
        new AddressLookupTableAccount({
          key: new PublicKey(address),
          state: {
            deactivationSlot: 2n ** 64n - 1n,
            lastExtendedSlot: 0,
            lastExtendedSlotStartIndex: 0,
            addresses: byAddress[address]!.map((a) => new PublicKey(a)),
          },
        }),
    );
}
