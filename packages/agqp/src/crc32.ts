/** CRC-32 (IEEE 802.3, the zlib polynomial). Frame integrity check. */

const TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    // `& 0xff` bounds this to 0..255 and TABLE is 256 entries long, declared
    // twelve lines up. The assertion states that proof; a runtime check would
    // add a branch to a loop that runs once per byte of every frame.
    crc = TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
