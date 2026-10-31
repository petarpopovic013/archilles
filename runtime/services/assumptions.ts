import { createHash } from "node:crypto";
import { MeasurementSchema, type ArchitecturalElement, type ComplianceRule, type GeometryReport, type Measurement } from "../../src/domain";
import { bounds } from "../../src/geometry/topology";
import { currentMeasurement } from "../../src/rules/engine";

export function stableId(key: string): string {
  const h = createHash("sha256").update(key).digest("hex");
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}

/** Literal annotations are interpreted by ordinary code. Every generated value stays unverified. */
export function drawingProposals(report: GeometryReport | undefined, elements: ArchitecturalElement[], measurements: Measurement[], rules: ComplianceRule[], revision: number, now: string): Measurement[] {
  if (!report) return [];
  const factor = { m: 1, cm: .01, mm: .001 };
  const spans = report.annotations.flatMap(a => {
    const unit = a.unit ?? report.settings.unit;
    const match = a.text.trim().match(/^(\d+(?:[.,]\d+)?)\s*(?:mm|cm|m)?$/i);
    if (a.kind !== "DIMENSION" || !unit || !match || !a.span || a.association === "UNRESOLVED") return [];
    const pixels = Math.hypot(a.span[0].x-a.span[1].x,a.span[0].y-a.span[1].y);
    const metres = Number(match[1].replace(",", "."))*factor[unit];
    return pixels >= 10 && metres > 0 ? [{ annotation: a, metres, scale: metres/pixels }] : [];
  });
  const sorted = [...spans].sort((a,b)=>a.scale-b.scale);
  const median = sorted[Math.floor(sorted.length/2)];
  // Disagreement is visible uncertainty, not a convenient choice of scale.
  const consistent = median && spans.every(s => Math.abs(s.scale/median.scale-1) <= .05);
  if (consistent) report.automaticScale = {metresPerPixel: median.scale, annotationId: median.annotation.id};
  else delete report.automaticScale;
  const scale = report.metresPerPixel ?? (consistent ? median.scale : undefined);
  const result: Measurement[] = [];
  for (const element of elements) {
    const metrics = [...new Set(rules.filter(r=>r.elementType===element.type).flatMap(r=>r.requiredInputs))];
    for (const metric of metrics) {
      const previous = currentMeasurement(measurements,element.id,metric);
      if (previous && (previous.verification !== "UNVERIFIED" || previous.recordedBy !== "automatic-drawing-proposal")) continue;
      let value: number | undefined, originalUnit: string | undefined, raw = "", evidenceIds: string[] = [];
      // A span is not automatically a width/height: accept only an explicit clear-width label.
      if(metric === "CLEAR_WIDTH_M") {
        const explicit = report.annotations.find(a=>a.elementId===element.id && a.kind==='DIMENSION' && /(?:clear\s*width|svetl[aie]\s*[šs]irin|светл[аеи]\s*ширин)/i.test(a.text));
        const number = explicit?.text.match(/(\d+(?:[.,]\d+)?)\s*(mm|cm|m)\b/i);
        if(explicit && number) { value=Number(number[1].replace(',','.'))*factor[number[2].toLowerCase() as keyof typeof factor];raw=explicit.text;originalUnit=number[2];evidenceIds=[explicit.id]; }
        // Nominal door pairs support a scenario only, never verified clear width.
        if(value===undefined && ['DOOR','ENTRANCE','EXIT'].includes(element.type)) {
          const pairs=report.annotations.filter(a=>a.elementId===element.id&&a.kind==='NOMINAL_OPENING').flatMap(a=>{
            const u=a.unit??report.settings.unit,m=a.text.match(/^(\d+(?:[.,]\d+)?)\s*[/×x]\s*(\d+(?:[.,]\d+)?)(?:\s*(?:mm|cm|m))?$/i);
            return u&&m?[{a,u,value:Math.min(Number(m[1].replace(',','.')),Number(m[2].replace(',','.')))*factor[u]}]:[];
          });
          if(pairs.length && pairs.every(p=>Math.abs(p.value-pairs[0].value)<1e-6)) { const p=pairs[0];value=p.value;raw=`Nominal opening assumed as clear width: ${p.a.text}`;originalUnit=p.u;evidenceIds=pairs.map(p=>p.a.id); }
        }
        if(value===undefined && scale && ['DOOR','ENTRANCE','EXIT'].includes(element.type)) {const b=bounds(element.geometry);value=Math.max(b.width,b.height)*scale;raw='Opening gap geometry used as approximate clear width';evidenceIds=[...element.evidenceIds,...(report.automaticScale?[report.automaticScale.annotationId]:[])];}
      }
      if(value===undefined && metric==='CLEAR_WIDTH_M' && scale && ['CORRIDOR','STAIR','RAMP'].includes(element.type) && !/FURNITURE|RAIL/i.test(element.subtype??'')) {
        const g=element.geometry,b=bounds(g);
        const rectangle=g.kind==='BBOX'||g.kind==='POLYGON'&&g.points.length===4&&g.points.every(p=>(p.x===b.x||p.x===b.x+b.width)&&(p.y===b.y||p.y===b.y+b.height));
        const pixels=rectangle?Math.min(b.width,b.height):g.kind==='POLYGON'?polygonWidth(g.points):undefined;
        if(pixels!==undefined&&pixels>2){value=pixels*scale;raw=`Approximate ${element.type.toLowerCase()} cross-section from drawing scale`;evidenceIds=[...element.evidenceIds,...(report.automaticScale?[report.automaticScale.annotationId]:[])];}
      }
      // Other metrics need explicit semantic measurement evidence, not generic room spans.
      if(value===undefined || !Number.isFinite(value) || value<=0)continue;
      const id=stableId(`${element.id}:${revision}:${metric}:${value}:${raw}`);
      if(previous?.id===id || previous?.value===value && previous.originalUnit===originalUnit && JSON.stringify(previous.evidenceIds)===JSON.stringify(evidenceIds))continue;
      result.push(MeasurementSchema.parse({id,projectId:element.projectId,elementId:element.id,revision,metric,value,unit:'m',source:'AI_ESTIMATE',verification:'UNVERIFIED',assumption:raw,originalUnit,evidenceIds,recordedBy:'automatic-drawing-proposal',recordedAt:now,supersedesId:previous?.id}));
    }
  }
  return result;
}

/** Working semantic assumptions for the review scenario, not human classification records. */
export function categoryProposals(elements:ArchitecturalElement[],report:GeometryReport|undefined,rules:ComplianceRule[]):ArchitecturalElement[]{
  const allowed=(condition:ComplianceRule['applicability']):string[]=>{
    if(condition.op==='ALL'||condition.op==='ANY')return condition.children.flatMap(allowed);
    return 'field' in condition&&condition.field==='element.subtype'&&'value' in condition?(Array.isArray(condition.value)?condition.value:typeof condition.value==='string'?[condition.value]:[]):[];
  };
  return elements.flatMap(e=>{
    if(e.extraction!=='AI_SUGGESTED'||e.subtype)return [];
    const choices=rules.filter(r=>r.elementType===e.type).flatMap(r=>allowed(r.applicability));
    let subtype:string|undefined,reason='';
    if(['DOOR','ENTRANCE','EXIT'].includes(e.type)){
      const adjacent=report?.openings.find(o=>o.elementId===e.id)?.roomIds.length??0;
      const explicitEntrance=e.type==='ENTRANCE'||/\b(?:entrance|entry|ulaz|улаз)\b/i.test(e.label??'');
      subtype=explicitEntrance?'ACCESSIBLE_ENTRANCE_DOOR_ART22':'ACCESSIBLE_INTERNAL_DOOR_ART22';
      reason=explicitEntrance?'Entrance role suggested by the detected element type or label. Accessible role is a working assumption.':`ASSUMED_INTERNAL: detected door${adjacent>=2?' connecting two spaces':''}; treated as internal for the preliminary review. Entrance selection can correct this.`;
    }else if(e.type==='CORRIDOR'){
      subtype='ABOVE_GROUND_EVACUATION_CORRIDOR';reason='Detected circulation space is assumed to be an above-ground evacuation corridor for this preliminary scenario.';
    }
    if(!subtype||!choices.includes(subtype))return [];
    return [{...e,subtype,classificationReason:reason}];
  });
}

/** Approximate a narrow internal cross-section; never a certified route/clearance calculation. */
export function polygonWidth(points:Array<{x:number;y:number}>):number|undefined {
  const cuts=(axis:'x'|'y')=>{
    const other=axis==='x'?'y':'x',values=points.map(p=>p[axis]),min=Math.min(...values),max=Math.max(...values);
    const widths=[.25,.5,.75].flatMap(f=>{
      const coordinate=min+(max-min)*f,hits:number[]=[];
      points.forEach((a,i)=>{const b=points[(i+1)%points.length];if((a[axis]<=coordinate&&b[axis]>coordinate)||(b[axis]<=coordinate&&a[axis]>coordinate))hits.push(a[other]+(coordinate-a[axis])*(b[other]-a[other])/(b[axis]-a[axis]));});
      hits.sort((a,b)=>a-b);const spans=[];for(let i=0;i+1<hits.length;i+=2)if(hits[i+1]-hits[i]>2)spans.push(hits[i+1]-hits[i]);
      return spans.length?[Math.max(...spans)]:[];
    }).sort((a,b)=>a-b);
    return widths.length?widths[Math.floor(widths.length/2)]:undefined;
  };
  const values=[cuts('x'),cuts('y')].filter((v):v is number=>v!==undefined);
  return values.length?Math.min(...values):undefined;
}
