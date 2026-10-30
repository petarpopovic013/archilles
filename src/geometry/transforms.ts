import type { Geometry, Point } from '../domain/project';
export type Affine = readonly [number, number, number, number, number, number];
export const identity: Affine = [1, 0, 0, 1, 0, 0];
export function transformPoint([a,b,c,d,e,f]: Affine, p: Point): Point {
  return { x: a*p.x+c*p.y+e, y: b*p.x+d*p.y+f };
}
export function invertTransform([a,b,c,d,e,f]: Affine): Affine {
  const det = a*d-b*c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) throw new Error('INVALID_TRANSFORM');
  return [d/det,-b/det,-c/det,a/det,(c*f-d*e)/det,(b*e-a*f)/det];
}
export function transformGeometry(t: Affine, g: Geometry): Geometry {
  if (g.kind !== 'BBOX') return { ...g, points: g.points.map(p => transformPoint(t,p)) };
  const points = [{x:g.x,y:g.y},{x:g.x+g.width,y:g.y},{x:g.x,y:g.y+g.height},{x:g.x+g.width,y:g.y+g.height}].map(p=>transformPoint(t,p));
  const x=Math.min(...points.map(p=>p.x)), y=Math.min(...points.map(p=>p.y));
  return {kind:'BBOX',x,y,width:Math.max(...points.map(p=>p.x))-x,height:Math.max(...points.map(p=>p.y))-y};
}
