import sharp from 'sharp';
import { createCanvas } from '@napi-rs/canvas';
import type { Drawing, Geometry } from '../domain/project';
import { GeometryError, type PreparedPage } from './types';
import { openPdf, selectPdfPage } from './node-renderer';
import type { SourceRegion } from '../vision/pipeline-types';

/** Bounded crops from the private ORIGINAL, never from the downsampled viewer raster. */
export function createSourceReader(bytes:Uint8Array,mime:Drawing['mimeType'],page:PreparedPage) {
  async function region(box:Extract<Geometry,{kind:'BBOX'}>):Promise<SourceRegion>{
    if(![box.x,box.y,box.width,box.height].every(Number.isFinite)||box.width<=0||box.height<=0||box.x<0||box.y<0||box.x+box.width>page.sourceWidth+.01||box.y+box.height>page.sourceHeight+.01)throw new GeometryError('INVALID_REGION');
    const x=Math.floor(box.x),y=Math.floor(box.y),bw=Math.min(page.sourceWidth-x,Math.ceil(box.width)),bh=Math.min(page.sourceHeight-y,Math.ceil(box.height));
    const scale=Math.min(2,1500/Math.max(bw,bh),Math.sqrt(1_500_000/(bw*bh))),width=Math.max(1,Math.round(bw*scale)),height=Math.max(1,Math.round(bh*scale));
    let image:Uint8Array;
    if(mime!=='application/pdf') image=await sharp(bytes,{limitInputPixels:40_000_000}).autoOrient().extract({left:x,top:y,width:bw,height:bh}).resize(width,height,{fit:'fill'}).flatten({background:'#fff'}).png().toBuffer();
    else {
      const handle=await openPdf(bytes);
      try {const {selected}=await selectPdfPage(handle.document,page.page),canvas=createCanvas(width,height),ctx=canvas.getContext('2d');
        await selected.render({canvas:canvas as unknown as HTMLCanvasElement,canvasContext:ctx as unknown as CanvasRenderingContext2D,viewport:selected.getViewport({scale:2}),transform:[width/bw,0,0,height/bh,-x*width/bw,-y*height/bh],background:'#fff'}).promise;
        image=await canvas.encode('png');
      }finally{await handle.close();}
    }
    return {id:`${x},${y},${bw},${bh}`,geometry:{kind:'BBOX',x,y,width:bw,height:bh},image,width,height};
  }
  async function text():Promise<Array<{text:string;geometry:Geometry}>> {
    if(mime!=='application/pdf')return [];
    const handle=await openPdf(bytes);
    try {
      const {selected}=await selectPdfPage(handle.document,page.page),viewport=selected.getViewport({scale:2}),content=await selected.getTextContent();
      return content.items.flatMap(item=>{
        if(!('str' in item)||!item.str.trim()||item.str.length>1000)return [];
        const [a,b,c,d,e,f]=viewport.transform, t=item.transform;
        const x=a*t[4]+c*t[5]+e,y=b*t[4]+d*t[5]+f;
        const ux=a*t[0]+c*t[1],uy=b*t[0]+d*t[1],n=Math.hypot(ux,uy)||1,fh=Math.hypot(a*t[2]+c*t[3],b*t[2]+d*t[3]);
        const ascent=content.styles[item.fontName]?.ascent??.85;
        const dx=ux/n*item.width*2,dy=uy/n*item.width*2,nx=uy/n*fh,ny=-ux/n*fh;
        const ps=[{x:x+nx*ascent,y:y+ny*ascent},{x:x+dx+nx*ascent,y:y+dy+ny*ascent},{x:x+dx-nx*(1-ascent),y:y+dy-ny*(1-ascent)},{x:x-nx*(1-ascent),y:y-ny*(1-ascent)}];
        if(ps.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.y<0||p.x>page.sourceWidth||p.y>page.sourceHeight))return [];
        return [{text:item.str,geometry:{kind:'POLYGON' as const,points:ps}}];
      }).slice(0,1000);
    }finally{await handle.close();}
  }
  return {region,text};
}
