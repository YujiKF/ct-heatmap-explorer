import type {ReactNode} from 'react';
import {Eye,Layers3,Info,LockKeyhole,SlidersHorizontal} from 'lucide-react';
import type {Finding, ViewSettings,Manifest} from '../data/types';
import {compareFinding} from '../data/validate';
export function Range({label,value,onChange,min=0,max=1,step=.01,display,disabled=false}:{label:string;value:number;onChange:(n:number)=>void;min?:number;max?:number;step?:number;display?:string;disabled?:boolean}){
  return <label className="range-control"><span>{label}<output>{display??`${Math.round(value*100)}%`}</output></span><input aria-label={label} disabled={disabled} style={{'--progress':`${(value-min)/(max-min)*100}%`} as React.CSSProperties} type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(+e.target.value)}/></label>
}
function Switch({children,on,change,disabled=false}:{children:ReactNode;on:boolean;change:()=>void;disabled?:boolean}){
  return <button className="switch-row" role="switch" aria-checked={on} disabled={disabled} onClick={change}>{children}<span className={`switch ${on?'on':''}`}><i/></span></button>
}
export default function Controls({manifest,finding,classId,setClassId,version,setVersion,settings,setSettings}:{manifest:Manifest;finding:Finding;classId:string;setClassId:(s:string)=>void;version:string;setVersion:(s:string)=>void;settings:ViewSettings;setSettings:(s:ViewSettings)=>void}){
  const set=<K extends keyof ViewSettings>(key:K,v:ViewSettings[K])=>setSettings({...settings,[key]:v});
  const comparison=compareFinding(finding),hasMap=finding.heatmaps.length>0;
  const thresholdStatus=finding.threshold_status?.replaceAll('_',' ').toLowerCase();
  return <aside className="control-panel">
    <section className="control-section finding-section"><div className="section-heading"><span className="eyebrow">ACHADO EM FOCO</span><span className="small-badge">18 classes</span></div>
      <label className="sr-only" htmlFor="finding">Selecionar achado</label><select id="finding" value={classId} onChange={e=>setClassId(e.target.value)}>{manifest.classes.map(c=><option key={c.id} value={c.id}>{c.name_pt}{c.heatmaps.length?'':' · sem mapa'}</option>)}</select>
      <div className="prediction-card"><div className="prediction-heading"><span>Resultado do modelo</span><LockKeyhole size={13}/></div>
        <div className="score-row"><strong className="mono">{finding.score===null?'—':finding.score.toFixed(6)}</strong><span>score</span></div>
        <div className="threshold-row"><span>Threshold de classificação</span><b className="mono">{finding.threshold===null?'—':finding.threshold.toFixed(6)}</b></div>
        <div className={`comparison ${comparison===null?'unavailable':comparison?'above':'below'}`}>{comparison===null?'Comparação indisponível':comparison?'Acima do threshold':'Abaixo do threshold'}</div>
        {finding.logit!==null&&<div className="logit">Logit <span className="mono">{finding.logit.toFixed(8)}</span></div>}
        <p>{comparison===null?'Scores e thresholds deste caso não estão nos arquivos de origem.':'Score não é probabilidade clínica calibrada. Limiar experimental.'}</p>
        {finding.threshold!==null&&<p className="policy-note" title={finding.interpretation}>{thresholdStatus}</p>}
      </div>
    </section>
    {manifest.ct&&<section className="control-section"><h3><SlidersHorizontal size={16}/> Janela dos cortes 2D</h3>
      <div className="window-presets">{[{label:'Pulmão',c:-600,w:1500},{label:'Mediastino',c:40,w:400},{label:'Óssea',c:400,w:1800}].map(p=><button key={p.label} className={settings.windowCenter===p.c&&settings.windowWidth===p.w?'active':''} onClick={()=>setSettings({...settings,windowCenter:p.c,windowWidth:p.w})}>{p.label}</button>)}</div>
      <Range label="Centro da janela" value={settings.windowCenter} min={-1200} max={2000} step={1} display={`${settings.windowCenter} HU`} onChange={v=>set('windowCenter',v)}/>
      <Range label="Largura da janela" value={settings.windowWidth} min={1} max={4000} step={1} display={`${settings.windowWidth} HU`} onChange={v=>set('windowWidth',v)}/>
    </section>}
    {manifest.ct&&<section className="control-section"><h3><Eye size={16}/> Exibição da atribuição</h3>
      <Range label="Threshold visual do heatmap" value={settings.visualThreshold} display={settings.visualThreshold.toFixed(2)} onChange={v=>set('visualThreshold',v)} disabled={!hasMap}/>
      <p className="field-hint">Filtra somente a exibição. Não altera o score nem a classificação.</p>
      <div className="segmented" aria-label="Máscara de visualização"><button aria-pressed={!settings.masked} className={!settings.masked?'active':''} onClick={()=>set('masked',false)}>Raw</button><button aria-pressed={settings.masked} disabled={!manifest.body_mask} className={settings.masked?'active':''} onClick={()=>set('masked',true)}>Body-masked</button></div>
      <p className="field-hint">{settings.masked?'Máscara corporal aproximada, apenas visual. Pode remover regiões incorretamente.':'Sem máscara corporal. Ativações fora do corpo são preservadas.'}</p>
      <label className="select-label">Versão do heatmap<select aria-label="Versão do heatmap" value={version} disabled={!hasMap} onChange={e=>setVersion(e.target.value)}>{!hasMap?<option value="">Não disponível</option>:finding.heatmaps.map(h=><option value={h.version} key={h.version}>{h.version}</option>)}</select></label>
    </section>}
    {manifest.ct&&<section className="control-section"><h3><Layers3 size={16}/> Camadas 3D e 2D</h3>
      <Switch on={settings.anatomy} change={()=>set('anatomy',!settings.anatomy)} disabled={!manifest.ct}><span className="layer-label"><i className="layer-dot anatomy-dot"/>Anatomia / TC</span></Switch>
      <Range label="Opacidade da anatomia 3D" value={settings.anatomyOpacity} onChange={v=>set('anatomyOpacity',v)} disabled={!manifest.ct}/>
      <Switch on={settings.heat} change={()=>set('heat',!settings.heat)} disabled={!hasMap}><span className="layer-label"><i className="layer-dot heat-dot"/>Mapa de atribuição</span></Switch>
      <Range label="Opacidade do heatmap" value={settings.heatOpacity} onChange={v=>set('heatOpacity',v)} disabled={!hasMap}/>
      <label className="select-label">Preset da anatomia 3D<select aria-label="Preset da anatomia 3D" value={settings.anatomyPreset} onChange={e=>set('anatomyPreset',e.target.value as ViewSettings['anatomyPreset'])}><option value="lung">Pulmão · ossos atenuados</option><option value="tissue">Tecidos moles</option><option value="bone">Ossos</option></select></label>
    </section>}
    <div className="attribution-note"><Info size={16}/><p>O mapa mostra atribuição à predição. <strong>Não é uma segmentação da lesão.</strong></p></div>
  </aside>
}
