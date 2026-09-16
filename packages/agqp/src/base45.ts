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
  [...ALPHABET].forEach((char, i) => map.set(char, i));
  return map;
})();

/**
 * An indexed read whose bound is stated rather than asserted away.
 *
 * `noUncheckedIndexedAccess` is on and this file is where it earns its keep:
 * the input arrives from a camera. Most reads below sit inside a bound the
 * loop above them just established — but the last one in `fromBase45` relies
 * on a guard ten lines earlier (`length % 3 === 1` is what makes the tail's
 * `i + 1` safe), and that is the kind of proof that rots without anyone
 * noticing. A `!` would hide all of them equally well, including that one.
 */
function at<T>(list: ArrayLike<T>, index: number, what: string): T {
  const value = list[index];
  if (value === undefined) throw new Error(`base45: ${what} ${index} is out of range`);
  return value;
}

export function toBase45(bytes: Uint8Array): string {
  let out = "";
  let i = 0;

  for (; i + 1 < bytes.length; i += 2) {
    const value = at(bytes, i, "byte") * 256 + at(bytes, i + 1, "byte");
    const e = Math.floor(value / (45 * 45));
    const rest = value % (45 * 45);
    const d = Math.floor(rest / 45);
    const c = rest % 45;
    out += at(ALPHABET, c, "value") + at(ALPHABET, d, "value") + at(ALPHABET, e, "value");
  }

  if (i < bytes.length) {
    const value = at(bytes, i, "byte");
    out += at(ALPHABET, value % 45, "value") + at(ALPHABET, Math.floor(value / 45), "value");
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
    const value =
      at(values, i, "digit") + at(values, i + 1, "digit") * 45 + at(values, i + 2, "digit") * 45 * 45;
    if (value > 0xffff) throw new Error("base45: chunk overflows 16 bits");
    out.push(value >> 8, value & 0xff);
  }

  if (i < values.length) {
    const value = at(values, i, "digit") + at(values, i + 1, "digit") * 45;
    if (value > 0xff) throw new Error("base45: final chunk overflows 8 bits");
    out.push(value);
  }

  return Uint8Array.from(out);
}
