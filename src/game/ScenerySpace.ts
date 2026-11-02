import * as THREE from 'three';

interface Segment {ax:number;az:number;dx:number;dz:number;lengthSquared:number}
export interface SceneryFootprint {x:number;z:number;yaw:number;halfX:number;halfZ:number}
export function sceneryFootprint(position:THREE.Vector3,yaw:number,minX:number,maxX:number,minZ:number,maxZ:number):SceneryFootprint {
  const x=(minX+maxX)/2,z=(minZ+maxZ)/2,c=Math.cos(yaw),s=Math.sin(yaw);
  return {x:position.x+c*x+s*z,z:position.z-s*x+c*z,yaw,halfX:(maxX-minX)/2,halfZ:(maxZ-minZ)/2};
}
export function footprintsOverlap(a:SceneryFootprint,b:SceneryFootprint,padding=0){
  const ac=Math.cos(a.yaw),as=Math.sin(a.yaw),bc=Math.cos(b.yaw),bs=Math.sin(b.yaw),dx=b.x-a.x,dz=b.z-a.z;
  for(const [x,z]of [[ac,-as],[as,ac],[bc,-bs],[bs,bc]]){
    const extent=(a.halfX+padding)*Math.abs(x*ac-z*as)+(a.halfZ+padding)*Math.abs(x*as+z*ac)+(b.halfX+padding)*Math.abs(x*bc-z*bs)+(b.halfZ+padding)*Math.abs(x*bs+z*bc);
    if(Math.abs(dx*x+dz*z)>=extent)return false;
  }
  return true;
}
/** One local spatial index reused by terrain, trees, buildings and water.
 * Queries visit nearby cells instead of scanning the entire circuit per prop. */
export class ScenerySpace {
  private readonly cells=new Map<string,Segment[]>();
  private readonly props=new Map<string,SceneryFootprint[]>();
  private readonly cellSize=64;
  constructor(length:number,point:(t:number)=>THREE.Vector3){
    const count=Math.ceil(length/10);let a=point(0);
    for(let i=1;i<=count;i++){
      const b=point(i/count),dx=b.x-a.x,dz=b.z-a.z,segment={ax:a.x,az:a.z,dx,dz,lengthSquared:dx*dx+dz*dz};
      for(let x=Math.floor(Math.min(a.x,b.x)/this.cellSize);x<=Math.floor(Math.max(a.x,b.x)/this.cellSize);x++)for(let z=Math.floor(Math.min(a.z,b.z)/this.cellSize);z<=Math.floor(Math.max(a.z,b.z)/this.cellSize);z++){
        const key=`${x}/${z}`,cell=this.cells.get(key);if(cell)cell.push(segment);else this.cells.set(key,[segment]);
      }
      a=b;
    }
  }
  distanceSquared(x:number,z:number,radius:number){
    let nearest=radius*radius;
    for(let cx=Math.floor((x-radius)/this.cellSize);cx<=Math.floor((x+radius)/this.cellSize);cx++)for(let cz=Math.floor((z-radius)/this.cellSize);cz<=Math.floor((z+radius)/this.cellSize);cz++){
      const cell=this.cells.get(`${cx}/${cz}`);if(!cell)continue;
      for(const s of cell){const t=THREE.MathUtils.clamp(((x-s.ax)*s.dx+(z-s.az)*s.dz)/Math.max(.0001,s.lengthSquared),0,1),distance=(x-s.ax-t*s.dx)**2+(z-s.az-t*s.dz)**2;if(distance<nearest)nearest=distance;}
    }
    return nearest;
  }
  clear(point:THREE.Vector3,radius:number){return this.distanceSquared(point.x,point.z,radius)>=radius*radius;}
  reserveFootprint(box:SceneryFootprint){
    const c=Math.cos(box.yaw),s=Math.sin(box.yaw),rx=Math.abs(c)*box.halfX+Math.abs(s)*box.halfZ,rz=Math.abs(s)*box.halfX+Math.abs(c)*box.halfZ;
    for(let x=Math.floor((box.x-rx)/this.cellSize);x<=Math.floor((box.x+rx)/this.cellSize);x++)for(let z=Math.floor((box.z-rz)/this.cellSize);z<=Math.floor((box.z+rz)/this.cellSize);z++){
      const key=`${x}/${z}`,cell=this.props.get(key);if(cell)cell.push(box);else this.props.set(key,[box]);
    }
  }
  intersectsReserved(box:SceneryFootprint,padding=0){
    const c=Math.cos(box.yaw),s=Math.sin(box.yaw),rx=Math.abs(c)*box.halfX+Math.abs(s)*box.halfZ+padding*3,rz=Math.abs(s)*box.halfX+Math.abs(c)*box.halfZ+padding*3;
    for(let x=Math.floor((box.x-rx)/this.cellSize);x<=Math.floor((box.x+rx)/this.cellSize);x++)for(let z=Math.floor((box.z-rz)/this.cellSize);z<=Math.floor((box.z+rz)/this.cellSize);z++){
      const cell=this.props.get(`${x}/${z}`);if(cell?.some(other=>footprintsOverlap(box,other,padding)))return true;
    }
    return false;
  }
  /** Test entire road segments against an expanded oriented footprint. The
   * roof/ends count, even when the structure centre is far from the road. */
  intersectsFootprint(box:SceneryFootprint,padding=17){
    const c=Math.cos(box.yaw),s=Math.sin(box.yaw),hx=box.halfX+padding,hz=box.halfZ+padding;
    const rx=Math.abs(c)*hx+Math.abs(s)*hz,rz=Math.abs(s)*hx+Math.abs(c)*hz;
    for(let x=Math.floor((box.x-rx)/this.cellSize);x<=Math.floor((box.x+rx)/this.cellSize);x++)for(let z=Math.floor((box.z-rz)/this.cellSize);z<=Math.floor((box.z+rz)/this.cellSize);z++){
      const cell=this.cells.get(`${x}/${z}`);if(!cell)continue;
      for(const segment of cell){
        const dx=segment.ax-box.x,dz=segment.az-box.z,ax=c*dx-s*dz,az=s*dx+c*dz;
        const vx=c*segment.dx-s*segment.dz,vz=s*segment.dx+c*segment.dz;
        let enter=0,exit=1;
        if(Math.abs(vx)<1e-9){if(Math.abs(ax)>hx)continue;}
        else{const a=(-hx-ax)/vx,b=(hx-ax)/vx;enter=Math.max(enter,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));}
        if(Math.abs(vz)<1e-9){if(Math.abs(az)>hz)continue;}
        else{const a=(-hz-az)/vz,b=(hz-az)/vz;enter=Math.max(enter,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));}
        if(enter<=exit)return true;
      }
    }
    return false;
  }
}
