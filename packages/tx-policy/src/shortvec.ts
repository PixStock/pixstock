/**
 * Solana's compact-u16 ("shortvec"): a length prefix in one to three bytes,
 * seven bits each, high bit meaning "another byte follows".
 */

export interface ShortVec {
  value: number;
  bytesRead: number;
}

export function decodeShortVec(bytes: Uint8Array, offset: number): ShortVec {
  let value = 0;
  let bytesRead = 0;

  for (;;) {
    if (offset + bytesRead >= bytes.length) {
      throw new Error("tx-policy: truncated length prefix");
    }
    const byte = bytes[offset + bytesRead]!;
    value |= (byte & 0x7f) << (7 * bytesRead);
    bytesRead++;

    if ((byte & 0x80) === 0) break;
    if (bytesRead > 3) throw new Error("tx-policy: length prefix longer than three bytes");
  }

  return { value, bytesRead };
}

export function encodeShortVec(value: number): Uint8Array {
  if (value < 0 || value > 0xffff) {
    throw new Error(`tx-policy: ${value} is out of compact-u16 range`);
  }

  const out: number[] = [];
  let remaining = value;
  for (;;) {
    const byte = remaining & 0x7f;
    remaining >>= 7;
    if (remaining === 0) {
      out.push(byte);
      break;
    }
    out.push(byte | 0x80);
  }
  return Uint8Array.from(out);
}
