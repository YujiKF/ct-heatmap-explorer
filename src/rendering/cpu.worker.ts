/// <reference lib="webworker" />
import lut from './inferno.json';
import type {Grid,ViewSettings,Vec3} from '../data/types';
import {CT_COLORS,CT_OPACITY} from './presets';
import {clipAllowsIndex,type VolumeClip} from './geometry';
// A true front-to-back volume ray caster, used when WebGL2 is unavailable.
// Deliberately independent of the inference outputs and classification policy.
let ct:Float32Array,heat:Float32Array|null=null,body:Uint8Array|null=null,grid:Grid;
const cross=(a:number[],b:number[])=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=(v:number[])=>{const n=Math.hypot(...v);return v.map(x=>x/n)};
function interpolate(points:number[][],v:number,col:number){
  if(v<=points[0][0])return points[0][col];
  for(let j=1;j<points.length;j++)if(v<=points[j][0]){const t=(v-points[j-1][0])/(points[j][0]-points[j-1][0]);return points[j-1][col]*(1-t)+points[j][col]*t}
  return points[points.length-1][col];
}
function render(id:number,revision:number,width:number,height:number,yaw:number,pitch:number,zoom:number,pan:number[],settings:ViewSettings,clip:VolumeClip|null,coarse:boolean){
  if(!ct||!grid)return;
  const dims=grid.dimensions,[nx,ny,nz]=dims,sp=grid.spacing??[1,1,1];
  const bounds=dims.map((n,i)=>(n-1)*sp[i]),radius=Math.max(...bounds)*.62,half=bounds.map(v=>v/2);
  const dir=norm([-Math.sin(yaw)*Math.cos(pitch),Math.cos(yaw)*Math.cos(pitch),-Math.sin(pitch)]);
  const right=norm(cross(dir,[0,0,1])),up=norm(cross(right,dir));
  const step=Math.min(...sp)*(coarse?2.4:1.2),scale=radius/zoom,aspect=width/height;
  const image=new Uint8ClampedArray(width*height*4);
  const cp=CT_COLORS,ap=CT_OPACITY[settings.anatomyPreset];
  // Sample the transfer functions ahead of the ray loop. CT is not quantized on disk.
  const ac=new Float32Array(4096),cr=new Float32Array(4096),cg=new Float32Array(4096),cb=new Float32Array(4096);
  for(let j=0;j<4096;j++){const hu=-1400+j;ac[j]=settings.anatomy?interpolate(ap,hu,1)*settings.anatomyOpacity:0;cr[j]=interpolate(cp,hu,1);cg[j]=interpolate(cp,hu,2);cb[j]=interpolate(cp,hu,3)}
  const ah=new Float32Array(256);
  for(let j=1;j<256;j++){const v=j/255;ah[j]=settings.heat?settings.heatOpacity*(.005+.3*v**1.25):0}
  const bg=[16/255,35/255,52/255];
  for(let py=0;py<height;py++)for(let px=0;px<width;px++){
    const u=((px+.5)/width*2-1)*scale*aspect+pan[0]*radius;
    const v=(1-(py+.5)/height*2)*scale+pan[1]*radius;
    const orig=dir.map((d,i)=>-d*radius*4+right[i]*u+up[i]*v);
    let near=-Infinity,far=Infinity;
    for(let a=0;a<3;a++){
      if(Math.abs(dir[a])<1e-8){if(orig[a]<-half[a]||orig[a]>half[a]){near=1;far=0;break}}
      else {const t1=(-half[a]-orig[a])/dir[a],t2=(half[a]-orig[a])/dir[a];near=Math.max(near,Math.min(t1,t2));far=Math.min(far,Math.max(t1,t2))}
    }
    let r=0,g=0,b=0,alpha=0;
    if(far>near){
      // Trilinear scalar sampling; the body display mask is nearest-neighbor.
      for(let t=near;t<=far&&alpha<.985;t+=step){
        const xx=(orig[0]+t*dir[0]+half[0])/sp[0],yy=(orig[1]+t*dir[1]+half[1])/sp[1],zz=(orig[2]+t*dir[2]+half[2])/sp[2];
        if(clip&&!clipAllowsIndex([xx,yy,zz][clip.axis],clip))continue;
        const x=Math.max(0,Math.min(nx-2,Math.floor(xx))),y=Math.max(0,Math.min(ny-2,Math.floor(yy))),z=Math.max(0,Math.min(nz-2,Math.floor(zz)));
        const fx=Math.max(0,Math.min(1,xx-x)),fy=Math.max(0,Math.min(1,yy-y)),fz=Math.max(0,Math.min(1,zz-z));
        const k=x+nx*(y+ny*z),zoff=nx*ny;
        const sample=(arr:Float32Array)=>{
          const p00=arr[k]*(1-fx)+arr[k+1]*fx,p10=arr[k+nx]*(1-fx)+arr[k+nx+1]*fx;
          const p01=arr[k+zoff]*(1-fx)+arr[k+zoff+1]*fx,p11=arr[k+zoff+nx]*(1-fx)+arr[k+zoff+nx+1]*fx;
          return (p00*(1-fy)+p10*fy)*(1-fz)+(p01*(1-fy)+p11*fy)*fz;
        };
        const hu=sample(ct);const c=Math.max(0,Math.min(4095,Math.round(hu+1400)));
        const maskIndex=Math.round(xx)+nx*(Math.round(yy)+ny*Math.round(zz));
        const heatValue=heat&&(!settings.masked||body?.[maskIndex]===1)?sample(heat):0;
        const h=heatValue>=settings.visualThreshold?Math.max(0,Math.min(255,Math.round(heatValue*255))):0;
        const a1=ac[c],a2=ah[h],total=a1+a2;
        if(total>0){const a=1-Math.pow(1-Math.min(.99,total),step/Math.min(...sp));const weight=(1-alpha)*a/total;
          r+=weight*(a1*cr[c]+a2*lut[h][0]/255);g+=weight*(a1*cg[c]+a2*lut[h][1]/255);b+=weight*(a1*cb[c]+a2*lut[h][2]/255);alpha+=(1-alpha)*a;
        }
      }
    }
    const q=(py*width+px)*4;image[q]=255*(r+(1-alpha)*bg[0]);image[q+1]=255*(g+(1-alpha)*bg[1]);image[q+2]=255*(b+(1-alpha)*bg[2]);image[q+3]=255;
  }
  self.postMessage({type:'frame',id,revision,width,height,pixels:image.buffer}, {transfer:[image.buffer]});
}
self.onmessage=(event:MessageEvent)=>{
  const m=event.data;
  if(m.type==='init'){ct=m.ct;grid=m.grid;body=m.body}
  if(m.type==='heat')heat=m.heat;
  if(m.type==='render')render(m.id,m.revision,m.width,m.height,m.yaw,m.pitch,m.zoom,m.pan,m.settings,m.clip,m.coarse);
};
