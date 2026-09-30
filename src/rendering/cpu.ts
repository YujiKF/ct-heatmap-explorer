import type {Grid,ViewSettings} from '../data/types';
import {DEFAULT_SETTINGS} from '../data/types';
import type {VolumeClip} from './geometry';
export function createCpuVolume(host:HTMLDivElement,grid:Grid,ct:Float32Array){
  const canvas=document.createElement('canvas');canvas.style.cssText='width:100%;height:100%;display:block;touch-action:none;cursor:grab';host.appendChild(canvas);
  const worker=new Worker(new URL('./cpu.worker.ts',import.meta.url),{type:'module'});
  let yaw=.32,pitch=.16,zoom=1,pan=[0,0],state={...DEFAULT_SETTINGS},clip:VolumeClip|null=null,id=0,revision=0,busy=false,pending=false,coarse=false,disposed=false;
  const ctx=canvas.getContext('2d')!;
  worker.postMessage({type:'init',grid,ct,body:null});
  let body:Uint8Array|null=null,settle:ReturnType<typeof setTimeout>|undefined;
  const request=(interactive=false)=>{
    if(disposed)return;pending=true;coarse=interactive;
    if(busy)return;busy=true;pending=false;
    const rect=host.getBoundingClientRect(),h=interactive?110:240,w=Math.max(1,Math.round(h*rect.width/Math.max(1,rect.height)));
    worker.postMessage({type:'render',id:++id,revision,width:w,height:h,yaw,pitch,zoom,pan,settings:state,clip,coarse:interactive});
  };
  worker.onmessage=e=>{
    if(disposed)return;busy=false;
    const f=e.data;if(f.type==='frame'&&f.revision===revision){canvas.width=f.width;canvas.height=f.height;ctx.putImageData(new ImageData(new Uint8ClampedArray(f.pixels),f.width,f.height),0,0);canvas.style.visibility='visible';canvas.dataset.rendered='true'}
    if(pending)request(coarse);
  };
  const interact=()=>{request(true);clearTimeout(settle);settle=setTimeout(()=>request(false),160)};
  let drag:{x:number;y:number;pan:boolean}|null=null;
  const down=(e:PointerEvent)=>{canvas.setPointerCapture(e.pointerId);drag={x:e.clientX,y:e.clientY,pan:e.shiftKey||e.button===1};canvas.style.cursor='grabbing'};
  const move=(e:PointerEvent)=>{
    if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
    if(drag.pan){pan=[pan[0]-dx/200,pan[1]+dy/200]}else{yaw-=dx*.009;pitch=Math.max(-1.45,Math.min(1.45,pitch+dy*.008))}
    drag.x=e.clientX;drag.y=e.clientY;interact();
  };
  const up=()=>{drag=null;canvas.style.cursor='grab';request()};
  const wheel=(e:WheelEvent)=>{e.preventDefault();zoom=Math.max(.3,Math.min(5,zoom*Math.exp(-e.deltaY*.001)));interact()};
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('wheel',wheel,{passive:false});
  const observer=new ResizeObserver(()=>request());observer.observe(host);
  return {setHeatmap(heat:Float32Array|null,newBody:Uint8Array|null,masked:boolean){
    revision++;canvas.style.visibility='hidden';canvas.dataset.rendered='false';
    if(newBody!==body){body=newBody;worker.postMessage({type:'init',grid,ct,body})}
    worker.postMessage({type:'heat',heat});state={...state,masked};request();
  },settings(s:ViewSettings){state={...s};request()},setClip(next:VolumeClip|null){clip=next;revision++;canvas.style.visibility='hidden';canvas.dataset.rendered='false';request()},reset(){yaw=.32;pitch=.16;zoom=1;pan=[0,0];request()},zoom(factor:number){zoom=Math.max(.3,Math.min(5,zoom*factor));request()},rotate(degrees:number){yaw+=degrees*Math.PI/180;request(true)},dispose(){disposed=true;clearTimeout(settle);observer.disconnect();worker.terminate();canvas.remove()}};
}
