import type { Geometry, Point } from '../domain/project';
import type { VisionOutput } from '../vision/schema';
import { refineGeometry, wallMask, Walls, snapOpening, type GrayRaster } from './refine';
import { area, bounds, centre, contains, intersectionRatio, iou, simplePolygon } from './topology';

export interface ReconstructionIssue { code:string; message:string; refs:string[]; geometry?:Geometry }
export interface Reconstruction { output:VisionOutput; issues:ReconstructionIssue[]; connections:Array<{ref:string;rooms:string[]}> }
const spaces=new Set(['ROOM','CORRIDOR']);
const openings=new Set(['DOOR','ENTRANCE','EXIT','OPENING']);

/** Trace the outside of a pixel component. Inner obstacle loops are intentionally separate. */
function contour(pixels:number[], labels:Int32Array, id:number,w:number,h:number):Point[] {
  const edges=new Map<number,number[]>(), stride=w+1;
  const edge=(ax:number,ay:number,bx:number,by:number)=>{const a=ay*stride+ax,b=by*stride+bx;const list=edges.get(a)??[];list.push(b);edges.set(a,list);};
  const same=(x:number,y:number)=>x>=0&&y>=0&&x<w&&y<h&&labels[y*w+x]===id;
  for(const i of pixels){const x=i%w,y=Math.floor(i/w);
    if(!same(x,y-1))edge(x,y,x+1,y);
    if(!same(x+1,y))edge(x+1,y,x+1,y+1);
    if(!same(x,y+1))edge(x+1,y+1,x,y+1);
    if(!same(x-1,y))edge(x,y+1,x,y);
  }
  let largest:Point[]=[];
  while(edges.size){const start=edges.keys().next().value!;let at=start;const loop:Point[]=[];
    for(let guard=0;guard<4*(w+h)+pixels.length*4;guard++){
      loop.push({x:at%stride,y:Math.floor(at/stride)});
      const list=edges.get(at);if(!list?.length)break;
      const next=list.pop()!;if(!list.length)edges.delete(at);at=next;if(at===start)break;
    }
    if(loop.length>=3&&area({kind:'POLYGON',points:loop})>area({kind:'POLYGON',points:largest.length?largest:[{x:0,y:0},{x:0,y:0},{x:0,y:0}]}))largest=loop;
  }
  // Remove collinear pixel steps; keep corners, including recesses, then simplify small jaggies.
  const corners=largest.filter((p,i,ps)=>{const a=ps[(i+ps.length-1)%ps.length],b=ps[(i+1)%ps.length];return (p.x-a.x)*(b.y-p.y)!==(p.y-a.y)*(b.x-p.x);});
  if(corners.length<=12)return corners;
  const simplify=(ps:Point[],epsilon:number):Point[]=>{
    if(ps.length<3)return ps;
    const a=ps[0],b=ps[ps.length-1];let max=0,index=0;
    for(let i=1;i<ps.length-1;i++){const p=ps[i],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));const d=Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);if(d>max){max=d;index=i;}}
    return max>epsilon?[...simplify(ps.slice(0,index+1),epsilon).slice(0,-1),...simplify(ps.slice(index),epsilon)]:[a,b];
  };
  const half=Math.floor(corners.length/2);
  return [...simplify(corners.slice(0,half+1),1.25).slice(0,-1),...simplify([...corners.slice(half),corners[0]],1.25).slice(0,-1)];
}

/** Physical lengths never enter reconstruction. All work is in the trusted raster frame. */
function reconstructVariant(input:VisionOutput,raster:GrayRaster,recoverHatching=false):Reconstruction {
  const mask=wallMask(raster,undefined,recoverHatching),output=refineGeometry(input,raster,mask), {width:w,height:h}=raster;
  const issues:ReconstructionIssue[]=[], walls=new Walls(mask,w,h);
  for(const e of output.elements)if(e.openingConflict)issues.push({code:'SYMBOL_AMBIGUOUS',message:'Door/window observations disagree. Confirm the visible leaf, hinge or parallel window lines; neither interpretation was silently accepted.',refs:[e.ref],geometry:e.geometry});
  output.elements=output.elements.map(e=>{
    if(!openings.has(e.type))return e;
    const supported=snapOpening(walls,e.geometry);
    if(supported) {
      const b=bounds(supported),vertical=b.height>b.width,mid=Math.round(vertical?b.x+b.width/2:b.y+b.height/2),along=Math.round(vertical?b.y+b.height/2:b.x+b.width/2),reach=Math.round(Math.max(b.width,b.height)+Math.max(w,h)*.06),thickness=Math.max(3,Math.round(Math.min(b.width,b.height)*.5));
      const solid=(at:number)=>{let n=0,total=0;const lo=Math.round(vertical?b.x:b.y),hi=Math.round(vertical?b.x+b.width:b.y+b.height);for(let i=lo;i<hi;i++){n+=vertical?walls.at(i,at):walls.at(at,i);total++;}return total>0&&n/total>.7;};
      const edge=(direction:number)=>{let count=0;for(let d=1;d<reach;d++){const at=along+direction*d;if(at<0||at>=(vertical?h:w))break;if(solid(at)){count++;if(count>=thickness)return direction<0?at+count:at-count+1;}else count=0;}return undefined;};
      const lo=edge(-1),hi=edge(1);void mid;
      if(lo!==undefined&&hi!==undefined&&hi>lo&&hi-lo<Math.max(w,h)*.25)return {...e,geometry:vertical?{kind:'BBOX' as const,x:b.x,y:lo,width:b.width,height:hi-lo}:{kind:'BBOX' as const,x:lo,y:b.y,width:hi-lo,height:b.height}};
      return {...e,geometry:supported};
    }
    issues.push({code:'OPENING_UNSUPPORTED',message:'This symbol could not be placed on a supported wall gap. Its type and position need review.',refs:[e.ref],geometry:e.geometry});
    return {...e,type:'UNKNOWN' as const};
  });
  const unique:typeof output.elements=[];
  const rank=(type:string)=>type==='ENTRANCE'||type==='EXIT'?3:type==='DOOR'?2:type==='OPENING'?1:0;
  for(const e of output.elements) {
    const same=openings.has(e.type)?unique.find(o=>openings.has(o.type)&&intersectionRatio(e.geometry,o.geometry)/Math.max(1,Math.min(area(e.geometry),area(o.geometry)))>.8):undefined;
    if(!same){unique.push(e);continue;}
    same.openingConflict=Boolean(same.openingConflict||e.openingConflict);
    same.labels=[...(same.labels??[]),...(e.labels??[])].slice(0,40);same.measurements=[...same.measurements,...e.measurements];
    if(rank(e.type)>rank(same.type)){same.type=e.type;same.label=e.label??same.label;}
  }
  output.elements=unique;
  // Seal only already identified opening regions for component extraction, keeping their identity.
  for(const e of output.elements.filter(e=>openings.has(e.type))){const b=bounds(e.geometry);
    for(let y=Math.max(0,Math.floor(b.y)-1);y<Math.min(h,Math.ceil(b.y+b.height)+1);y++)for(let x=Math.max(0,Math.floor(b.x)-1);x<Math.min(w,Math.ceil(b.x+b.width)+1);x++)mask[y*w+x]=1;
  }
  // Close short gaps between collinear thick wall ends for segmentation only. This does
  // not create doors or measurements: a missed symbol remains an explicit review issue.
  const inferredGaps:Geometry[]=[];
  const sourceMask=mask.slice(),gapMin=Math.max(6,Math.round(Math.max(w,h)*.02)),gapMax=Math.round(Math.max(w,h)*.14);
  for(const vertical of [false,true]){
    const along=vertical?h:w,across=vertical?w:h,tracks=new Map<string,{start:number;end:number;from:number;to:number;flank:number}>();
    for(let ac=0;ac<across;ac++){
      const runs:Array<{start:number;end:number}>=[];let start=-1;
      for(let al=0;al<=along;al++){const on=al<along&&sourceMask[vertical?al*w+ac:ac*w+al];if(on&&start<0)start=al;if(!on&&start>=0){runs.push({start,end:al-1});start=-1;}}
      for(let i=0;i+1<runs.length;i++){const a=runs[i],b=runs[i+1],lo=a.end+1,hi=b.start,gap=hi-lo;if(gap<gapMin||gap>gapMax||Math.min(a.end-a.start+1,b.end-b.start+1)<Math.max(8,gap*.3))continue;
        const key=`${lo}:${hi}`,prior=tracks.get(key);if(prior&&prior.to===ac-1){prior.to=ac;prior.flank=Math.min(prior.flank,a.end-a.start+1,b.end-b.start+1);}else tracks.set(`${key}:${ac}`,{start:lo,end:hi,from:ac,to:ac,flank:Math.min(a.end-a.start+1,b.end-b.start+1)});
        // Keep the active track under its coordinate key as well.
        if(!prior||prior.to!==ac)tracks.set(key,tracks.get(`${key}:${ac}`)!);
      }
    }
    for(const t of new Set(tracks.values())){const thickness=t.to-t.from+1;if(thickness<3||thickness>Math.max(w,h)*.04||t.flank<thickness*(thickness<Math.max(w,h)*.015?3:.8))continue;
      const g:Geometry=vertical?{kind:'BBOX',x:t.from,y:t.start,width:thickness,height:t.end-t.start}:{kind:'BBOX',x:t.start,y:t.from,width:t.end-t.start,height:thickness};
      if(inferredGaps.some(o=>intersectionRatio(o,g)>area(g)*.8))continue;
      inferredGaps.push(g);const b=bounds(g);for(let y=b.y;y<b.y+b.height;y++)for(let x=b.x;x<b.x+b.width;x++)mask[y*w+x]=1;
    }
  }
  const labels=new Int32Array(w*h), queue=new Int32Array(w*h), components=new Map<number,{pixels:number[];exterior:boolean}>();let nextId=1;
  const component=(seed:number)=>{
    if(labels[seed])return components.get(labels[seed])!;
    const id=nextId++;let head=0,tail=0,exterior=false;const pixels:number[]=[];queue[tail++]=seed;labels[seed]=id;
    while(head<tail){const i=queue[head++],x=i%w,y=Math.floor(i/w);pixels.push(i);if(x===0||y===0||x===w-1||y===h-1)exterior=true;
      for(const j of [x?i-1:-1,x<w-1?i+1:-1,y?i-w:-1,y<h-1?i+w:-1])if(j>=0&&!mask[j]&&!labels[j]){labels[j]=id;queue[tail++]=j;}
    }
    const value={pixels,exterior};components.set(id,value);return value;
  };
  const claimed=new Map<number,string>();
  const master=new Map<string,typeof output.elements[number]>();
  output.elements=output.elements.filter(e=>{
    if(!spaces.has(e.type)&&!simplePolygon(e.geometry)&&e.geometry.kind!=='POLYLINE'){issues.push({code:'INVALID_POLYGON',message:'Invalid model contour was discarded.',refs:[e.ref],geometry:e.geometry});return false;}
    return true;
  }).sort((a,b)=>Number(spaces.has(b.type))-Number(spaces.has(a.type))||(spaces.has(a.type)?area(b.geometry)-area(a.geometry):0)).flatMap(e=>{
    if(!spaces.has(e.type))return [e];
    if(!simplePolygon(e.geometry)){issues.push({code:'INVALID_POLYGON',message:'The model contour crossed itself; its bounding region is retained for manual correction.',refs:[e.ref],geometry:{kind:'BBOX',...bounds(e.geometry)}});e={...e,geometry:{kind:'BBOX',...bounds(e.geometry)}};}
    const box=bounds(e.geometry), c=e.interiorPoint??centre(e.geometry);
    const seeds=new Set<number>();
    for(let iy=1;iy<12;iy++)for(let ix=1;ix<12;ix++){
      const p={x:Math.floor(box.x+box.width*ix/12),y:Math.floor(box.y+box.height*iy/12)};
      if(p.x>=0&&p.y>=0&&p.x<w&&p.y<h&&contains(e.geometry,p)&&!mask[p.y*w+p.x])seeds.add(p.y*w+p.x);
    }
    const cp={x:Math.round(c.x),y:Math.round(c.y)};
    if(cp.x>=0&&cp.y>=0&&cp.x<w&&cp.y<h&&!mask[cp.y*w+cp.x])seeds.add(cp.y*w+cp.x);
    const candidates=new Map<number,{seed:number;found:ReturnType<typeof component>;common:number;score:number}>();
    for(const seed of seeds){
      const found=component(seed),id=labels[seed];if(candidates.has(id))continue;
      let hits=0,samples=0;const sampleStep=Math.max(1,Math.ceil(found.pixels.length/4096));
      for(let j=0;j<found.pixels.length;j+=sampleStep){const i=found.pixels[j];hits+=Number(contains(e.geometry,{x:i%w+.5,y:Math.floor(i/w)+.5}));samples++;}
      const common=hits/Math.max(1,samples)*found.pixels.length;
      // A seed can land inside a wardrobe. Prefer a substantial enclosed floor component
      // with good agreement to the proposed room, rather than blindly accepting that seed.
      const seedMatch=cp.x>=0&&cp.y>=0&&cp.x<w&&cp.y<h&&labels[cp.y*w+cp.x]===id&&found.pixels.length>=area(e.geometry)*.3;
      const score=found.exterior?-Infinity:common-(found.pixels.length-common)*.7+(seedMatch?area(e.geometry)*.75:0);
      candidates.set(id,{seed,found,common,score});
    }
    const selected=[...candidates.values()].sort((a,b)=>b.score-a.score)[0];
    if(!selected){issues.push({code:'ROOM_SEED_MISSING',message:'No supported interior region; inspect the suggested boundary.',refs:[e.ref],geometry:e.geometry});return [e];}
    const {seed,found,common}=selected,id=labels[seed];
    if(claimed.has(id)) {
      const prior=master.get(claimed.get(id)!)!,a=e.interiorPoint??centre(e.geometry),b=prior.interiorPoint??centre(prior.geometry),steps=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y));let wallHits=0;
      for(let i=0;i<=steps;i++){const x=Math.round(a.x+(b.x-a.x)*i/Math.max(1,steps)),y=Math.round(a.y+(b.y-a.y)*i/Math.max(1,steps));if(x>=0&&y>=0&&x<w&&y<h)wallHits+=mask[y*w+x];}
      if(wallHits<3){prior.labels=[...(prior.labels??[]),...(e.labels??[])].slice(0,40);if(e.label&&e.label!==prior.label)prior.label=[prior.label,e.label].filter(Boolean).join(' / ').slice(0,200);issues.push({code:'OPEN_PLAN_ZONES',message:'These labelled zones share one physically open space; no separating wall was invented.',refs:[prior.ref],geometry:prior.geometry});return [];}
    }
    if(found.exterior||found.pixels.length<area(e.geometry)*.3||found.pixels.length>area(e.geometry)*(e.interiorPoint?3:1.65)||common/Math.max(1,found.pixels.length)<(e.interiorPoint ? .3 : .55)||claimed.has(id)){
      issues.push({code:'ROOM_BOUNDARY_UNRESOLVED',message:'An open connection or incomplete wall prevents an independent room contour. This boundary is a suggested zone, not a detected wall.',refs:[e.ref,...(claimed.has(id)?[claimed.get(id)!]:[])],geometry:e.geometry});return [e];
    }
    const points=contour(found.pixels,labels,id,w,h), geometry:Geometry={kind:'POLYGON',points};
    if(points.length<3||points.length>400||!simplePolygon(geometry)){issues.push({code:'ROOM_CONTOUR_INVALID',message:'The wall contour could not be validated; inspect the suggestion.',refs:[e.ref],geometry:e.geometry});return [e];}
    const updated={...e,geometry}; claimed.set(id,e.ref);master.set(e.ref,updated);return [updated];
  });
  // Independently inspect enclosed floor components. An overview omission must not make
  // an unnumbered bathroom disappear. These are evidence-backed, unlabelled suggestions,
  // never confirmed room functions or dimensions. Small furniture enclosures are excluded.
  const step=Math.max(4,Math.round(Math.max(w,h)*.01)),seen=new Set<number>();
  for(let y=step;y<h;y+=step)for(let x=step;x<w;x+=step){
    const seed=y*w+x;if(mask[seed])continue;const found=component(seed),id=labels[seed];
    if(seen.has(id))continue;seen.add(id);
    if(claimed.has(id)||found.exterior||found.pixels.length<w*h*.006||found.pixels.length>w*h*.5)continue;
    const points=contour(found.pixels,labels,id,w,h),geometry:Geometry={kind:'POLYGON',points};
    if(points.length<3||points.length>400||!simplePolygon(geometry))continue;
    const b=bounds(geometry);if(Math.min(b.width,b.height)<Math.max(w,h)*.035||area(geometry)/(b.width*b.height)<.25)continue;
    const represented=output.elements.find(e=>spaces.has(e.type)&&iou(e.geometry,geometry)>.65);
    if(represented)continue;
    const enclosing=output.elements.find(e=>spaces.has(e.type)&&!issues.some(i=>['ROOM_BOUNDARY_UNRESOLVED','ROOM_SEED_MISSING','ROOM_CONTOUR_INVALID'].includes(i.code)&&i.refs.includes(e.ref))&&intersectionRatio(geometry,e.geometry)>area(geometry)*.9);
    if(enclosing){issues.push({code:'INTERIOR_ENCLOSURE',message:'An enclosed shape inside this room may be furniture or a nested space. No extra room was created; inspect the drawing evidence.',refs:[enclosing.ref],geometry});continue;}
    if(output.elements.length>=150){output.warnings.push('Further enclosed regions were withheld at the element limit.');break;}
    const ref=`enclosed-${id}`;
    output.elements.push({ref,type:'ROOM',geometry,measurements:[]});claimed.set(id,ref);
    issues.push({code:'ROOM_UNLABELLED',message:'An enclosed region was detected from wall evidence but not reliably identified by Vision. Confirm whether it is a room and inspect its boundary.',refs:[ref],geometry});
  }
  for(const geometry of inferredGaps)issues.push({code:'WALL_GAP_REVIEW',message:'A short aligned wall gap was closed only to trace room interiors. Confirm the opening symbol and boundary; no door type or physical width was inferred.',refs:output.elements.filter(e=>spaces.has(e.type)&&intersectionRatio({kind:'BBOX',x:bounds(geometry).x-3,y:bounds(geometry).y-3,width:bounds(geometry).width+6,height:bounds(geometry).height+6},e.geometry)>0).map(e=>e.ref),geometry});
  const rooms=output.elements.filter(e=>spaces.has(e.type));
  for(let i=0;i<rooms.length;i++)for(let j=i+1;j<rooms.length;j++){
    const a=rooms[i],b=rooms[j],overlap=intersectionRatio(a.geometry,b.geometry);
    if(overlap>Math.min(area(a.geometry),area(b.geometry))*.025)issues.push({code:'ROOM_OVERLAP',message:'Suggested spaces overlap; confirm or correct their boundary.',refs:[a.ref,b.ref],geometry:a.geometry});
  }
  const connections=output.elements.filter(e=>openings.has(e.type)).map(e=>{
    const b=bounds(e.geometry),c=centre(e.geometry),pad=Math.max(4,Math.min(b.width,b.height)*1.5);
    const probes=b.width>b.height?[{x:c.x,y:b.y-pad},{x:c.x,y:b.y+b.height+pad}]:[{x:b.x-pad,y:c.y},{x:b.x+b.width+pad,y:c.y}];
    const matches=[...new Set(probes.flatMap(p=>rooms.filter(r=>contains(r.geometry,p)).map(r=>r.ref)))];
    if(!matches.length)issues.push({code:'OPENING_CONNECTION_UNRESOLVED',message:'The opening is not linked to a supported room boundary.',refs:[e.ref],geometry:e.geometry});
    return {ref:e.ref,rooms:matches.slice(0,2)};
  });
  for(const warning of output.warnings)if(warning.startsWith('No wall gap'))issues.push({code:'OPENING_POSITION_APPROXIMATE',message:warning,refs:[]});
  return {output,issues,connections};
}

/** Prefer stable filled-wall contours; use a hatch hypothesis only for an unresolved space.
 * A speculative mask must never replace a supported room with a furniture-derived contour. */
export function reconstructRooms(input:VisionOutput,raster:GrayRaster):Reconstruction {
  const base=reconstructVariant(structuredClone(input),raster);
  const unresolved=new Set(base.issues.filter(i=>['ROOM_BOUNDARY_UNRESOLVED','ROOM_SEED_MISSING','ROOM_CONTOUR_INVALID','INVALID_POLYGON'].includes(i.code)).flatMap(i=>i.refs));
  if(!unresolved.size)return base;
  const alternate=reconstructVariant(structuredClone(input),raster,true);
  const badAlternate=new Set(alternate.issues.filter(i=>['ROOM_BOUNDARY_UNRESOLVED','ROOM_SEED_MISSING','ROOM_CONTOUR_INVALID'].includes(i.code)).flatMap(i=>i.refs));
  const candidates=alternate.output.elements.filter(e=>spaces.has(e.type)&&!badAlternate.has(e.ref));
  const used=new Set<string>(),replaced=new Set<string>();
  for(const e of base.output.elements.filter(e=>spaces.has(e.type)&&!unresolved.has(e.ref)))for(const other of candidates)if(iou(e.geometry,other.geometry)>.65)used.add(other.ref);
  for(const e of base.output.elements.filter(e=>spaces.has(e.type)&&unresolved.has(e.ref))){
    const anchor=e.labels?.find(l=>l.kind==='ROOM_LABEL'&&l.text===e.label)?.geometry;
    const point=anchor?centre(anchor):e.interiorPoint;
    const matches=candidates.filter(c=>!used.has(c.ref)&&iou(e.geometry,c.geometry)>.25).map(c=>({element:c,score:iou(e.geometry,c.geometry)+(point&&contains(c.geometry,point)? .5 : 0)})).sort((a,b)=>b.score-a.score);
    const selected=matches[0]?.element;if(!selected)continue;
    e.geometry=selected.geometry;used.add(selected.ref);replaced.add(e.ref);
    base.issues.push({code:'ROOM_MASK_VARIANT',message:'This contour uses a narrow hatched-wall hypothesis. Confirm the wall faces and room boundary.',refs:[e.ref],geometry:e.geometry});
  }
  base.issues=base.issues.filter(i=>i.code!=='ROOM_OVERLAP'&&!(i.refs.some(r=>replaced.has(r))&&['ROOM_BOUNDARY_UNRESOLVED','ROOM_SEED_MISSING','ROOM_CONTOUR_INVALID'].includes(i.code)));
  const rooms=base.output.elements.filter(e=>spaces.has(e.type));
  for(let i=0;i<rooms.length;i++)for(let j=i+1;j<rooms.length;j++){const a=rooms[i],b=rooms[j];if(intersectionRatio(a.geometry,b.geometry)>Math.min(area(a.geometry),area(b.geometry))*.025)base.issues.push({code:'ROOM_OVERLAP',message:'Suggested spaces overlap; confirm or correct their boundary.',refs:[a.ref,b.ref],geometry:a.geometry});}
  base.connections=base.output.elements.filter(e=>openings.has(e.type)).map(e=>{const b=bounds(e.geometry),c=centre(e.geometry),pad=Math.max(4,Math.min(b.width,b.height)*1.5),probes=b.width>b.height?[{x:c.x,y:b.y-pad},{x:c.x,y:b.y+b.height+pad}]:[{x:b.x-pad,y:c.y},{x:b.x+b.width+pad,y:c.y}];return {ref:e.ref,rooms:rooms.filter(r=>probes.some(p=>contains(r.geometry,p))).map(r=>r.ref).slice(0,2)};});
  return base;
}
