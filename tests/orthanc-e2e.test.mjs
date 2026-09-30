import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {sha256} from '../local/orthanc-core.mjs';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const seriesId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ids=['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','cccccccc-cccc-cccc-cccc-cccccccccccc'];
const tags=z=>({Modality:'CT',Rows:'2',Columns:'2',ImageOrientationPatient:'1\\0\\0\\0\\1\\0',ImagePositionPatient:`100\\200\\${z}`,PixelSpacing:'2\\3'});
function npy(values){
  const header="{'descr': '<f4', 'fortran_order': False, 'shape': (1, 2, 2, 1), }";
  const padded=header+' '.repeat((16-((10+header.length+1)%16))%16)+'\n';
  const b=Buffer.alloc(10+padded.length+values.length*4);b.write('\x93NUMPY',0,'latin1');b[6]=1;b.writeUInt16LE(padded.length,8);b.write(padded,10,'latin1');
  values.forEach((v,i)=>b.writeFloatLE(v,10+padded.length+i*4));return b;
}
function json(res,value){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(value));}
async function listen(server){await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return server.address().port;}
async function ready(url){for(let i=0;i<60;i++){try{const r=await fetch(url);if(r.ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('Servidor local não iniciou.');}

test('manual Orthanc import works end to end and keeps data outside the site',async()=>{
  const mock=http.createServer((req,res)=>{
    const u=req.url;
    if(u==='/system')return json(res,{Version:'1.13.0'});
    if(u==='/series')return json(res,[seriesId]);
    if(u===`/series/${seriesId}`)return json(res,{ID:seriesId,MainDicomTags:{Modality:'CT',SeriesDescription:'Phantom',SeriesNumber:'1'},Instances:ids,ParentStudy:'study-test'});
    if(u==='/studies/study-test')return json(res,{MainDicomTags:{StudyDate:'20260925'},PatientMainDicomTags:{PatientName:'TEST^PHANTOM',PatientID:'TEST'}});
    for(let i=0;i<2;i++){
      if(u===`/instances/${ids[i]}/simplified-tags`)return json(res,tags(i*4));
      if(u===`/instances/${ids[i]}/numpy`){res.writeHead(200,{'Content-Type':'application/octet-stream'});return res.end(npy(i?[5,6,7,8]:[1,2,3,4]));}
    }
    res.writeHead(404);res.end();
  });
  const mockPort=await listen(mock);
  const testDir=await mkdtemp(path.join(tmpdir(),'pacs-orthanc-test-'));
  const probe=http.createServer();const appPort=await listen(probe);await new Promise(resolve=>probe.close(resolve));
  const child=spawn(process.execPath,['local/server.mjs'],{cwd:project,env:{...process.env,ORTHANC_URL:`http://127.0.0.1:${mockPort}`,EXPLORER_PORT:String(appPort),EXPLORER_DATA_DIR:testDir},stdio:'ignore'});
  const app=`http://127.0.0.1:${appPort}`;
  try{
    await ready(`${app}/api/status`);
    const emptyCatalog=await (await fetch(`${app}/data/catalog.json`)).json();
    assert.deepEqual(emptyCatalog.cases,[]);
    const listed=await (await fetch(`${app}/api/orthanc/series`)).json();
    assert.equal(listed.series.length,1);
    const r=await fetch(`${app}/api/orthanc/import`,{method:'POST',headers:{'Content-Type':'application/json',Origin:app},body:JSON.stringify({seriesId})});
    assert.equal(r.status,200,await r.text());
    // Fetch a second time because the body above is consumed only when a failure message is constructed.
    const catalog=await (await fetch(`${app}/data/catalog.json`)).json();
    const entry=catalog.cases.find(c=>c.case_id.startsWith('orthanc_'));
    assert.ok(entry);
    const manifest=await (await fetch(`${app}/data/${entry.manifest}`)).json();
    assert.deepEqual(manifest.grid.dimensions,[2,2,2]);
    assert.deepEqual(manifest.grid.spacing,[3,2,4]);
    assert.equal(manifest.classes.length,1);
    assert.equal(manifest.classes.every(c=>c.score===null&&c.heatmaps.length===0),true);
    const packed=Buffer.from(await (await fetch(`${app}/data/${entry.case_id}/ct.f32.gz.bin`)).arrayBuffer());
    const raw=gunzipSync(packed);
    assert.equal(sha256(raw),manifest.ct.sha256);
    assert.deepEqual(Array.from({length:8},(_,i)=>raw.readFloatLE(i*4)),[4,3,2,1,8,7,6,5]);
    assert.ok((await readFile(path.join(testDir,entry.case_id,'manifest.json'))).length>0);
    const again=await fetch(`${app}/api/orthanc/import`,{method:'POST',headers:{'Content-Type':'application/json',Origin:app},body:JSON.stringify({seriesId})});
    assert.equal((await again.json()).cached,true);
  }finally{
    child.kill();await new Promise(resolve=>mock.close(resolve));
    const base=path.resolve(tmpdir())+path.sep,actual=path.resolve(testDir);
    if(!actual.startsWith(base))throw new Error('Pasta temporária fora do diretório esperado.');
    await rm(actual,{recursive:true,force:true});
  }
});
