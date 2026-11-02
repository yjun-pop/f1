import * as THREE from 'three';

interface Segment {ax:number;az:number;dx:number;dz:number;lengthSquared:number}
/** One local spatial index reused by terrain, trees, buildings and water.
 * Queries visit nearby cells instead of scanning the entire circuit per prop. */
export class ScenerySpace {
  private readonly cells=new Map<string,Segment[]>();
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
}
