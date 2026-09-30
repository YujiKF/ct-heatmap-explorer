import {useEffect,useRef,useState} from 'react';
import {Crosshair,LocateFixed} from 'lucide-react';
import type {LoadedCase,Vec3,ViewSettings} from '../data/types';
import {axes,index,planeToVoxel,centerOnPlane,displayHeat,gray,planeName,type Plane} from '../rendering/geometry';
import lut from '../rendering/inferno.json';
interface Props {plane:Plane;data:LoadedCase;heat:Float32Array|null;pos:Vec3;setPos:(p:Vec3)=>void;settings:ViewSettings}
export default function SliceView({plane,data,heat,pos,setPos,settings}:Props){
  const canvas=useRef<HTMLCanvasElement>(null), wrap=useRef<HTMLDivElement>(null);
  const grid=data.manifest.grid!;const d=grid.dimensions,[a,b,normal]=axes[plane];
  const w=d[a],h=d[b],spacing=grid.geometry_verified&&grid.spacing?grid.spacing:[1,1,1];
  const name=planeName(plane,grid);
  const [fit,setFit]=useState({width:100,height:100});
  useEffect(()=>{
    const el=wrap.current;if(!el)return;
    const resize=()=>{const ratio=w*spacing[a]/(h*spacing[b]);const height=Math.min(el.clientHeight-20,(el.clientWidth-50)/ratio);setFit({width:height*ratio,height})};
    const observer=new ResizeObserver(resize);observer.observe(el);resize();return()=>observer.disconnect();
  },[w,h,spacing[a],spacing[b]]);
  useEffect(()=>{
    const c=canvas.current;if(!c||!data.ct)return;
    // Pixel buffer retains original slice samples. CSS scales in physical proportions.
    c.width=w;c.height=h;const ctx=c.getContext('2d')!;const img=ctx.createImageData(w,h);
    for(let v=0;v<h;v++)for(let u=0;u<w;u++){
      const xyz=planeToVoxel(plane,u,v,pos,d);const k=index(...xyz,d);
      const g=settings.anatomy?gray(data.ct[k],settings.windowCenter,settings.windowWidth):0;
      const value=heat?.[k]??0;const alpha=displayHeat(value,data.body?.[k],settings)?settings.heatOpacity:0;
      const rgb=lut[Math.max(0,Math.min(255,Math.round(value*255)))];const j=4*(v*w+u);
      img.data[j]=g*(1-alpha)+rgb[0]*alpha;img.data[j+1]=g*(1-alpha)+rgb[1]*alpha;img.data[j+2]=g*(1-alpha)+rgb[2]*alpha;img.data[j+3]=255;
    }
    ctx.putImageData(img,0,0);
  },[plane,data,heat,pos,settings,w,h,d]);
  function navigate(value:number){const next=[...pos] as Vec3;next[normal]=Math.max(0,Math.min(d[normal]-1,value));setPos(next)}
  function centerPlane(){setPos(centerOnPlane(plane,pos,d))}
  useEffect(()=>{
    const el=wrap.current;if(!el)return;
    const wheel=(e:WheelEvent)=>{e.preventDefault();navigate(pos[normal]+Math.sign(e.deltaY))};
    el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel);
  });
  const known=grid.geometry_verified&&grid.space==='RAS'&&!!grid.affine&&!!grid.spacing&&grid.orientation?.join('')==='RAS';
  const labels=known?plane==='axial'?['L','R','A','P']:plane==='coronal'?['L','R','S','I']:['P','A','S','I']:[`${'IJK'[a]}−`,`${'IJK'[a]}+`,`${'IJK'[b]}+`,`${'IJK'[b]}−`];
  return <section className={`slice-panel ${plane}`} aria-label={`Corte ${name}`}>
    <div className="slice-title"><h3><i/>{name} <span>{known?'RAS':`grade ${['IJ','IK','JK'][['axial','coronal','sagittal'].indexOf(plane)]}`}</span></h3><div className="slice-title-actions"><span className="mono">{pos[normal]+1}<em> / {d[normal]}</em></span><button className="slice-center" type="button" aria-label={`Centralizar ${name}`} title={`Centralizar ${name}`} onClick={centerPlane}><LocateFixed size={15}/></button></div></div>
    <div className="slice-stage" ref={wrap}>
      <div className="slice-image" style={fit}>
        <canvas ref={canvas} aria-label={`Imagem ${name}`} onPointerDown={e=>{
          const rect=e.currentTarget.getBoundingClientRect();const u=Math.max(0,Math.min(w-1,Math.floor((e.clientX-rect.left)/rect.width*w)));
          const v=Math.max(0,Math.min(h-1,Math.floor((e.clientY-rect.top)/rect.height*h)));setPos(planeToVoxel(plane,u,v,pos,d));
        }}/>
        <div className="crosshair-v" style={{left:`${(pos[a]+.5)/w*100}%`}}/><div className="crosshair-h" style={{top:`${(h-pos[b]-.5)/h*100}%`}}/>
      </div>
      <span className="direction left">{labels[0]}</span><span className="direction right">{labels[1]}</span><span className="direction top">{labels[2]}</span><span className="direction bottom">{labels[3]}</span>
      <Crosshair className="slice-cross-icon" size={14}/>
    </div>
    <div className="slice-slider"><input aria-label={`Navegar corte ${name}`} type="range" min="0" max={d[normal]-1} value={pos[normal]} onChange={e=>navigate(+e.target.value)}/></div>
  </section>
}
