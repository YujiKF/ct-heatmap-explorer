import type {Asset, LoadedCase, Scalars, Heatmap, Catalog} from './types';
import {validateManifest} from './validate';
import {sha256} from '@noble/hashes/sha2.js';
export async function loadCatalog(): Promise<Catalog> {
  const r=await fetch('/data/catalog.json');if(!r.ok)throw new Error('Catálogo indisponível.');
  const c=await r.json();if(c.schema_version!=='pacs-inrad-catalog/1.0'||!Array.isArray(c.cases))throw new Error('Catálogo inválido.');return c;
}
export async function loadAsset(a: Asset, manifestUrl: string, signal: AbortSignal): Promise<Scalars> {
  const url=new URL(a.url,manifestUrl);
  if(url.origin!==window.location.origin)throw new Error('Assets devem estar na mesma origem.');
  const res=await fetch(url,{signal});if(!res.ok)throw new Error(`Volume não encontrado: ${a.url} (${res.status}).`);
  const packed=await res.arrayBuffer();
  const signature=new Uint8Array(packed,0,Math.min(packed.byteLength,2));
  // Some static servers transparently decode .gz via HTTP Content-Encoding.
  const bytes=a.encoding==='gzip' && signature[0]===0x1f && signature[1]===0x8b ? await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer() : packed;
  if(signal.aborted)throw new DOMException('Aborted','AbortError');
  if(bytes.byteLength!==a.byte_length)throw new Error('Tamanho do volume diverge do manifesto.');
  const hash=Array.from(sha256(new Uint8Array(bytes)),x=>x.toString(16).padStart(2,'0')).join('');
  if(hash!==a.sha256)throw new Error('SHA-256 inválido. O volume não será exibido.');
  // Explicit little endian decoding also works on big endian hosts.
  const d=new DataView(bytes);
  if(a.dtype==='uint8')return new Uint8Array(bytes);
  if(a.dtype==='int16')return Int16Array.from({length:bytes.byteLength/2},(_,i)=>d.getInt16(i*2,true));
  const out=Float32Array.from({length:bytes.byteLength/4},(_,i)=>d.getFloat32(i*4,true));
  if(!out.every(Number.isFinite))throw new Error('Volume contém valores não finitos.');return out;
}
export function scaled(a: Scalars, descriptor: Asset): Float32Array {
  const result=Float32Array.from(a,v=>v*descriptor.scale+descriptor.offset);
  if(!result.every(Number.isFinite))throw new Error('Escala do volume produz valores não finitos.');return result;
}
export async function loadCase(path: string, signal: AbortSignal): Promise<LoadedCase> {
  const url=new URL(path,new URL('/data/',window.location.href)).href;
  const r=await fetch(url,{signal});if(!r.ok)throw new Error('Manifesto indisponível.');
  const manifest=validateManifest(await r.json());
  const [ct,body]=await Promise.all([
    manifest.ct?loadAsset(manifest.ct,url,signal).then(v=>scaled(v,manifest.ct!)):null,
    manifest.body_mask?loadAsset(manifest.body_mask,url,signal).then(v=>{
      if(!v.every(x=>x===0||x===1))throw new Error('Máscara deve conter somente 0 e 1.');return Uint8Array.from(v);
    }):null,
  ]);
  return {manifest,url,ct,body};
}
export async function loadHeatmap(h: Heatmap, url: string, signal: AbortSignal) {
  const raw=scaled(await loadAsset(h.data,url,signal),h.data);
  const max=h.display_range[1];
  if(!raw.every(v=>Number.isFinite(v)&&v>=0&&v<=max+1e-5))throw new Error('Atribuição fora do domínio declarado.');
  // Only the declared display transform. Never normalize from the observed maximum.
  return Float32Array.from(raw,v=>v/max);
}
