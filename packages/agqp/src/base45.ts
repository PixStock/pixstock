/**
 * Base45 (RFC 9285) — the encoding behind EU digital COVID certificates.
 *
 * Chosen because `BarcodeDetector` hands back a *string*, so raw bytes would
 * be mangled. Base45 maps onto the QR alphanumeric mode and costs ~3% over
 * raw bytes, against +33% for Base64. See docs/AGQP-SPEC.md.
 */

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

const REVERSE = (() => {
  const map = new Map<string, number>();
  for (let i = 0; i < ALPHABET.length; i++) map.set(ALPHABET[i], i);
  return map;
})();

export function toBase45(bytes: Uint8Array): string {
  let out = "";
  let i = 0;

  for (; i + 1 < bytes.length; i += 2) {
    const value = bytes[i] * 256 + bytes[i + 1];
    const e = Math.floor(value / (45 * 45));
    const rest = value % (45 * 45);
    const d = Math.floor(rest / 45);
    const c = rest % 45;
    out += ALPHABET[c] + ALPHABET[d] + ALPHABET[e];
  }

  if (i < bytes.length) {
    const value = bytes[i];
    out += ALPHABET[value % 45] + ALPHABET[Math.floor(value / 45)];
  }

  return out;
}

export function fromBase45(text: string): Uint8Array {
  const values: number[] = [];
  for (const char of text) {
    const value = REVERSE.get(char);
    if (value === undefined) {
      throw new Error(`base45: character ${JSON.stringify(char)} is outside the alphabet`);
    }
    values.push(value);
  }

  if (values.length % 3 === 1) {
    throw new Error("base45: truncated input (length % 3 === 1)");
  }

  const out: number[] = [];
  let i = 0;

  for (; i + 2 < values.length; i += 3) {
    const value = values[i] + values[i + 1] * 45 + values[i + 2] * 45 * 45;
    if (value > 0xffff) throw new Error("base45: chunk overflows 16 bits");
    out.push(value >> 8, value & 0xff);
  }

  if (i < values.length) {
    const value = values[i] + values[i + 1] * 45;
    if (value > 0xff) throw new Error("base45: final chunk overflows 8 bits");
    out.push(value);
  }

  return Uint8Array.from(out);
}
