import * as THREE from 'three';
export function pathHeading(point:(t:number)=>THREE.Vector3,progress:number,length:number){
 const before=point(progress-2/length),after=point(progress+2/length),direction=after.sub(before);return Math.atan2(direction.x,direction.z);
}
export function turnTowards(current:number,target:number,dt:number,response:number){return current+Math.atan2(Math.sin(target-current),Math.cos(target-current))*(1-Math.exp(-Math.max(0,dt)*response));}
