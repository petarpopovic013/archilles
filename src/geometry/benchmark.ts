import type {Geometry,Point} from '../domain/project';
import {iou,vertices} from './topology';
function samples(g:Geometry):Point[]{const ps=vertices(g),result:Point[]=[];for(let i=0;i<ps.length;i++){const a=ps[i],b=ps[(i+1)%ps.length],n=Math.max(1,Math.ceil(Math.hypot(a.x-b.x,a.y-b.y)/3));for(let j=0;j<n;j++)result.push({x:a.x+(b.x-a.x)*j/n,y:a.y+(b.y-a.y)*j/n});}return result;}
function distance(p:Point,g:Geometry){const ps=vertices(g);let best=Infinity;for(let i=0;i<ps.length;i++){const a=ps[i],b=ps[(i+1)%ps.length],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));best=Math.min(best,Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy));}return best;}
/** Symmetric contour distance in source pixels, independent of vertex count or polygon start. */
export function boundaryP95(a:Geometry,b:Geometry):number{const ds=[...samples(a).map(p=>distance(p,b)),...samples(b).map(p=>distance(p,a))].sort((x,y)=>x-y);return ds[Math.min(ds.length-1,Math.floor(ds.length*.95))]??Infinity;}
export function compareRooms(expected:Array<{label:string;geometry:Geometry}>,actual:Array<{id:string;label?:string;type:string;geometry:Geometry}>,sourceWidth:number,sourceHeight:number){
  const used=new Set<string>();
  return expected.map(e=>{const candidates=actual.filter(a=>['ROOM','CORRIDOR'].includes(a.type)&&!used.has(a.id)).map(a=>({element:a,iou:iou(e.geometry,a.geometry)})).sort((a,b)=>b.iou-a.iou),best=candidates[0];if(!best)return {reference:e.label,matched:false};used.add(best.element.id);const p95=boundaryP95(e.geometry,best.element.geometry);return {reference:e.label,matched:best.iou>0,elementId:best.element.id,predictedLabel:best.element.label,iou:best.iou,boundaryP95Px:p95,boundaryP95Fraction:p95/Math.hypot(sourceWidth,sourceHeight)};});
}
