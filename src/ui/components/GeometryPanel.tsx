"use client";
import {useWorkspace} from '../state/workspace';
export function GeometryPanel(){
  const {snapshot}=useWorkspace();
  if(!snapshot?.geometry)return null;
  return <p className="text-xs" role="status">{snapshot.geometry.stage==='PARTIAL'?'Drawing read · some details need review':'Drawing read'}</p>;
}
