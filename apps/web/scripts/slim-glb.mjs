/**
 * Strip textures, images, samplers and UV sets from a .glb and repack its binary buffer.
 * The hologram shader ignores materials, so a model only needs positions, normals and indices.
 *
 *   node apps/web/scripts/slim-glb.mjs in.glb out.glb
 */
import { readFileSync, writeFileSync } from "node:fs";

const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) {
  console.error("usage: slim-glb.mjs <in.glb> <out.glb>");
  process.exit(1);
}
const src = readFileSync(inPath);
if (src.readUInt32LE(0) !== 0x46546c67) throw new Error("not a glb");
const jsonLen = src.readUInt32LE(12);
const json = JSON.parse(src.subarray(20, 20 + jsonLen).toString("utf8"));
const binStart = 20 + jsonLen + 8;
const bin = src.subarray(binStart, binStart + src.readUInt32LE(20 + jsonLen));

// Drop everything texture-related.
delete json.images;
delete json.textures;
delete json.samplers;
for (const m of json.materials ?? []) {
  delete m.normalTexture;
  delete m.occlusionTexture;
  delete m.emissiveTexture;
  if (m.pbrMetallicRoughness) {
    delete m.pbrMetallicRoughness.baseColorTexture;
    delete m.pbrMetallicRoughness.metallicRoughnessTexture;
  }
  if (m.extensions) for (const ext of Object.values(m.extensions)) for (const k of Object.keys(ext)) if (/Texture$/.test(k)) delete ext[k];
}
for (const mesh of json.meshes ?? []) {
  for (const p of mesh.primitives) {
    for (const k of Object.keys(p.attributes)) if (k.startsWith("TEXCOORD") || k.startsWith("COLOR") || k === "TANGENT") delete p.attributes[k];
    delete p.material;
  }
}
delete json.materials;

// Keep only the accessors still referenced, then only the bufferViews they use.
const usedAccessors = new Set();
for (const mesh of json.meshes ?? []) for (const p of mesh.primitives) {
  for (const a of Object.values(p.attributes)) usedAccessors.add(a);
  if (p.indices != null) usedAccessors.add(p.indices);
  for (const t of p.targets ?? []) for (const a of Object.values(t)) usedAccessors.add(a);
}
for (const s of json.skins ?? []) if (s.inverseBindMatrices != null) usedAccessors.add(s.inverseBindMatrices);
for (const an of json.animations ?? []) for (const s of an.samplers) { usedAccessors.add(s.input); usedAccessors.add(s.output); }
const accMap = new Map();
json.accessors = (json.accessors ?? []).filter((_, i) => usedAccessors.has(i)).map((a, ni) => a);
let ni = 0;
for (let i = 0; i < (usedAccessors.size ? Infinity : 0); i++) { if (ni >= json.accessors.length) break; if (usedAccessors.has(i)) accMap.set(i, ni++); }
const remapAcc = (i) => accMap.get(i);
for (const mesh of json.meshes ?? []) for (const p of mesh.primitives) {
  for (const k of Object.keys(p.attributes)) p.attributes[k] = remapAcc(p.attributes[k]);
  if (p.indices != null) p.indices = remapAcc(p.indices);
  for (const t of p.targets ?? []) for (const k of Object.keys(t)) t[k] = remapAcc(t[k]);
}
for (const s of json.skins ?? []) if (s.inverseBindMatrices != null) s.inverseBindMatrices = remapAcc(s.inverseBindMatrices);
for (const an of json.animations ?? []) for (const s of an.samplers) { s.input = remapAcc(s.input); s.output = remapAcc(s.output); }

const usedViews = new Set(json.accessors.map((a) => a.bufferView).filter((v) => v != null));
const chunks = [];
const viewMap = new Map();
let offset = 0;
json.bufferViews = (json.bufferViews ?? []).map((v, i) => ({ v, i })).filter(({ i }) => usedViews.has(i)).map(({ v, i }, n) => {
  const data = bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength);
  const pad = (4 - (offset % 4)) % 4;
  if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
  viewMap.set(i, n);
  const nv = { ...v, buffer: 0, byteOffset: offset };
  chunks.push(data);
  offset += v.byteLength;
  return nv;
});
for (const a of json.accessors) if (a.bufferView != null) a.bufferView = viewMap.get(a.bufferView);
const newBin = Buffer.concat(chunks);
const binPadded = Buffer.concat([newBin, Buffer.alloc((4 - (newBin.length % 4)) % 4)]);
json.buffers = [{ byteLength: binPadded.length }];

const jsonBuf = Buffer.from(JSON.stringify(json), "utf8");
const jsonPadded = Buffer.concat([jsonBuf, Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20)]);
const total = 12 + 8 + jsonPadded.length + 8 + binPadded.length;
const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(total, 8);
const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonPadded.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
const bh = Buffer.alloc(8); bh.writeUInt32LE(binPadded.length, 0); bh.writeUInt32LE(0x004e4942, 4);
writeFileSync(outPath, Buffer.concat([header, jh, jsonPadded, bh, binPadded]));
console.log(`${inPath} ${(src.length / 1e6).toFixed(1)} MB → ${outPath} ${(total / 1e6).toFixed(1)} MB (${json.accessors.length} accessors, ${json.bufferViews.length} buffer views)`);
