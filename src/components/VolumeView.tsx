import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {RotateCcw, Move, Maximize2, Pause, Play, Box,Plus,Minus} from 'lucide-react';
import type {LoadedCase, ViewSettings} from '../data/types';
import {createVolume} from '../rendering/volume';
import {createCpuVolume} from '../rendering/cpu';
import type {VolumeClip} from '../rendering/geometry';
interface Props {data:LoadedCase;heat:Float32Array|null;settings:ViewSettings;clip:VolumeClip|null;name:string;loading:boolean}
export default function VolumeView({data,heat,settings,clip,name,loading}:Props){
  const host=useRef<HTMLDivElement>(null),panel=useRef<HTMLDivElement>(null);
  const engine=useRef<ReturnType<typeof createVolume>|null>(null);
  const [error,setError]=useState(''),[spin,setSpin]=useState(false),[backend,setBackend]=useState('GPU · vtk.js');
  useEffect(()=>{
    setError('');setSpin(false);
    if(!host.current||!data.ct||!data.manifest.grid)return;
    const probe=document.createElement('canvas'),gl=probe.getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    try{
      setBackend(gl?'GPU · vtk.js':'CPU · modo compatível');
      engine.current=gl?createVolume(host.current,data.manifest.grid,data.ct):createCpuVolume(host.current,data.manifest.grid,data.ct);
      engine.current.setHeatmap(heat,data.body,settings.masked);engine.current.settings(settings);engine.current.setClip(clip);engine.current.reset();
    }catch(e){setError(`Renderização 3D indisponível: ${e instanceof Error?e.message:String(e)}`)}
    const el=host.current;
    const lost=(event:Event)=>{event.preventDefault();setError('O contexto gráfico foi perdido. Recarregue o exame. Os cortes 2D continuam disponíveis.');setSpin(false)};
    el.addEventListener('webglcontextlost',lost,true);
    return()=>{el.removeEventListener('webglcontextlost',lost,true);engine.current?.dispose();engine.current=null};
    // Dataset owns GPU lifecycle; display updates are handled separately below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[data]);
  useLayoutEffect(()=>{engine.current?.setHeatmap(heat,data.body,settings.masked)},[heat,data.body,settings.masked]);
  useEffect(()=>{engine.current?.settings(settings)},[settings]);
  useEffect(()=>{engine.current?.setClip(clip)},[clip?.axis,clip?.position,clip?.side]);
  useEffect(()=>{
    if(!spin)return;let frame=0,last=0;
    const tick=(time:number)=>{if(time-last>40){engine.current?.rotate(.3);last=time}frame=requestAnimationFrame(tick)};
    frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);
  },[spin]);
  return <section ref={panel} className="volume-panel" aria-label="Visualização volumétrica 3D">
    <div className="volume-host" ref={host}/>
    <div className="volume-heading"><span className="eyebrow"><Box size={14}/> EXPLORAÇÃO VOLUMÉTRICA</span><h2>{name}</h2><div className="volume-tags"><span>3D</span><span>{settings.anatomy&&settings.heat?'TC + atribuição':settings.anatomy?'Tomografia':settings.heat?'Atribuição':'Camadas desligadas'}</span><span className={settings.masked?'amber':'mint'}>{settings.masked?'Body-masked':'Raw · sem máscara'}</span><span>{backend}</span></div></div>
    {loading&&<div className="volume-loading"><span className="spinner"/>Carregando atribuição…</div>}
    {error&&<div className="empty-state" role="alert"><Box size={30}/><p>{error}</p></div>}
    <div className="volume-tools">
      <button aria-label="Aproximar volume" title="Aproximar" onClick={()=>engine.current?.zoom(1.2)}><Plus size={18}/></button>
      <button aria-label="Afastar volume" title="Afastar" onClick={()=>engine.current?.zoom(1/1.2)}><Minus size={18}/></button>
      <button aria-label="Centralizar câmera" title="Centralizar câmera" onClick={()=>engine.current?.reset()}><RotateCcw size={18}/></button>
      <button aria-label={spin?'Pausar rotação':'Rotação automática'} title={spin?'Pausar':'Rotação automática'} aria-pressed={spin} onClick={()=>setSpin(!spin)}>{spin?<Pause size={18}/>:<Play size={18}/>}</button>
      <button aria-label="Tela cheia" title="Tela cheia" onClick={()=>{if(document.fullscreenElement)void document.exitFullscreen();else void panel.current?.requestFullscreen().catch(()=>setError('Tela cheia indisponível neste navegador.'))}}><Maximize2 size={18}/></button>
    </div>
    <div className="volume-bottom"><span><Move size={14}/> Arraste para girar <b>·</b> Scroll para zoom <b>·</b> Shift + arraste para pan</span><span className="mono">{data.manifest.grid?.dimensions.join(' × ')} voxels</span></div>
    <div className="color-key"><span>Atribuição relativa</span><div className="color-bar"/><div className="key-labels"><span>0</span><span>0.5</span><span>1</span></div></div>
  </section>
}
