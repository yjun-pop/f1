import * as THREE from 'three';
export function pathHeading(point:(t:number)=>THREE.Vector3,progress:number,length:number){
 const before=point(progress-2/length),after=point(progress+2/length),direction=after.sub(before);return Math.atan2(direction.x,direction.z);
}
export function turnTowards(current:number,target:number,dt:number,response:number){return current+Math.atan2(Math.sin(target-current),Math.cos(target-current))*(1-Math.exp(-Math.max(0,dt)*response));}
export function advanceDemo(distance:number,speed:number,dt:number,span:number,limit:(metres:number)=>number){
 let remaining=Math.max(0,dt),wrapped=false;
 while(remaining>1e-8){const step=Math.min(1/120,remaining),target=Math.max(12,limit(distance)),change=Math.max(-20*step,Math.min(6*step,target-speed));distance+=(speed+change*.5)*step;speed+=change;remaining-=step;if(distance>=span){distance%=span;speed=Math.max(12,limit(0));wrapped=true;}}
 return {distance,speed,wrapped};
}
