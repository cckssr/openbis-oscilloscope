/** Minimal NumPy `.npy` (format 1.0) writer for 1-D float64 arrays. */

const MAGIC = [0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59]; // \x93NUMPY

/**
 * Serialises a 1-D array as little-endian float64 `.npy` (version 1.0). The
 * header is padded with spaces and ends in `\n` so the data starts at a
 * multiple of 64 bytes, as NumPy does.
 * @param data - Values to store
 * @returns The bytes of the `.npy` file
 */
export function toNpy(data: Float64Array): Uint8Array {
  const dict = `{'descr': '<f8', 'fortran_order': False, 'shape': (${data.length},), }`;
  const unpadded = 10 + dict.length + 1;
  const padding = (64 - (unpadded % 64)) % 64;
  const header = `${dict}${" ".repeat(padding)}\n`;
  const out = new Uint8Array(10 + header.length + data.length * 8);
  out.set(MAGIC, 0);
  out[6] = 1; // major
  out[7] = 0; // minor
  const view = new DataView(out.buffer);
  view.setUint16(8, header.length, true);
  for (let i = 0; i < header.length; i++) out[10 + i] = header.charCodeAt(i);
  const offset = 10 + header.length;
  // DataView writes explicit little-endian regardless of platform byte order.
  for (let i = 0; i < data.length; i++) view.setFloat64(offset + i * 8, data[i], true);
  return out;
}
