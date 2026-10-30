import type { Drawing } from '../domain/project';
import { GeometryError, type PageRenderer } from './types';
/** Browser-only renderer. Caller configures the PDF.js worker URL in the viewer bundle. */
export function createBrowserPageRenderer(): PageRenderer {
  async function pdf(bytes:Uint8Array) {
    const {getDocument}=await import('pdfjs-dist');
    const task=getDocument({data:bytes.slice()});
    task.onPassword=()=>{void task.destroy();};
    try { return {document:await task.promise,destroy:()=>task.destroy()}; } catch { throw new GeometryError('PDF_ENCRYPTED_OR_CORRUPT'); }
  }
  function dimensions(bytes:Uint8Array,mime:Drawing['mimeType']) {
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    if(mime==='image/png') {
      if(bytes.length<24) throw new GeometryError('CORRUPT_IMAGE');
      return {width:view.getUint32(16),height:view.getUint32(20)};
    }
    let offset=2;
    while(offset+4<=bytes.length) {
      if(bytes[offset++]!==255) throw new GeometryError('CORRUPT_IMAGE');
      const marker=bytes[offset++];
      if(marker===0xd9||marker===0xda) break;
      const length=view.getUint16(offset);
      if(length<2||offset+length>bytes.length) break;
      if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) return {width:view.getUint16(offset+5),height:view.getUint16(offset+3)};
      offset+=length;
    }
    throw new GeometryError('CORRUPT_IMAGE');
  }
  async function image(bytes:Uint8Array,mime:string) {
    const raw=dimensions(bytes,mime as Drawing['mimeType']);
    if(raw.width*raw.height>40_000_000) throw new GeometryError('PIXEL_LIMIT');
    return createImageBitmap(new Blob([Uint8Array.from(bytes)],{type:mime}),{imageOrientation:'from-image'});
  }
  return {
    async inspect(bytes,mime,page) {
      if(mime!=='application/pdf') { const bitmap=await image(bytes,mime);try{return {pageCount:1,width:bitmap.width,height:bitmap.height,rotation:0};}finally{bitmap.close();} }
      const handle=await pdf(bytes),doc=handle.document;
      try {
        if(doc.numPages>20) throw new GeometryError('PAGE_LIMIT');
        if(page>doc.numPages) throw new GeometryError('INVALID_PAGE');
        const selected=await doc.getPage(page),viewport=selected.getViewport({scale:2});
        return {pageCount:doc.numPages,width:Math.ceil(viewport.width),height:Math.ceil(viewport.height),rotation:selected.rotate,cropBox:selected.view};
      } finally {await handle.destroy();}
    },
    async render(bytes,mime,page,width,height) {
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext('2d');if(!ctx) throw new GeometryError('CANVAS_UNAVAILABLE');
      if(mime==='application/pdf') {
        const handle=await pdf(bytes),doc=handle.document;
        try {const selected=await doc.getPage(page),base=selected.getViewport({scale:1});
          await selected.render({canvas,canvasContext:ctx,viewport:selected.getViewport({scale:width/base.width}),transform:[1,0,0,height/(base.height*width/base.width),0,0]}).promise;
        }finally{await handle.destroy();}
      } else {const bitmap=await image(bytes,mime);try{ctx.drawImage(bitmap,0,0,width,height);}finally{bitmap.close();}}
      return new Uint8Array(await (await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new GeometryError('RASTER_ENCODING_FAILED')),'image/png'))).arrayBuffer());
    },
  };
}
