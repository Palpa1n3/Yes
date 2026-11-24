/** A tiny read-only zip reader (mod .jar files): list entries and read one, using Node's zlib.
 *  Enough for fabric.mod.json and jars bundled inside jars; no writing, no zip64. */
import { inflateRawSync } from 'node:zlib';

export interface ZipEntry {
  name: string;
  method: number;
  compSize: number;
  size: number;
  localOffset: number;
}

/** The entries from the central directory (empty if it isn't a zip). */
export function zipEntries(buf: Buffer): ZipEntry[] {
  // End of central directory: signature 0x06054b50, within the last 64 KB + 22 bytes.
  const min = Math.max(0, buf.length - 65_557);
  let eocd = -1;
  for (let i = buf.length - 22; i >= min; i--)
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) return [];
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out: ZipEntry[] = [];
  for (let n = 0; n < count && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    out.push({ name, method, compSize, size, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/** One entry's bytes (stored or deflated); null if it can't be read. */
export function zipRead(buf: Buffer, e: ZipEntry): Buffer | null {
  try {
    const p = e.localOffset;
    if (buf.readUInt32LE(p) !== 0x04034b50) return null;
    const start = p + 30 + buf.readUInt16LE(p + 26) + buf.readUInt16LE(p + 28);
    const data = buf.subarray(start, start + e.compSize);
    if (e.method === 0) return Buffer.from(data);
    if (e.method === 8) return inflateRawSync(data);
    return null;
  } catch {
    return null;
  }
}

/** Read a named file from a zip buffer. */
export function zipFile(buf: Buffer, name: string): Buffer | null {
  const e = zipEntries(buf).find((x) => x.name === name);
  return e ? zipRead(buf, e) : null;
}
