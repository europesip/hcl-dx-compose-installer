// Minimal ZIP reader for the tests (stored and deflated entries), so no extra dependency is needed.
import {inflateRawSync} from "node:zlib";

export function unzipSync(buf){
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength), out = {};
  let end = buf.length - 22;
  while (end >= 0 && dv.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error("not a zip");
  const n = dv.getUint16(end + 10, true); let p = dv.getUint32(end + 16, true);
  for (let i = 0; i < n; i++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nlen));
    const lnlen = dv.getUint16(off + 26, true), lxlen = dv.getUint16(off + 28, true), start = off + 30 + lnlen + lxlen;
    const data = buf.subarray(start, start + csize);
    out[name] = method === 8 ? new Uint8Array(inflateRawSync(data)) : data;
    p += 46 + nlen + xlen + clen;
  }
  return out;
}
export const strFromU8 = u => new TextDecoder().decode(u);
