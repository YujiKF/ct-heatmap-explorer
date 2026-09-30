import {useEffect,useRef,useState,lazy,Suspense} from 'react';
import {Activity,Box,ChevronRight,CircleHelp,Database,FileWarning,Info,RefreshCw,ScanLine,X,Link2,ShieldCheck} from 'lucide-react';
import {loadCatalog,loadCase,loadHeatmap} from './data/loader';
import {DEFAULT_SETTINGS,type CatalogEntry,type LoadedCase,type Vec3,type ViewSettings} from './data/types';
import {world,type VolumeClip} from './rendering/geometry';
import Controls from './components/Controls';
import SliceView from './components/SliceView';
const VolumeView=lazy(()=>import('./components/VolumeView'));
const fmt=(n:number)=>Number.isInteger(n)?String(n):n.toFixed(1);
type OrthancSeries={id:string;description:string;number:string;instances:number;patientId:string;patientName:string;studyDate:string;studyDescription:string};

export default function App(){
  const [catalog,setCatalog]=useState<CatalogEntry[]>([]),[caseId,setCaseId]=useState('');
  const [data,setData]=useState<LoadedCase|null>(null),[error,setError]=useState('');
  const [classId,setClassId]=useState('7'),[version,setVersion]=useState('');
  const [heatState,setHeatState]=useState<{key:string;data:Float32Array}|null>(null);
  const [heatError,setHeatError]=useState(''),[heatPending,setHeatPending]=useState(false);
  const [settings,setSettings]=useState<ViewSettings>(DEFAULT_SETTINGS),[pos,setPos]=useState<Vec3>([0,0,0]);
  const [show3D,setShow3D]=useState(true);
  const [clipPlane,setClipPlane]=useState<'off'|'i'|'j'|'k'>('off');
  const [clipSide,setClipSide]=useState<'lower'|'upper'>('lower');
  const [retry,setRetry]=useState(0);const about=useRef<HTMLDialogElement>(null);
  const [orthancSeries,setOrthancSeries]=useState<OrthancSeries[]>([]),[orthancSelected,setOrthancSelected]=useState('');
  const [orthancOpen,setOrthancOpen]=useState(false),[orthancBusy,setOrthancBusy]=useState(false),[orthancError,setOrthancError]=useState('');
  const cache=useRef(new Map<string,Float32Array>());
  useEffect(()=>{loadCatalog().then(c=>{setCatalog(c.cases);setCaseId(currentId=>c.cases.some(x=>x.case_id===currentId)?currentId:c.cases[0]?.case_id??'')}).catch(e=>setError(e.message))},[]);
  async function refreshOrthanc(){
    setOrthancOpen(true);setOrthancBusy(true);setOrthancError('');
    try{const r=await fetch('/api/orthanc/series',{cache:'no-store'});const body=await r.json();if(!r.ok)throw new Error(body.error||'Falha ao consultar o Orthanc.');
      setOrthancSeries(body.series);setOrthancSelected(body.series[0]?.id??'');
    }catch(e){setOrthancError(e instanceof Error?e.message:String(e));setOrthancSeries([])}finally{setOrthancBusy(false)}
  }
  async function openOrthancSeries(){
    if(!orthancSelected)return;setOrthancBusy(true);setOrthancError('');
    try{const r=await fetch('/api/orthanc/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({seriesId:orthancSelected})});
      const body=await r.json();if(!r.ok)throw new Error(body.error||'Falha ao importar a série.');
      const updated=await loadCatalog();setCatalog(updated.cases);setCaseId(body.caseId);setOrthancOpen(false);
    }catch(e){setOrthancError(e instanceof Error?e.message:String(e))}finally{setOrthancBusy(false)}
  }
  const entry=catalog.find(c=>c.case_id===caseId);
  useEffect(()=>{
    if(!entry)return;const controller=new AbortController();setData(null);setError('');setHeatState(null);setShow3D(true);setClipPlane('off');cache.current.clear();
    loadCase(entry.manifest,controller.signal).then(next=>{
      if(controller.signal.aborted)return;
      const initial=next.manifest.classes.find(c=>c.id==='7'&&c.heatmaps.length)??next.manifest.classes.find(c=>c.heatmaps.length)??next.manifest.classes[1]??next.manifest.classes[0];
      setClassId(initial.id);setVersion(initial.heatmaps[0]?.version??'');
      setPos(next.manifest.grid?.dimensions.map(n=>Math.floor(n/2)) as Vec3??[0,0,0]);
      setSettings({...DEFAULT_SETTINGS,heat:next.manifest.dataset==='Orthanc local'?false:DEFAULT_SETTINGS.heat});setData(next);
    }).catch(e=>{if(!controller.signal.aborted)setError(e.message)});
    return()=>controller.abort();
  },[entry,retry]);
  // Prevent even one frame of the previous patient's volume after selecting a case.
  const current=data?.manifest.case_id===caseId?data:null;
  const finding=current?.manifest.classes.find(c=>c.id===classId);
  const map=finding?.heatmaps.find(h=>h.version===version)??finding?.heatmaps[0];
  const heatKey=current&&map?`${current.manifest.case_id}/${classId}/${map.version}/${map.data.sha256}`:'';
  const heat=heatState?.key===heatKey?heatState.data:null;
  useEffect(()=>{
    setHeatError('');setHeatPending(false);
    if(!current||!map){setHeatState(null);return}
    const existing=cache.current.get(heatKey);
    if(existing){setHeatState({key:heatKey,data:existing});return}
    const controller=new AbortController();setHeatPending(true);
    loadHeatmap(map,current.url,controller.signal).then(array=>{
      if(controller.signal.aborted)return;
      cache.current.set(heatKey,array);while(cache.current.size>2)cache.current.delete(cache.current.keys().next().value!);
      setHeatState({key:heatKey,data:array});setHeatPending(false);
    }).catch(e=>{if(!controller.signal.aborted){setHeatError(e.message);setHeatPending(false)}});
    return()=>controller.abort();
  },[current,map,heatKey]);
  const stateRef=useRef({});
  stateRef.current={case_id:current?.manifest.case_id??null,class_id:classId,heatmap_version:map?.version??null,heatmap_ready:!!heat,settings,position:pos,geometry:current?.manifest.grid??null};
  useEffect(()=>{
    const context=(document as unknown as {modelContext?:{registerTool:(tool:unknown,options:unknown)=>void|Promise<void>}}).modelContext;
    if(!context?.registerTool)return;const controller=new AbortController();
    try{void Promise.resolve(context.registerTool({name:'read_pacs_viewer_state',title:'Ler estado do CT Heatmap Explorer',description:'Lê o caso, a classe, a versão, a geometria e os ajustes visuais atualmente exibidos. Não altera scores, thresholds ou estado.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:(input:unknown)=>{if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)throw new Error('Nenhum parâmetro é aceito.');return stateRef.current}},{signal:controller.signal})).catch(()=>{})}catch{/* Optional browser capability. */}
    return()=>controller.abort();
  },[]);
  const position=current?.manifest.grid?world(pos,current.manifest.grid):pos;
  const clipAxis:0|1|2|null=clipPlane==='i'?0:clipPlane==='j'?1:clipPlane==='k'?2:null;
  const clip:VolumeClip|null=clipAxis===null?null:{axis:clipAxis,position:pos[clipAxis],side:clipSide};
  return <div className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark"><Box size={24} strokeWidth={1.6}/></span><strong>CT <span>Heatmap</span></strong><span className="brand-divider"/><span className="product-name">Explorer</span></div><div className="header-actions"><span className="research-badge">PESQUISA</span><button className="icon-button" aria-label="Sobre os dados e como usar" title="Sobre os dados e como usar" onClick={()=>about.current?.showModal()}><CircleHelp size={20}/></button></div></header>
    <div className="casebar"><div className="breadcrumb"><Activity size={17}/><span>CT Heatmap Explorer</span><ChevronRight size={14}/><strong>Explorar exame</strong></div><div className="case-picker"><Database size={16}/><label htmlFor="case">Caso</label><select id="case" value={caseId} onChange={e=>setCaseId(e.target.value)}>{!catalog.length&&<option value="">Nenhum exame carregado</option>}<optgroup label="Orthanc local · TC sem resultados da IA">{catalog.filter(c=>c.case_id.startsWith('orthanc_')).map(c=><option key={c.case_id} value={c.case_id}>{c.title}</option>)}</optgroup><optgroup label="Demonstração · TC e mapas">{catalog.filter(c=>c.has_ct&&!c.case_id.startsWith('orthanc_')).map(c=><option key={c.case_id} value={c.case_id}>{c.title}</option>)}</optgroup><optgroup label="Somente resultados · sem TC">{catalog.filter(c=>!c.has_ct).map(c=><option key={c.case_id} value={c.case_id}>{c.title}</option>)}</optgroup></select>{caseId&&<span className="dataset">{caseId.startsWith('orthanc_')?'ORTHANC':'DADOS LOCAIS'}</span>}<button className="orthanc-button" onClick={refreshOrthanc} disabled={orthancBusy}><RefreshCw size={15}/> Atualizar do Orthanc</button></div></div>
    {orthancOpen&&<div className="orthanc-panel" role="region" aria-label="Importar série de TC do Orthanc"><div className="orthanc-panel-heading"><strong>Séries de TC no Orthanc local</strong><button className="icon-button" aria-label="Fechar seleção do Orthanc" onClick={()=>setOrthancOpen(false)}><X size={17}/></button></div>{orthancBusy?<p role="status">Consultando ou preparando volume…</p>:orthancSeries.length?<div className="orthanc-panel-actions"><label htmlFor="orthanc-series">Série</label><select id="orthanc-series" value={orthancSelected} onChange={e=>setOrthancSelected(e.target.value)}>{orthancSeries.map(s=><option key={s.id} value={s.id}>{s.patientName||s.patientId||'Paciente sem identificação'} · {s.studyDate||'sem data'} · {s.description} · {s.instances} cortes</option>)}</select><button className="primary-button" onClick={openOrthancSeries}>Abrir TC no Explorer</button></div>:<p>Nenhuma série de TC com pelo menos dois cortes foi encontrada.</p>}{orthancError&&<p className="orthanc-error" role="alert">{orthancError}</p>}<p className="orthanc-help">Esta ação importa somente a TC. Nenhum score ou heatmap da IA é criado.</p></div>}
    {error?<div className="app-empty" role="alert"><FileWarning size={32}/><h2>Não foi possível abrir o exame</h2><p>{error}</p><button className="primary-button" onClick={()=>setRetry(retry+1)}><RefreshCw size={16}/> Tentar novamente</button></div>:!entry?<div className="app-empty" role="status"><Database size={32}/><h2>Nenhum exame carregado</h2><p>Inicie o Orthanc local, clique em “Atualizar do Orthanc” e escolha uma série de TC.</p></div>:!current||!finding?<div className="app-empty" role="status"><span className="spinner large"/><h2>Preparando o exame</h2><p>Carregando volumes e conferindo integridade.</p></div>:<main className="workspace">
      <Controls manifest={current.manifest} finding={finding} classId={classId} setClassId={id=>{setClassId(id);setVersion('')}} version={map?.version??''} setVersion={setVersion} settings={settings} setSettings={setSettings}/>
      <div className="viewer-workspace"><div className="workspace-heading"><div><span className="eyebrow">{caseId.startsWith('orthanc_')?'SÉRIE ORTHANC':`EXAME ${caseId.replace('valid_','')}`}</span><h1>{current.manifest.ct?(caseId.startsWith('orthanc_')?'Cortes da TC importada.':'Cortes da TC e atribuição.'):'Resultados sem volume.'}</h1></div><div className="case-stats"><span><b>{current.manifest.classes.filter(c=>c.heatmaps.length).length}</b> mapas disponíveis</span><button className="text-button" onClick={()=>about.current?.showModal()}><Info size={15}/> Dados do exame</button></div></div>
        {current.manifest.ct&&current.manifest.grid?<>
          <div className="geometry-notice"><Info size={14}/><span>{current.manifest.grid.geometry_verified?'Grade RAS verificada · distâncias em milímetros.':'Axial, Coronal e Sagital são rótulos de navegação da grade. Orientação anatômica e proporções físicas não verificadas: faltam affine e spacing.'}</span></div>
          {heatError&&<div className="error-banner" role="alert"><FileWarning size={16}/>{heatError}</div>}
          {!map&&!caseId.startsWith('orthanc_')&&<div className="map-notice">Este achado não tem heatmap neste pacote. A TC permanece disponível; isso não indica resultado negativo.</div>}
          <div className="slices-heading"><h2><ScanLine size={17}/> Cortes sincronizados</h2><span><Link2 size={13}/> Clique para mover o crosshair</span><button className="text-button" onClick={()=>setPos(current.manifest.grid!.dimensions.map(n=>Math.floor(n/2)) as Vec3)}>Centralizar</button></div>
          <div className="slices">{(['axial','coronal','sagittal'] as const).map(p=><SliceView key={p} plane={p} data={current} heat={heat} pos={pos} setPos={setPos} settings={settings}/>)}</div>
          <div className="position-bar"><span className="mono" data-testid="position">{current.manifest.grid.space==='RAS'?'RAS':'IJK'} &nbsp; {position.map(fmt).join(' · ')} {current.manifest.grid.space==='RAS'?'mm':'voxels'}</span><span className="mono">W {settings.windowWidth} / C {settings.windowCenter} HU</span></div>
          <div className="volume-disclosure"><button className="volume-toggle" aria-expanded={show3D} aria-controls="secondary-volume" onClick={()=>setShow3D(v=>!v)}><Box size={17}/>{show3D?'Ocultar visão 3D':'Abrir visão 3D complementar'}<ChevronRight size={17} className={show3D?'open':''}/></button><span>{caseId.startsWith('orthanc_')?'Volume de TC reorientado para RAS após validação da grade DICOM.':'A visualização 3D depende dos presets de transferência e não confirma orientação anatômica.'}</span></div>
          {show3D&&<div id="secondary-volume"><div className="clip-controls"><label>Plano do corte 3D<select aria-label="Plano do corte 3D" value={clipPlane} onChange={e=>setClipPlane(e.target.value as typeof clipPlane)}><option value="off">Sem corte</option><option value="i">Sagital</option><option value="j">Coronal</option><option value="k">Axial</option></select></label><label>Lado mantido<select aria-label="Lado mantido no 3D" value={clipSide} disabled={clipAxis===null} onChange={e=>setClipSide(e.target.value as typeof clipSide)}><option value="lower">Índices menores</option><option value="upper">Índices maiores</option></select></label>{clipAxis!==null&&<label className="clip-position">Índice do corte {['sagital','coronal','axial'][clipAxis]}: <output>{pos[clipAxis]} / {current.manifest.grid.dimensions[clipAxis]-1}</output><input aria-label="Mover corte 3D" type="range" min="0" max={current.manifest.grid.dimensions[clipAxis]-1} value={pos[clipAxis]} onChange={e=>{const next=[...pos] as Vec3;next[clipAxis]=+e.target.value;setPos(next)}}/></label>}</div><Suspense fallback={<div className="volume-panel app-empty"><span className="spinner"/>Iniciando 3D…</div>}><VolumeView data={current} heat={heat} settings={settings} clip={clip} name={caseId.startsWith('orthanc_')?'Tomografia':finding.name_pt} loading={heatPending||!!map&&!heat&&!heatError}/></Suspense></div>}
        </>:<div className="results-only"><div className="results-intro"><span className="empty-icon"><FileWarning size={28}/></span><div><h2>Resultados disponíveis. Volume ausente.</h2><p>Este pacote inclui os 18 scores do {caseId}, mas não a TC. O mapa de tokens não pode ser sobreposto sem a transformação espacial.</p></div></div><table><thead><tr><th>Achado</th><th>Score</th><th>Threshold</th><th>Comparação</th></tr></thead><tbody>{current.manifest.classes.map(c=><tr key={c.id} className={c.id===classId?'selected':''} onClick={()=>setClassId(c.id)}><td><button className="table-finding" onClick={()=>setClassId(c.id)}>{c.name_pt}</button></td><td className="mono">{c.score?.toFixed(6)??'—'}</td><td className="mono">{c.threshold?.toFixed(6)??'—'}</td><td><span className={c.decision?'result-above':'result-below'}>{c.decision?'Acima':'Abaixo'}</span></td></tr>)}</tbody></table></div>}
        <footer className="viewer-footer"><span><ShieldCheck size={14}/> Valores importados com verificação SHA-256</span><span>{caseId.startsWith('orthanc_')?'TC sem inferência da IA':'Atribuição ≠ segmentação'} <b>·</b> Uso acadêmico</span></footer>
      </div>
    </main>}
    <dialog className="about-dialog" ref={about}><div className="dialog-heading"><h2>Sobre este exame</h2><button className="icon-button" aria-label="Fechar informações" onClick={()=>about.current?.close()}><X size={20}/></button></div>
      <p className="dialog-lead">CT Heatmap <span>Explorer 2.2.0</span></p>
      <p>{caseId.startsWith('orthanc_')?'Esta TC veio do Orthanc local. Nenhum score ou mapa da IA foi calculado.':'O mapa mostra importância para a predição do CT-LiPro; não delimita lesões. Scores não são probabilidades clínicas calibradas.'}</p>
      <h3>Interação</h3><p>Cortes 2D: clique para mover o ponto vinculado, use scroll ou slider para navegar. No 3D, escolha Axial, Coronal ou Sagital, posição e lado mantido para cortar o volume na mesma coordenada; arraste para girar, use scroll para zoom e Shift + arraste para pan. Nos casos antigos, os nomes são convenções da grade, sem orientação anatômica confirmada. Todos os controles podem receber foco pelo teclado.</p>
      <h3>Dois thresholds independentes</h3><p>O threshold de classificação vem dos resultados e é somente leitura. O threshold visual filtra a atribuição na tela e nunca altera a classificação. Raw significa sem a máscara corporal do viewer; o mapa importado já pode ter normalização e quantização anteriores.</p>
      <h3>Dados e limites</h3>{current?.manifest.notices.map((n,i)=><p key={i}>{n}</p>)}
      <p>As cores são relativas à normalização declarada para cada mapa; não comparam gravidade entre classes. Zero fora da cobertura pode significar região não analisada. A cobertura do modelo não acompanha os HTMLs antigos.</p>
      <details><summary>Procedência e transformações</summary><pre>{JSON.stringify(current?.manifest.provenance,null,2)}</pre></details>
      <details><summary>Geometria de renderização</summary><pre>{JSON.stringify(current?.manifest.grid,null,2)}</pre></details>
      {map&&<details><summary>Método do heatmap</summary><pre>{JSON.stringify({version:map.version,method:map.method,normalization:map.normalization,display_range:map.display_range},null,2)}</pre></details>}
    </dialog>
  </div>
}
