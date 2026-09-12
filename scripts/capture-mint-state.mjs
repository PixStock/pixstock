/**
 * Records the state of every xStock mint, for the offline test suite.
 *
 * The multiplier, the scheduled multiplier, the permanent delegate and the
 * pause flag all live on chain and all change. Tests need fixed values; the
 * product needs live ones. So they are captured here and the live read is
 * asserted separately, against what this recorded.
 *
 *   node scripts/capture-mint-state.mjs > apps/relayer/test/mint-state.json
 */
import { Connection, PublicKey } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  getMint,
  getPausableConfig,
  getPermanentDelegate,
  getScaledUiAmountConfig,
} from "@solana/spl-token";
import { ASSETS } from "@pixstock/shared";

const rpc = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const connection = new Connection(rpc, "confirmed");

const states = [];
for (const asset of ASSETS) {
  const info = await getMint(connection, new PublicKey(asset.mint), "confirmed", TOKEN_2022_PROGRAM_ID);
  const scaled = getScaledUiAmountConfig(info);
  const delegate = getPermanentDelegate(info);
  states.push({
    symbol: asset.symbol,
    mint: asset.mint,
    multiplier: scaled ? Number(scaled.multiplier) : 1,
    nextMultiplier: scaled ? Number(scaled.newMultiplier) : 1,
    newMultiplierEffectiveTimestamp: scaled
      ? Number(scaled.newMultiplierEffectiveTimestamp)
      : null,
    permanentDelegate: delegate ? delegate.delegate.toBase58() : null,
    paused: getPausableConfig(info)?.paused ?? false,
  });
}

process.stdout.write(
  JSON.stringify({ capturedAt: Math.floor(Date.now() / 1000), cluster: rpc, states }, null, 2) + "\n",
);
