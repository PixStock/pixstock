/**
 * Offline verification of a Pyth Pro price message.
 *
 * This is the differentiator: the vault checks the market price against an
 * Ed25519 signature it can verify with no network, and refuses to sign when
 * the order's own amounts drift from the oracle's.
 *
 * Nothing here reaches the network, by construction — the trusted signers are
 * compiled in from `signers.ts`, and every input is bytes that arrived through
 * the camera.
 */

export {
  MalformedMessage,
  PAYLOAD_FORMAT_MAGIC,
  SOLANA_FORMAT_MAGIC,
  parsePayload,
  parseSolanaMessage,
  type FeedUpdate,
  type PayloadData,
  type SolanaMessage,
} from "./message.js";

export {
  PYTH_PROGRAM,
  PYTH_STORAGE,
  SIGNERS_READ_AT,
  TRUSTED_SIGNERS,
  findSigner,
  type TrustedSigner,
} from "./signers.js";

export {
  MAX_AGE_SECONDS,
  verify,
  type VerifyFailure,
  type VerifyOptions,
  type VerifyResult,
} from "./verify.js";

export {
  MAX_DEVIATION,
  WARN_DEVIATION,
  deviation,
  formatDeviation,
  impliedPrice,
  oraclePrice,
  severityOf,
  toDecimal,
  type LegPrice,
  type Side,
} from "./price.js";

export {
  checkAttestation,
  findFeed,
  permitsSigning,
  type AttestationInput,
  type AttestationStatus,
  type LegAttestation,
  type PricedLine,
} from "./status.js";
