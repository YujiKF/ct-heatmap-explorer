import http from 'node:http';
import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {inspectSeries,convertSeries,parseNpy,orthancId,sha256} from './orthanc-core.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
const localData=path.resolve(process.env.EXPLORER_DATA_DIR||path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'.local','share'),'PACS-InRad-Explorer'));
const host='127.0.0.1';
const port=Number(process.env.EXPLORER_PORT||8080);
const orthanc=(process.env.ORTHANC_URL||'http://127.0.0.1:8042').replace(/\/+$/,'');
if (!Number.isInteger(port)||port<1||port>65535) throw new Error('EXPLORER_PORT inválida.');
if (!/^https?:\/\//.test(orthanc)) throw new Error('ORTHANC_URL deve ser HTTP(S).');
const auth=process.env.ORTHANC_USER ? `Basic ${Buffer.from(`${process.env.ORTHANC_USER}:${process.env.ORTHANC_PASSWORD||''}`).toString('base64')}`:null;
const json=(res,status,body)=>send(res,status,JSON.stringify(body),'application/json; charset=utf-8');
function send(res,status,body,type='text/plain; charset=utf-8') {
  res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com; img-src 'self' data: blob:; font-src 'self' https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self'; connect-src 'self'; worker-src 'self' blob:"});res.end(body);
}
async function orthancGet(route, binary=false) {
  const response=await fetch(`${orthanc}${route}`,{headers:auth?{Authorization:auth}:{},signal:AbortSignal.timeout(120000)});
  if (!response.ok) throw new Error(`Orthanc respondeu HTTP ${response.status}.`);
  return binary?Buffer.from(await response.arrayBuffer()):response.json();
}
async function readJson(file,fallback) {try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
async function listSeries() {
  const ids=await orthancGet('/series');
  if(!Array.isArray(ids))throw new Error('Lista de séries do Orthanc inválida.');
  if(ids.length>1000)throw new Error('Mais de 1000 séries: limite a consulta antes de atualizar.');
  const out=[];
  const studies=new Map();
  for(let p=0;p<ids.length;p+=12) {
    const chunk=await Promise.all(ids.slice(p,p+12).map(id=>orthancGet(`/series/${encodeURIComponent(id)}`)));
    for(const s of chunk) if(s.MainDicomTags?.Modality==='CT' && s.Instances?.length>=2) {
      if(!studies.has(s.ParentStudy))studies.set(s.ParentStudy,orthancGet(`/studies/${s.ParentStudy}`));
      const study=await studies.get(s.ParentStudy);
      out.push({id:s.ID,description:s.MainDicomTags.SeriesDescription||'TC sem descrição',number:s.MainDicomTags.SeriesNumber||'',
        instances:s.Instances.length,studyId:s.ParentStudy,studyDate:study.MainDicomTags?.StudyDate||'',
        studyDescription:study.MainDicomTags?.StudyDescription||'',
        patientId:study.PatientMainDicomTags?.PatientID||'',patientName:study.PatientMainDicomTags?.PatientName||''});
    }
  }
  return out;
}
async function importSeries(id) {
  if(!orthancId(id))throw new Error('ID de série inválido.');
  const series=await orthancGet(`/series/${id}`);
  if(series.MainDicomTags?.Modality!=='CT'||!Array.isArray(series.Instances)||series.Instances.length<2)throw new Error('Selecione uma série de TC com pelo menos dois cortes.');
  const study=await orthancGet(`/studies/${series.ParentStudy}`);
  if(series.Instances.length>2000)throw new Error('Série excede 2000 instâncias.');
  const instances=[];
  for(let p=0;p<series.Instances.length;p+=12) {
    const part=await Promise.all(series.Instances.slice(p,p+12).map(async instanceId=>({id:instanceId,tags:await orthancGet(`/instances/${instanceId}/simplified-tags`)})));
    instances.push(...part);
  }
  for(const {tags} of instances) if(Number(tags.NumberOfFrames||1)!==1)throw new Error('TC multiframe ainda não é suportada.');
  const geometry=inspectSeries(instances);
  const identity=sha256(`${id}:${geometry.plane.map(x=>x.id).join(':')}`).slice(0,20);
  const caseId=`orthanc_${identity}`;
  const folder=path.join(localData,caseId);
  const manifestPath=path.join(folder,'manifest.json');
  try{await stat(manifestPath);
    const catalogPath=path.join(localData,'catalog.json');
    const catalog=await readJson(catalogPath,{schema_version:'pacs-inrad-catalog/1.0',cases:[]});
    if(!catalog.cases.some(c=>c.case_id===caseId)){
      const existing=await readJson(manifestPath);
      catalog.cases.push({case_id:caseId,title:existing.title,manifest:`${caseId}/manifest.json`,map_count:0,has_ct:true});
      await writeFile(catalogPath,JSON.stringify(catalog,null,2));
    }
    return {caseId,cached:true};
  }catch(e){if(e.code!=='ENOENT')throw e;}
  const converted=await convertSeries(geometry,async (instanceId,rows,cols)=>parseNpy(await orthancGet(`/instances/${instanceId}/numpy`,true),rows,cols));
  // A TC importada não depende de exames de demonstração nem traz resultados da IA.
  const classes=[{id:'ct',name_pt:'Tomografia',score:null,logit:null,threshold:null,comparator:'>=',decision:null,threshold_status:'not_supplied',heatmaps:[]}];
  const patient=study.PatientMainDicomTags?.PatientName||study.PatientMainDicomTags?.PatientID||'Paciente sem identificação';
  const title=`Orthanc · ${patient} · ${study.MainDicomTags?.StudyDate||'sem data'} · série ${series.MainDicomTags.SeriesNumber||''} ${series.MainDicomTags.SeriesDescription||'TC'}`.trim();
  const manifest={schema_version:'pacs-inrad-viewer/1.0',case_id:caseId,title,dataset:'Orthanc local',grid:converted.grid,ct:converted.ct,body_mask:null,classes,
    notices:['TC importada do Orthanc para visualização. Nenhum resultado ou mapa de atribuição da IA foi calculado.',
      'A grade DICOM foi validada como regular e alinhada aos eixos; o volume foi reduzido para exibição. Uso acadêmico.'],
    provenance:{source:'Orthanc local',orthanc_series_id:id,orthanc_study_id:series.ParentStudy,source_instances:geometry.plane.length,
      source_dimensions:geometry.dims,source_spacing_mm:geometry.spacing,source_ras_origin_mm:geometry.origin,
      transformations:['Decodificação do Orthanc em valores físicos com slope/intercept DICOM','Ordenação por ImagePositionPatient e normal de ImageOrientationPatient',
        'Reorientação por permutação e inversão de eixos para RAS','Redução trilinear com mapeamento de centros de voxel'],
      scores_and_thresholds_changed:false}};
  await mkdir(folder,{recursive:true});
  await writeFile(path.join(folder,'ct.f32.gz.bin'),converted.packed,{flag:'wx'});
  await writeFile(manifestPath,JSON.stringify(manifest,null,2),{flag:'wx'});
  const catalogPath=path.join(localData,'catalog.json');
  const catalog=await readJson(catalogPath,{schema_version:'pacs-inrad-catalog/1.0',cases:[]});
  if(!catalog.cases.some(c=>c.case_id===caseId))catalog.cases.push({case_id:caseId,title,manifest:`${caseId}/manifest.json`,map_count:0,has_ct:true});
  await writeFile(catalogPath,JSON.stringify(catalog,null,2));
  return {caseId,cached:false};
}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.bin':'application/octet-stream'};
async function serveFile(res,base,relative) {
  const file=path.resolve(base,relative);
  if(file!==base&&!file.startsWith(base+path.sep))return json(res,403,{error:'Caminho inválido.'});
  try{const body=await readFile(file);send(res,200,body,mime[path.extname(file)]||'application/octet-stream');}
  catch(e){if(e.code==='ENOENT')return json(res,404,{error:'Arquivo não encontrado.'});throw e;}
}
async function requestBody(req) {
  const parts=[];let total=0;
  for await(const part of req){total+=part.length;if(total>4096)throw new Error('Pedido muito grande.');parts.push(part);}
  return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
async function handler(req,res) {
  if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host))return json(res,403,{error:'Host inválido.'});
  const url=new URL(req.url,`http://${req.headers.host}`), pathname=url.pathname;
  if(req.method==='POST' && req.headers.origin && ![`http://127.0.0.1:${port}`,`http://localhost:${port}`].includes(req.headers.origin))return json(res,403,{error:'Origem inválida.'});
  if(req.method==='GET' && pathname==='/api/status') {
    try{const system=await orthancGet('/system');return json(res,200,{connected:true,orthancVersion:system.Version});}
    catch{return json(res,200,{connected:false});}
  }
  if(req.method==='GET' && pathname==='/api/orthanc/series')return json(res,200,{series:await listSeries()});
  if(req.method==='POST' && pathname==='/api/orthanc/import') {
    if(!req.headers['content-type']?.startsWith('application/json'))return json(res,415,{error:'Use application/json.'});
    const body=await requestBody(req);
    return json(res,200,await importSeries(body.seriesId));
  }
  if(req.method==='GET' && pathname==='/data/catalog.json') {
    const standard=await readJson(path.join(dist,'data','catalog.json'),{schema_version:'pacs-inrad-catalog/1.0',cases:[]});
    const local=await readJson(path.join(localData,'catalog.json'),{cases:[]});
    return json(res,200,{...standard,cases:[...standard.cases,...local.cases]});
  }
  if(req.method==='GET' && pathname.startsWith('/data/orthanc_'))return serveFile(res,localData,pathname.slice('/data/'.length));
  if(req.method==='GET')return serveFile(res,dist,pathname==='/'?'index.html':pathname.slice(1));
  return json(res,405,{error:'Método não permitido.'});
}
http.createServer((req,res)=>{handler(req,res).catch(e=>{if(!res.headersSent)json(res,500,{error:e instanceof Error?e.message:'Falha interna.'});});}).listen(port,host,()=>{
  process.stdout.write(`CT Heatmap Explorer + Orthanc: http://${host}:${port}\n`);
});
