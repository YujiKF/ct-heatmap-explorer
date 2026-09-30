import type {Vec3, Grid, ViewSettings} from '../data/types';
export type Plane = 'axial' | 'coronal' | 'sagittal';
export interface VolumeClip {axis:0|1|2;position:number;side:'lower'|'upper'}
export const axes: Record<Plane,[number,number,number]>={axial:[0,1,2],coronal:[0,2,1],sagittal:[1,2,0]};
export function planeName(p:Plane,_grid:Grid) {
  // Conventional navigation aliases; physical orientation is a separate claim.
  return {axial:'Axial',coronal:'Coronal',sagittal:'Sagital'}[p];
}
export function index(x:number,y:number,z:number,d:Vec3){return x+d[0]*(y+d[1]*z)}
export function planeToVoxel(p:Plane,u:number,v:number,pos:Vec3,d:Vec3):Vec3 {
  const [a,b]=axes[p];const out=[...pos] as Vec3;out[a]=u;out[b]=d[b]-1-v;return out;
}
export function centerOnPlane(p:Plane,pos:Vec3,d:Vec3):Vec3 {
  const [a,b]=axes[p];const out=[...pos] as Vec3;
  out[a]=Math.floor(d[a]/2);out[b]=Math.floor(d[b]/2);return out;
}
export function world(pos:Vec3,grid:Grid):Vec3 {
  if(grid.space!=='RAS'||!grid.geometry_verified||!grid.affine)return pos;
  return [0,1,2].map(i=>grid.affine![i][3]+pos.reduce((v,p,j)=>v+grid.affine![i][j]*p,0)) as Vec3;
}
export function clipBoundary(clip:VolumeClip,grid:Grid) {
  const indexBoundary=clip.position+(clip.side==='lower'?.5:-.5);
  const spacing=grid.geometry_verified&&grid.spacing?grid.spacing[clip.axis]:1;
  const origin=grid.geometry_verified&&grid.origin?grid.origin[clip.axis]:0;
  return {coordinate:origin+indexBoundary*spacing,normal:clip.side==='lower'?-1:1};
}
export function clipAllowsIndex(coordinate:number,clip:VolumeClip) {
  return clip.side==='lower'?coordinate<=clip.position+.5:coordinate>=clip.position-.5;
}
export function displayHeat(value:number,mask:number|undefined,s:ViewSettings) {
  return s.heat && value>0 && value>=s.visualThreshold && (!s.masked || mask===1);
}
export function gray(hu:number,center:number,width:number){return Math.max(0,Math.min(255,(hu-center+width/2)/width*255))}
