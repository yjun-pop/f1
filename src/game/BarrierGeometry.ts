import * as THREE from 'three';
import type {Track} from './Track';
import {createTrackChunks} from './TrackChunks';

const cross=(a:THREE.Vector3,b:THREE.Vector3)=>a.x*b.z-a.z*b.x;
/** Remove the small folds an inward offset develops at a tight chicane. */
function removeLoops(source:THREE.Vector3[]){
  let points=source;
  for(let pass=0;pass<128;pass++){
    const cells=new Map<string,number[]>();let crossing:{i:number;j:number;p:THREE.Vector3}|undefined;
    for(let i=0;i<points.length&&!crossing;i++){
      const a=points[i],b=points[(i+1)%points.length],seen=new Set<number>();
      for(let x=Math.floor(Math.min(a.x,b.x)/8);x<=Math.floor(Math.max(a.x,b.x)/8);x++)for(let z=Math.floor(Math.min(a.z,b.z)/8);z<=Math.floor(Math.max(a.z,b.z)/8);z++){
        const key=`${x}/${z}`,bucket=cells.get(key)??[];
        for(const j of bucket){
          if(seen.has(j)||i-j<=1||i===points.length-1&&j===0)continue;seen.add(j);
          const c=points[j],d=points[(j+1)%points.length],u=b.clone().sub(a),v=d.clone().sub(c),den=cross(u,v);
          if(Math.abs(den)<1e-10)continue;
          const delta=c.clone().sub(a),t=cross(delta,v)/den,s=cross(delta,u)/den;
          if(t>1e-7&&t<1-1e-7&&s>1e-7&&s<1-1e-7){crossing={i:j,j:i,p:a.clone().lerp(b,t)};break;}
        }
        bucket.push(i);cells.set(key,bucket);
      }
    }
    if(!crossing)return points;
    const {i,j,p}=crossing;
    points=j-i<points.length/2?[...points.slice(0,i+1),p,...points.slice(j+1)]:[p,...points.slice(i+1,j+1)];
  }
  throw new Error('Barrier offset could not be untangled');
}

function simplify(points:THREE.Vector3[],tolerance:number):THREE.Vector3[]{
  if(points.length<=2)return points;
  const a=points[0],b=points[points.length-1],delta=b.clone().sub(a),length=delta.lengthSq();let maximum=0,index=0;
  for(let i=1;i<points.length-1;i++){
    const t=length?THREE.MathUtils.clamp(points[i].clone().sub(a).dot(delta)/length,0,1):0,distance=points[i].distanceToSquared(a.clone().addScaledVector(delta,t));
    if(distance>maximum){maximum=distance;index=i;}
  }
  if(maximum<=tolerance*tolerance)return [a,b];
  return [...simplify(points.slice(0,index+1),tolerance).slice(0,-1),...simplify(points.slice(index),tolerance)];
}

/** A simple closed wall outline, shared by the barrier and catch fence. */
export class BarrierPath {
  readonly points:THREE.Vector3[];readonly distances:number[]=[0];readonly length:number;
  constructor(track:Track,side:number){
    const count=Math.ceil(track.length),raw=Array.from({length:count},(_,i)=>track.roadPoint(i/count).addScaledVector(track.roadNormal(i/count),side*16.2));
    const clean=removeLoops(raw),arc=[0];
    for(let i=0;i<clean.length;i++)arc.push(arc[i]+clean[i].distanceTo(clean[(i+1)%clean.length]));
    const total=arc[arc.length-1],spacing=total/Math.ceil(total),uniform:THREE.Vector3[]=[];let segment=0;
    for(let i=0;i<Math.ceil(total);i++){
      const distance=i*spacing;while(segment<clean.length-1&&arc[segment+1]<distance)segment++;
      uniform.push(clean[segment].clone().lerp(clean[(segment+1)%clean.length],(distance-arc[segment])/(arc[segment+1]-arc[segment])));
    }
    // Smooth by physical distance, not source index: a trimmed cusp can have
    // many very short edges and still needs room for the wall's full width.
    const weights=Array.from({length:11},(_,i)=>Math.exp(-.5*((i-5)/1.5)**2)),weight=weights.reduce((a,b)=>a+b,0);
    const smooth=uniform.map((_,i)=>{const p=new THREE.Vector3();for(let j=-5;j<=5;j++)p.addScaledVector(uniform[(i+j+uniform.length)%uniform.length],weights[j+5]/weight);return p;}),rounded:THREE.Vector3[]=[];
    // Convex corner cutting rounds the trimmed joints without spline overshoot.
    for(let i=0;i<smooth.length;i++){const a=smooth[i],b=smooth[(i+1)%smooth.length];rounded.push(a.clone().lerp(b,.25),a.clone().lerp(b,.75));}
    const half=Math.floor(rounded.length/2),simple=[...simplify(rounded.slice(0,half+1),.003).slice(0,-1),...simplify([...rounded.slice(half),rounded[0]],.003).slice(0,-1)];
    const nodes:THREE.Vector3[]=[];
    for(let i=0;i<simple.length;i++){const a=simple[i],b=simple[(i+1)%simple.length],steps=Math.max(1,Math.ceil(a.distanceTo(b)/3));for(let j=0;j<steps;j++)nodes.push(a.clone().lerp(b,j/steps));}
    this.points=removeLoops(nodes);
    for(let i=0;i<this.points.length;i++)this.distances.push(this.distances[i]+this.points[i].distanceTo(this.points[(i+1)%this.points.length]));
    this.length=this.distances[this.distances.length-1];
  }
  point(t:number,offset=0){
    const distance=((t%1+1)%1)*this.length;let low=0,high=this.points.length-1;
    while(low<high){const middle=Math.ceil((low+high)/2);if(this.distances[middle]<=distance)low=middle;else high=middle-1;}
    const a=this.points[low],b=this.points[(low+1)%this.points.length],alpha=(distance-this.distances[low])/(this.distances[low+1]-this.distances[low]);
    const p=a.clone().lerp(b,alpha);
    if(offset){
      const before=this.points[(low+this.points.length-1)%this.points.length],after=this.points[(low+2)%this.points.length],fa=b.clone().sub(before).normalize(),fb=after.clone().sub(a).normalize();
      p.addScaledVector(new THREE.Vector3(-fa.z,0,fa.x),offset*(1-alpha)).addScaledVector(new THREE.Vector3(-fb.z,0,fb.x),offset*alpha);
    }
    return p;
  }
}

export function createBarriers(paths:readonly BarrierPath[]){
  const group=new THREE.Group();group.name='track-barriers';
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d')!;
  ctx.fillStyle='#315248';ctx.fillRect(0,0,512,128);ctx.fillStyle='#283f38';ctx.fillRect(0,0,4,128);ctx.fillStyle='#597367';ctx.fillRect(4,0,2,128);ctx.fillStyle='#d2dcd3';ctx.font='bold italic 30px sans-serif';ctx.textAlign='center';ctx.fillText('APEX  /  FORMULA',256,74);
  const paint=new THREE.CanvasTexture(canvas);paint.colorSpace=THREE.SRGBColorSpace;paint.wrapS=THREE.RepeatWrapping;paint.anisotropy=2;
  const material=new THREE.MeshStandardMaterial({map:paint,roughness:.85});
  for(let side=0;side<paths.length;side++){
    const path=paths[side],positions:number[]=[],uv:number[]=[],progress:number[]=[],indices:number[]=[],profile=[[-.275,-.08],[-.275,1.12],[-.275,1.12],[.275,1.12],[.275,1.12],[.275,-.08],[.275,-.08],[-.275,-.08]];
    for(let i=0;i<=path.points.length;i++){
      const index=i%path.points.length,p=path.points[index],a=path.points[(index+path.points.length-1)%path.points.length],b=path.points[(index+1)%path.points.length],f=b.clone().sub(a).normalize(),n=new THREE.Vector3(-f.z,0,f.x);
      for(const [offset,y] of profile){const q=p.clone().addScaledVector(n,offset);positions.push(q.x,y,q.z);uv.push(path.distances[i]/4.2,(y+.08)/1.2);progress.push(path.distances[i]/path.length);}
      if(i<path.points.length)for(let face=0;face<4;face++){const k=i*8+face*2;indices.push(k,k+1,k+8,k+1,k+9,k+8);}
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setAttribute('progress',new THREE.Float32BufferAttribute(progress,1));geometry.setIndex(indices);geometry.computeVertexNormals();
    group.add(createTrackChunks(geometry,material,path.length,`barrier-${side}`));
  }
  return group;
}
