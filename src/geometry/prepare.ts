import { createHash } from 'node:crypto';
import { DrawingSchema, type Drawing } from '../domain/project';
import { invertTransform, type Affine } from './transforms';
import { GeometryError, type PageRenderer, type PreparedPage } from './types';
export const PREPROCESSING_VERSION = 'page-v1';
export async function prepareDrawingPage(input: {
  drawing: Drawing; page: number; readPrivate: (key: string)=>Promise<Uint8Array>;
  writePrivateRaster: (bytes: Uint8Array)=>Promise<string>; renderer: PageRenderer;
}): Promise<PreparedPage> {
  const d=DrawingSchema.parse(input.drawing);
  if (!Number.isInteger(input.page)||input.page<1) throw new GeometryError('INVALID_PAGE');
  if(d.byteSize>20*1024*1024) throw new GeometryError('FILE_TOO_LARGE');
  const bytes=await input.readPrivate(d.storageKey);
  if(bytes.length!==d.byteSize || createHash('sha256').update(bytes).digest('hex')!==d.sha256) throw new GeometryError('DRAWING_INTEGRITY');
  const hex=Buffer.from(bytes.subarray(0,8)).toString('hex');
  const detected=hex==='89504e470d0a1a0a'?'image/png':hex.startsWith('ffd8ff')?'image/jpeg':Buffer.from(bytes.subarray(0,5)).toString()==='%PDF-'?'application/pdf':undefined;
  if(detected!==d.mimeType) throw new GeometryError('MIME_MISMATCH');
  let meta: Awaited<ReturnType<PageRenderer['inspect']>>;
  try { meta=await input.renderer.inspect(bytes,d.mimeType,input.page); }
  catch(e) { if(e instanceof GeometryError) throw e; throw new GeometryError('UNRENDERABLE_PAGE'); }
  if(!Number.isInteger(meta.pageCount)||meta.pageCount<1||meta.pageCount>20) throw new GeometryError('PAGE_LIMIT');
  if(meta.pageCount!==d.pageCount || input.page>meta.pageCount) throw new GeometryError('INVALID_PAGE');
  if(!Number.isSafeInteger(meta.width)||!Number.isSafeInteger(meta.height)||meta.width<=0||meta.height<=0||meta.width*meta.height>40_000_000) throw new GeometryError('PIXEL_LIMIT');
  const scale=Math.min(1,2048/Math.max(meta.width,meta.height));
  const rasterWidth=Math.max(1,Math.round(meta.width*scale)),rasterHeight=Math.max(1,Math.round(meta.height*scale));
  const sourceToRaster: Affine=[rasterWidth/meta.width,0,0,rasterHeight/meta.height,0,0];
  let raster: Uint8Array;
  try { raster=await input.renderer.render(bytes,d.mimeType,input.page,rasterWidth,rasterHeight); }
  catch { throw new GeometryError('UNRENDERABLE_PAGE'); }
  if(raster.length<24||Buffer.from(raster.subarray(0,8)).toString('hex')!=='89504e470d0a1a0a') throw new GeometryError('INVALID_RASTER');
  const rasterHeader=new DataView(raster.buffer,raster.byteOffset,raster.byteLength);
  if(rasterHeader.getUint32(16)!==rasterWidth||rasterHeader.getUint32(20)!==rasterHeight) throw new GeometryError('RASTER_DIMENSION_MISMATCH');
  return {projectId:d.projectId,drawingId:d.id,revision:d.revision,page:input.page,sha256:d.sha256,
    sourceWidth:meta.width,sourceHeight:meta.height,rasterWidth,rasterHeight,
    rasterReference:await input.writePrivateRaster(raster),sourceToRaster,rasterToSource:invertTransform(sourceToRaster),
    rotation:meta.rotation,dpi:144,cropBox:meta.cropBox,preprocessingVersion:PREPROCESSING_VERSION};
}
