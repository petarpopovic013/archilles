import type { Geometry, Point } from '../domain/project';

export function bounds(g: Geometry) {
  if (g.kind === 'BBOX') return { x: g.x, y: g.y, width: g.width, height: g.height };
  const xs = g.points.map(p => p.x), ys = g.points.map(p => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}
export function vertices(g: Geometry): Point[] {
  return g.kind === 'BBOX' ? [{x:g.x,y:g.y},{x:g.x+g.width,y:g.y},{x:g.x+g.width,y:g.y+g.height},{x:g.x,y:g.y+g.height}] : g.points;
}
export function contains(g: Geometry, p: Point): boolean {
  const ps=vertices(g); let hit=false;
  for(let i=0,j=ps.length-1;i<ps.length;j=i++) {
    const a=ps[i],b=ps[j];
    if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x) hit=!hit;
  }
  return hit;
}
export function area(g: Geometry): number {
  const ps=vertices(g); return Math.abs(ps.reduce((s,a,i)=>{const b=ps[(i+1)%ps.length];return s+a.x*b.y-b.x*a.y;},0))/2;
}
export function simplePolygon(g: Geometry): boolean {
  if(g.kind==='BBOX') return g.width>0&&g.height>0;
  if(g.kind==='POLYLINE'||area(g)<1) return false;
  const p=g.points, n=p.length;
  const cross=(a:Point,b:Point,c:Point)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const on=(a:Point,b:Point,c:Point)=>Math.abs(cross(a,b,c))<1e-8&&c.x>=Math.min(a.x,b.x)&&c.x<=Math.max(a.x,b.x)&&c.y>=Math.min(a.y,b.y)&&c.y<=Math.max(a.y,b.y);
  for(let i=0;i<n;i++) {
    if(Math.hypot(p[i].x-p[(i+1)%n].x,p[i].y-p[(i+1)%n].y)<1e-6) return false;
    for(let j=i+1;j<n;j++) {
      if(j===i+1||(i===0&&j===n-1)) continue;
      const a=p[i],b=p[(i+1)%n],c=p[j],d=p[(j+1)%n];
      if(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b)) return false;
    }
  }
  return true;
}
/** Raster sampling is used only for diagnostics/matching, never physical dimensions. */
export function intersectionRatio(a: Geometry,b: Geometry, steps=48): number {
  const A=bounds(a),B=bounds(b),x=Math.max(A.x,B.x),y=Math.max(A.y,B.y),w=Math.min(A.x+A.width,B.x+B.width)-x,h=Math.min(A.y+A.height,B.y+B.height)-y;
  if(w<=0||h<=0) return 0;
  let both=0;for(let iy=0;iy<steps;iy++)for(let ix=0;ix<steps;ix++){const p={x:x+(ix+.5)*w/steps,y:y+(iy+.5)*h/steps};if(contains(a,p)&&contains(b,p))both++;}
  return both/(steps*steps)*w*h;
}
export function iou(a:Geometry,b:Geometry){const n=intersectionRatio(a,b);return n/Math.max(1,area(a)+area(b)-n);}
export function centre(g:Geometry):Point {const b=bounds(g);return {x:b.x+b.width/2,y:b.y+b.height/2};}
