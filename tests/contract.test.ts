import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {validateManifest,compareFinding} from '../src/data/validate';
import {axes,index,planeToVoxel,centerOnPlane,world,displayHeat,planeName,clipAllowsIndex,clipBoundary} from '../src/rendering/geometry';
import {DEFAULT_SETTINGS,type Asset,type Vec3} from '../src/data/types';
const root=new URL('../public/data/',import.meta.url);
const read=(path:string)=>JSON.parse(readFileSync(new URL(path,root),'utf8'));
const fixturesAvailable=existsSync(new URL('catalog.json',root));
const catalog=fixturesAvailable?read('catalog.json'):{cases:[]};
test('All five real manifests and all 32 binary assets pass size, finite and SHA-256 checks',{skip:!fixturesAvailable},()=>{
  let count=0;
  for(const c of catalog.cases){
    const m=validateManifest(read(c.manifest));
    const assets=[m.ct,m.body_mask,...m.classes.flatMap(x=>x.heatmaps.map(h=>h.data))].filter(Boolean) as Asset[];
    for(const a of assets){const raw=gunzipSync(readFileSync(new URL(c.case_id+'/'+a.url,root)));assert.equal(raw.length,a.byte_length);assert.equal(createHash('sha256').update(raw).digest('hex'),a.sha256);count++}
  }
  assert.equal(count,32);
});
test('All 18 scores/thresholds/decisions equal source; unrelated CT cases have null results',{skip:!fixturesAvailable},()=>{
  const source=read('valid_1174/scores-source.json'),m=validateManifest(read('valid_1174/manifest.json'));
  for(const row of source.rows){const c=m.classes.find(x=>x.id===String(row.indice_classe))!;assert.equal(c.score,row.score);assert.equal(c.threshold,row.threshold);assert.equal(compareFinding(c),row.acima_corte)}
  for(const c of catalog.cases.filter((c:{has_ct:boolean})=>c.has_ct))assert.ok(read(c.manifest).classes.every((x:{score:null;threshold:null})=>x.score===null&&x.threshold===null));
});
test('Synchronized planes address the same landmark; no reversal of storage order',()=>{
  const d:Vec3=[7,9,11],pos:Vec3=[2,3,5];
  assert.equal(index(...pos,d),338);
  for(const p of ['axial','coronal','sagittal'] as const){const [a,b]=axes[p];assert.deepEqual(planeToVoxel(p,pos[a],d[b]-1-pos[b],pos,d),pos)}
});
test('Unknown geometry, corrupted lengths, conflicting decisions, invalid versions rejected',{skip:!fixturesAvailable},()=>{
  const original=read('valid_1092/manifest.json');
  let m=structuredClone(original);m.ct.byte_length++;assert.throws(()=>validateManifest(m),/tamanho/);
  m=structuredClone(original);m.grid.spacing=[1,1,1];assert.throws(()=>validateManifest(m),/index/);
  m=read('valid_1174/manifest.json');m.classes[0].decision=!m.classes[0].decision;assert.throws(()=>validateManifest(m),/decisão/);
  m=structuredClone(original);const c=m.classes.find((x:{heatmaps:unknown[]})=>x.heatmaps.length);c.heatmaps.push(structuredClone(c.heatmaps[0]));assert.throws(()=>validateManifest(m),/versão/);
});
test('Raw displays positive out-of-body attribution; optional mask and visual cutoff affect display only',{skip:!fixturesAvailable},()=>{
  assert.equal(DEFAULT_SETTINGS.masked,false);assert.equal(DEFAULT_SETTINGS.visualThreshold,0);
  assert.equal(displayHeat(.2,0,DEFAULT_SETTINGS),true);
  assert.equal(displayHeat(.2,0,{...DEFAULT_SETTINGS,masked:true}),false);
  assert.equal(displayHeat(.2,1,{...DEFAULT_SETTINGS,visualThreshold:.5}),false);
  const c=read('valid_1174/manifest.json').classes[9],before=structuredClone(c);
  for(const t of [0,.5,1]){displayHeat(.9,0,{...DEFAULT_SETTINGS,visualThreshold:t});assert.equal(compareFinding(c),true)}
  assert.deepEqual(c,before);
});
test('Known RAS spacing and origin produce physical coordinates',()=>{
  const grid={dimensions:[7,9,11] as Vec3,space:'RAS' as const,spacing:[.5,1,2] as Vec3,origin:[-10,-20,30] as Vec3,orientation:['R','A','S'] as const,affine:[[.5,0,0,-10],[0,1,0,-20],[0,0,2,30],[0,0,0,1]],geometry_verified:true};
  assert.deepEqual(world([2,3,5],grid),[-9,-17,40]);
  assert.equal(planeName('axial',grid),'Axial');
});
test('Index-only data uses conventional plane aliases without changing its coordinates',{skip:!fixturesAvailable},()=>{
  const grid=validateManifest(read('valid_1092/manifest.json')).grid!;
  assert.deepEqual(['axial','coronal','sagittal'].map(p=>planeName(p as keyof typeof axes,grid)),['Axial','Coronal','Sagital']);
  assert.equal(grid.geometry_verified,false);
  assert.deepEqual(world([2,3,5],grid),[2,3,5]);
});
test('Asymmetric phantom fixes axis order and detects reflection or rotation',()=>{
  const d:Vec3=[3,4,5],pos:Vec3=[1,2,3];
  const ct=Int16Array.from({length:60},(_,i)=>{const x=i%3,y=Math.floor(i/3)%4,z=Math.floor(i/12);return 100*x+10*y+z});
  const heat=Uint8Array.from(ct,v=>v%251);
  const expected:{[key:string]:number[][]}={
    axial:[[33,133,233],[23,123,223],[13,113,213],[3,103,203]],
    coronal:[[24,124,224],[23,123,223],[22,122,222],[21,121,221],[20,120,220]],
    sagittal:[[104,114,124,134],[103,113,123,133],[102,112,122,132],[101,111,121,131],[100,110,120,130]],
  };
  for(const plane of ['axial','coronal','sagittal'] as const){
    const [a,b]=axes[plane];
    const actual=Array.from({length:d[b]},(_,v)=>Array.from({length:d[a]},(_,u)=>ct[index(...planeToVoxel(plane,u,v,pos,d),d)]));
    assert.deepEqual(actual,expected[plane]);
    for(let v=0;v<d[b];v++)for(let u=0;u<d[a];u++){
      const voxel=planeToVoxel(plane,u,v,pos,d),k=index(...voxel,d);
      assert.equal(heat[k],ct[k]%251);
    }
  }
});
test('Native select options specify readable light foreground and background',()=>{
  const css=readFileSync(new URL('../src/light.css',import.meta.url),'utf8');
  assert.match(css,/select option, select optgroup \{ background: #ffffff; color: #23394d; \}/);
  function lum(hex:string){const rgb=hex.match(/\w\w/g)!.map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]}
  assert.ok((lum('ffffff')+.05)/(lum('23394d')+.05)>7);
});
test('Individual center keeps the selected slice while centering only its two in-plane axes',()=>{
  const dims:Vec3=[9,11,13],start:Vec3=[1,2,3];
  assert.deepEqual(centerOnPlane('axial',start,dims),[4,5,3]);
  assert.deepEqual(centerOnPlane('coronal',start,dims),[4,2,6]);
  assert.deepEqual(centerOnPlane('sagittal',start,dims),[1,5,6]);
  assert.deepEqual(start,[1,2,3]);
});
test('3D cut follows the same voxel coordinate as the three 2D sliders',{skip:!fixturesAvailable},()=>{
  const grid=validateManifest(read('valid_1092/manifest.json')).grid!;
  for(const axis of [0,1,2] as const){
    const p=7;
    const lower={axis,position:p,side:'lower' as const},upper={axis,position:p,side:'upper' as const};
    assert.equal(clipBoundary(lower,grid).coordinate,p+.5);
    assert.equal(clipBoundary(upper,grid).coordinate,p-.5);
    assert.equal(clipBoundary(lower,grid).normal,-1);
    assert.equal(clipBoundary(upper,grid).normal,1);
    assert.equal(clipAllowsIndex(p,lower),true);
    assert.equal(clipAllowsIndex(p,upper),true);
    assert.equal(clipAllowsIndex(p+1,lower),false);
    assert.equal(clipAllowsIndex(p-1,upper),false);
  }
});
