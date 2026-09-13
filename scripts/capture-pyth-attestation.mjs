/**
 * Captures a real signed price message from the Pyth Pro router.
 *
 * The vault's whole argument is that it can verify a price offline. That
 * claim is only worth what the bytes are worth, so this records a message
 * Pyth actually signed — and the test suite verifies it against the signers
 * published on chain, with no network and no leniency.
 *
 *   node scripts/capture-pyth-attestation.mjs > packages/pyth-verify/test/attestation.json
 *
 * Needs PYTH_PRO_TOKEN. The signed `solana` payload is served by the router
 * endpoints only — the SDK's default "api service" stream does not carry it.
 */
import { readFileSync } from "node:fs";
import WebSocket from "ws";
import { ASSETS } from "@pixstock/shared";

const env = readEnv("apps/relayer/.env");
const TOKEN = process.env.PYTH_PRO_TOKEN ?? env.PYTH_PRO_TOKEN ?? "";
const URLS = (process.env.PYTH_ROUTER_URLS ?? env.PYTH_ROUTER_URLS ?? "")
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);

if (!TOKEN) {
  console.error("PYTH_PRO_TOKEN is not set. Get one from pythdata.app.");
  process.exit(1);
}
if (URLS.length === 0) {
  console.error("PYTH_ROUTER_URLS is not set.");
  process.exit(1);
}

/**
 * Which feeds to ask for.
 *
 * By default every feed the product prices. A token's grant may not cover all
 * of them, and an extended-hours feed is inactive while its session is
 * closed — the router refuses the whole subscription if any one feed is
 * unavailable, so pass the ones you want:
 *
 *   node scripts/capture-pyth-attestation.mjs 1435
 */
const FEED_IDS = process.argv[2]
  ? process.argv[2].split(",").map(Number)
  : [
      ...new Set(
        ASSETS.flatMap((asset) => [asset.pythFeedId, asset.pythExtFeedId]).filter(Boolean),
      ),
    ];

const capture = (url) =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`${url}: no signed update within 20s`));
    }, 20_000);

    const finish = (value, error) => {
      clearTimeout(timer);
      socket.close();
      error ? reject(error) : resolve(value);
    };

    socket.on("open", () =>
      socket.send(
        JSON.stringify({
          type: "subscribe",
          subscriptionId: 1,
          priceFeedIds: FEED_IDS,
          properties: ["price", "exponent", "confidence", "publisherCount"],
          formats: ["solana"],
          deliveryFormat: "json",
          jsonBinaryEncoding: "hex",
          channel: "real_time",
        }),
      ),
    );

    socket.on("message", (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (message.type === "error" || message.error) {
        finish(null, new Error(`${url}: ${raw.toString().slice(0, 2000)}`));
        return;
      }

      const hex = message.solana?.data ?? message.parsed?.solana?.data;
      if (typeof hex === "string" && hex.length > 0) {
        finish({ url, hex, receivedAt: new Date().toISOString(), raw: message });
      }
    });

    socket.on("error", (err) => finish(null, new Error(`${url}: ${err.message}`)));
    socket.on("close", (code, reason) =>
      finish(null, new Error(`${url}: closed ${code} ${reason?.toString() ?? ""}`)),
    );
  });

let captured = null;
const failures = [];
for (const url of URLS) {
  try {
    captured = await capture(url);
    break;
  } catch (err) {
    failures.push(err.message);
  }
}

if (!captured) {
  console.error(`No router answered.\n  ${failures.join("\n  ")}`);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      capturedAt: captured.receivedAt,
      router: captured.url,
      feedIds: FEED_IDS,
      /** The `solana` format message, hex. Signature, signer and payload. */
      solanaHex: captured.hex,
    },
    null,
    2,
  ),
);

function readEnv(path) {
  try {
    return Object.fromEntries(
      readFileSync(path, "utf8")
        .split("\n")
        .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
        .map((line) => {
          const at = line.indexOf("=");
          return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
        }),
    );
  } catch {
    return {};
  }
}
