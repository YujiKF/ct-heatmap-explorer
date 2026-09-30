import test from 'node:test';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {inspectSeries,convertSeries,parseNpy} from '../local/orthanc-core.mjs';

const tags=(z,extra={})=>({Modality:'CT',Rows:'2',Columns:'2',ImageOrientationPatient:'1\\0\\0\\0\\1\\0',ImagePositionPatient:`100\\200\\${z}`,PixelSpacing:'2\\3',...extra});
const instances=[{id:'a',tags:tags(0)},{id:'b',tags:tags(4)}];
function npy(values){
  const header="{'descr': '<f4', 'fortran_order': False, 'shape': (1, 2, 2, 1), }";
  const length=10+header.length+1;
  const padded=header+' '.repeat((16-(length%16))%16)+'\n';
  const b=Buffer.alloc(10+padded.length+values.length*4);
  b.write('\x93NUMPY',0,'latin1');b[6]=1;b[7]=0;b.writeUInt16LE(padded.length,8);b.write(padded,10,'latin1');
  values.forEach((v,i)=>b.writeFloatLE(v,10+padded.length+i*4));return b;
}
test('NumPy float32 decoded without changing HU',()=>{
  assert.deepEqual(Array.from(parseNpy(npy([-1024,0,120,250]),2,2)),[-1024,0,120,250]);
  assert.throws(()=>parseNpy(npy([1,2,3,4]),3,2));
});
test('axial LPS series becomes regular RAS with correct flips and HU',async()=>{
  const g=inspectSeries([...instances].reverse());
  assert.deepEqual(g.dims,[2,2,2]);
  assert.deepEqual(g.spacing,[3,2,4]);
  assert.deepEqual(g.origin,[-103,-202,0]);
  const frames={a:Float32Array.from([1,2,3,4]),b:Float32Array.from([5,6,7,8])};
  const out=await convertSeries(g,async id=>frames[id]);
  assert.deepEqual(out.grid.dimensions,[2,2,2]);
  assert.deepEqual(out.grid.origin,[-103,-202,0]);
  const raw=gunzipSync(out.packed);
  assert.equal(raw.length,out.ct.byte_length);
  assert.deepEqual(Array.from({length:8},(_,i)=>raw.readFloatLE(i*4)),[4,3,2,1,8,7,6,5]);
});
test('reject irregular spacing and oblique series',()=>{
  assert.throws(()=>inspectSeries([{id:'a',tags:tags(0)},{id:'b',tags:tags(4)},{id:'c',tags:tags(9)}]),/espaçamento irregular/);
  const oblique='0.707107\\0.707107\\0\\-0.707107\\0.707107\\0';
  assert.throws(()=>inspectSeries([{id:'a',tags:tags(0,{ImageOrientationPatient:oblique})},{id:'b',tags:tags(4,{ImageOrientationPatient:oblique})}]),/oblíqua/);
});
