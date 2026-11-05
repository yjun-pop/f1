import * as THREE from 'three';
import type {Track} from './Track';

export interface TunnelLayout {start:number;end:number;halfWidth:number;height:number;thickness:number;centers:THREE.Vector3[];left:THREE.Vector3[];right:THREE.Vector3[];outerLeft:THREE.Vector3[];outerRight:THREE.Vector3[]}
/** The renderer and collider consume exactly the same wall vertices. */
export function createTunnelLayout(track:Track):TunnelLayout|undefined {
  const definition=track.circuit.tunnel;if(!definition)return;
  const start=track.sections.find(s=>s.number===definition.from)!.progress+30/track.length,end=track.sections.find(s=>s.number===definition.to)!.progress-65/track.length;
  const rows=Math.max(2,Math.ceil((end-start)*track.length/3)),halfWidth=12.4,height=5.8,thickness=.3,centers:THREE.Vector3[]=[],left:THREE.Vector3[]=[],right:THREE.Vector3[]=[],outerLeft:THREE.Vector3[]=[],outerRight:THREE.Vector3[]=[];
  for(let i=0;i<=rows;i++){const t=THREE.MathUtils.lerp(start,end,i/rows),p=track.roadPoint(t),n=track.roadNormal(t);centers.push(p);left.push(p.clone().addScaledVector(n,-halfWidth));right.push(p.clone().addScaledVector(n,halfWidth));outerLeft.push(p.clone().addScaledVector(n,-halfWidth-thickness));outerRight.push(p.clone().addScaledVector(n,halfWidth+thickness));}
  return {start,end,halfWidth,height,thickness,centers,left,right,outerLeft,outerRight};
}
