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
/** A conservative approach/hold/exit envelope: never chase short speed humps inside a corner group. */
export function demoSpeedPlan(span:number,exitDistance:number,limit:(distance:number)=>number){
 const count=Math.ceil(span/2),spacing=span/count,raw=Array.from({length:count+1},(_,i)=>Math.max(12,limit(i*spacing))),values=[...raw];
 const exit=Math.min(count,Math.max(0,Math.ceil(exitDistance/spacing)));
 let minimum=0;for(let i=1;i<=exit;i++)if(raw[i]<raw[minimum])minimum=i;
 for(let i=1;i<=minimum;i++)values[i]=Math.min(values[i-1],raw[i]);
 // Include later constraints so acceleration cannot be followed immediately by another braking command.
 for(let i=count-1;i>=exit;i--)values[i]=Math.min(values[i+1],raw[i]);
 const hold=Math.min(raw[minimum],values[exit]);for(let i=minimum;i<=exit;i++)values[i]=hold;
 for(let i=exit-1;i>=0;i--)values[i]=Math.min(values[i],Math.sqrt(values[i+1]**2+32*spacing));
 return {exitDistance:exit*spacing,speed:(distance:number)=>{const f=Math.max(0,Math.min(count,distance/spacing)),i=Math.floor(f);return THREE.MathUtils.lerp(values[i],values[Math.min(count,i+1)],f-i);}};
}
/** The spline parameter is not distance: use arc length for replay movement. */
export class DemoPath {
 readonly curve:THREE.CatmullRomCurve3;readonly length:number;private lengths:number[];
 constructor(points:THREE.Vector3[]){this.curve=new THREE.CatmullRomCurve3(points,true,'centripetal');this.curve.arcLengthDivisions=Math.max(24000,points.length*24);this.lengths=this.curve.getLengths();this.length=this.lengths.at(-1)!;}
 distanceAt(progress:number){const f=Math.max(0,Math.min(1,progress))*(this.lengths.length-1),i=Math.floor(f);return THREE.MathUtils.lerp(this.lengths[i],this.lengths[Math.min(i+1,this.lengths.length-1)],f-i);}
 progressAt(distance:number){return this.curve.getUtoTmapping(0,((distance%this.length)+this.length)%this.length);}
 point(distance:number){return this.curve.getPointAt(((distance%this.length)+this.length)%this.length/this.length);}
}
