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

export function createTunnelGeometry(tunnel:TunnelLayout){
  const positions:number[]=[],indices:number[]=[],rows=tunnel.centers.length-1;
  for(let i=0;i<=rows;i++){
    const {left,right,outerLeft,outerRight,height,thickness}=tunnel;
    for(const [p,y]of [[left[i],0],[left[i],height],[right[i],height],[right[i],0],[outerRight[i],0],[outerRight[i],height+thickness],[outerLeft[i],height+thickness],[outerLeft[i],0]] as const)positions.push(p.x,p.y+y,p.z);
    if(i<rows)for(let face=0;face<8;face++){const a=i*8+face,b=i*8+(face+1)%8;indices.push(a,b,a+8,b,b+8,a+8);}
  }
  // Cap wall thickness at the portals; the driving opening stays unobstructed.
  for(const row of [0,rows])for(const [a,b,c,d]of [[0,1,6,7],[2,3,4,5],[1,2,5,6]]){const base=row*8;indices.push(base+a,base+b,base+c,base+a,base+c,base+d);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
