import '@kitware/vtk.js/Rendering/Profiles/Volume';
import vtkGenericRenderWindow from '@kitware/vtk.js/Rendering/Misc/GenericRenderWindow';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import type {Grid, Vec3, ViewSettings} from '../data/types';
import {clipBoundary,type VolumeClip} from './geometry';
import lut from './inferno.json';
import {CT_COLORS,CT_OPACITY} from './presets';

/** One ray caster with independent CT + attribution components on the same grid.
 * No isosurface, point cloud or hidden body clipping. This module never sees scores.
 */
export function createVolume(host: HTMLDivElement, grid: Grid, ct: Float32Array) {
  const grw=vtkGenericRenderWindow.newInstance({background:[16/255,35/255,52/255],listenWindowResize:false});
  grw.setContainer(host);
  const renderer=grw.getRenderer(), rw=grw.getRenderWindow();
  const image=vtkImageData.newInstance();
  const spacing=grid.spacing??[1,1,1];
  image.setDimensions(...grid.dimensions);image.setSpacing(spacing);image.setOrigin(grid.origin??[0,0,0]);
  const values=new Float32Array(ct.length*2);
  for(let i=0;i<ct.length;i++)values[2*i]=ct[i];
  const scalars=vtkDataArray.newInstance({name:'CT + attribution',values,numberOfComponents:2});
  image.getPointData().setScalars(scalars);
  const mapper=vtkVolumeMapper.newInstance();mapper.setInputData(image);
  const clipPlane=vtkPlane.newInstance();
  mapper.setSampleDistance(Math.min(...spacing)*.85);
  const actor=vtkVolume.newInstance();actor.setMapper(mapper);
  const property=actor.getProperty();property.setIndependentComponents(true);
  property.setInterpolationTypeToLinear();property.setShade(false);
  const ctColor=vtkColorTransferFunction.newInstance(),hmColor=vtkColorTransferFunction.newInstance();
  const ctAlpha=vtkPiecewiseFunction.newInstance(),hmAlpha=vtkPiecewiseFunction.newInstance();
  property.setRGBTransferFunction(0,ctColor);property.setScalarOpacity(0,ctAlpha);
  property.setRGBTransferFunction(1,hmColor);property.setScalarOpacity(1,hmAlpha);
  property.setScalarOpacityUnitDistance(0,Math.min(...spacing));
  property.setScalarOpacityUnitDistance(1,Math.min(...spacing));
  property.setComponentWeight(0,1);property.setComponentWeight(1,1);
  lut.forEach((rgb,i)=>hmColor.addRGBPoint(i/255,rgb[0]/255,rgb[1]/255,rgb[2]/255));
  renderer.addVolume(actor);
  const reset=()=>{
    const b=image.getBounds();const center=[(b[0]+b[1])/2,(b[2]+b[3])/2,(b[4]+b[5])/2];
    const size=Math.max(b[1]-b[0],b[3]-b[2],b[5]-b[4]);const camera=renderer.getActiveCamera();
    camera.setFocalPoint(center[0],center[1],center[2]);camera.setPosition(center[0]+size*.9,center[1]-size*2.7,center[2]+size*.55);
    camera.setViewUp(0,0,1);renderer.resetCamera();camera.zoom(1.12);renderer.resetCameraClippingRange();rw.render();
  };
  let frame=0,disposed=false;
  const render=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(!disposed)rw.render()})};
  const observer=new ResizeObserver(()=>{grw.resize();render()});observer.observe(host);
  grw.resize();
  function setHeatmap(heat:Float32Array|null,body:Uint8Array|null,masked:boolean) {
    for(let i=0;i<ct.length;i++)values[2*i+1]=heat && (!masked || body?.[i]===1)?heat[i]:0;
    scalars.modified();image.modified();render();
  }
  function settings(s:ViewSettings) {
    ctColor.removeAllPoints();
    CT_COLORS.forEach(([hu,r,g,b])=>ctColor.addRGBPoint(hu,r,g,b));
    ctAlpha.removeAllPoints();const k=s.anatomy?s.anatomyOpacity:0;
    CT_OPACITY[s.anatomyPreset].forEach(([hu,a])=>ctAlpha.addPoint(hu,a*k));
    hmAlpha.removeAllPoints();const h=s.heat?s.heatOpacity:0;
    // Positive values below the display threshold are transparent, without mutation.
    hmAlpha.addPoint(0,0);
    if(s.visualThreshold>0)hmAlpha.addPoint(Math.max(0,s.visualThreshold-.00001),0);
    for(let i=1;i<=256;i++) {
      const v=i/256;if(v>=s.visualThreshold)hmAlpha.addPoint(v,h*(.005+.3*Math.pow(v,1.25)));
    }
    if(s.visualThreshold>0)hmAlpha.addPoint(s.visualThreshold,h*(.005+.3*Math.pow(s.visualThreshold,1.25)));
    render();
  }
  function rotate(degrees:number){renderer.getActiveCamera().azimuth(degrees);renderer.resetCameraClippingRange();render()}
  function setClip(clip:VolumeClip|null){
    mapper.removeAllClippingPlanes();
    if(clip){
      const boundary=clipBoundary(clip,grid),origin=[...(grid.origin??[0,0,0])] as Vec3,normal:Vec3=[0,0,0];
      origin[clip.axis]=boundary.coordinate;normal[clip.axis]=boundary.normal;
      clipPlane.setOrigin(origin);clipPlane.setNormal(normal);mapper.addClippingPlane(clipPlane);
    }
    mapper.modified();render();
  }
  return {setHeatmap,settings,setClip,reset,rotate,zoom(factor:number){renderer.getActiveCamera().zoom(factor);render()},dispose(){
    disposed=true;cancelAnimationFrame(frame);observer.disconnect();
    renderer.removeVolume(actor);grw.delete();
    actor.delete();mapper.delete();clipPlane.delete();image.delete();scalars.delete();ctColor.delete();hmColor.delete();ctAlpha.delete();hmAlpha.delete();
  }};
}
