import type {Track} from './Track';
import type {Vehicle} from './Vehicle';

interface WallSegment {ax:number;az:number;bx:number;bz:number;dx:number;dz:number;lengthSquared:number;minX:number;maxX:number;minZ:number;maxZ:number;minY:number;maxY:number;halfThickness:number;kind:'barrier'|'tunnel';visit:number}
// Body/tyres plus front and rear wing tips. The wings extend beyond the
// shorter car-to-car capsule and must not visibly enter a concrete wall.
const PROBES=[[-1.85,0,1.12],[0,0,1.075],[1.55,0,1.08],[3.1,-1.02,.10],[3.1,1.02,.10],[-2.75,-1.02,.10],[-2.75,1.02,.10]] as const;

/** Static vertical walls, indexed once. Contacts run inside each 120Hz physics
 * step, including a swept test for thin wing tips and high-speed impacts. */
export class TrackWallCollision {
  readonly segments:WallSegment[]=[];
  private readonly cells=new Map<string,WallSegment[]>();private visit=0;private readonly cellSize=16;
  constructor(track:Track){
    const add=(a:{x:number;y:number;z:number},b:{x:number;y:number;z:number},halfThickness:number,height:number,kind:WallSegment['kind'])=>{
      const dx=b.x-a.x,dz=b.z-a.z,segment:WallSegment={ax:a.x,az:a.z,bx:b.x,bz:b.z,dx,dz,lengthSquared:dx*dx+dz*dz,minX:Math.min(a.x,b.x)-halfThickness,maxX:Math.max(a.x,b.x)+halfThickness,minZ:Math.min(a.z,b.z)-halfThickness,maxZ:Math.max(a.z,b.z)+halfThickness,minY:Math.min(a.y,b.y)-.08,maxY:Math.max(a.y,b.y)+height,halfThickness,kind,visit:0};
      if(segment.lengthSquared<1e-8)return;this.segments.push(segment);
      for(let x=Math.floor(segment.minX/this.cellSize);x<=Math.floor(segment.maxX/this.cellSize);x++)for(let z=Math.floor(segment.minZ/this.cellSize);z<=Math.floor(segment.maxZ/this.cellSize);z++){
        const key=`${x}/${z}`,cell=this.cells.get(key);if(cell)cell.push(segment);else this.cells.set(key,[segment]);
      }
    };
    if(track.compactBoundary)for(const path of track.barrierPaths)for(let i=0;i<path.points.length;i++)add(path.points[i],path.points[(i+1)%path.points.length],.275,1.12,'barrier');
    if(track.tunnel){const t=track.tunnel;for(const [inside,outside]of [[t.left,t.outerLeft],[t.right,t.outerRight]])for(let i=0;i<inside.length-1;i++)add(inside[i].clone().lerp(outside[i],.5),inside[i+1].clone().lerp(outside[i+1],.5),t.thickness/2,t.height+t.thickness,'tunnel');}
  }
  resolve(car:Vehicle,oldX:number,oldZ:number,oldHeading:number){
    let hit=false;const fs=Math.sin(car.heading),fc=Math.cos(car.heading),os=Math.sin(oldHeading),oc=Math.cos(oldHeading);
    for(let pass=0;pass<3;pass++){
      const visit=++this.visit;let corrected=false;
      const minX=Math.min(oldX,car.position.x)-3.5,maxX=Math.max(oldX,car.position.x)+3.5,minZ=Math.min(oldZ,car.position.z)-3.5,maxZ=Math.max(oldZ,car.position.z)+3.5;
      for(let x=Math.floor(minX/this.cellSize);x<=Math.floor(maxX/this.cellSize);x++)for(let z=Math.floor(minZ/this.cellSize);z<=Math.floor(maxZ/this.cellSize);z++)for(const wall of this.cells.get(`${x}/${z}`)??[]){
        if(wall.visit===visit)continue;wall.visit=visit;
        if(wall.maxX<minX||wall.minX>maxX||wall.maxZ<minZ||wall.minZ>maxZ||car.position.y>wall.maxY||car.position.y+1.4<wall.minY)continue;
        let deepest=0,nx=0,nz=0,leverX=0,leverZ=0;
        const length=Math.sqrt(wall.lengthSquared),px=-wall.dz/length,pz=wall.dx/length;
        for(const [along,across,radius]of PROBES){
          const lx=fs*along+fc*across,lz=fc*along-fs*across,cx=car.position.x+lx,cz=car.position.z+lz;
          const ox=oldX+os*along+oc*across,oz=oldZ+oc*along-os*across;
          const t=Math.max(0,Math.min(1,((cx-wall.ax)*wall.dx+(cz-wall.az)*wall.dz)/wall.lengthSquared)),qx=wall.ax+wall.dx*t,qz=wall.az+wall.dz*t;
          const dx=cx-qx,dz=cz-qz,distance=Math.hypot(dx,dz),required=radius+wall.halfThickness;
          const ux=cx-ox,uz=cz-oz,den=ux*wall.dz-uz*wall.dx,wx=wall.ax-ox,wz=wall.az-oz;
          const sweep=Math.abs(den)>1e-9?(wx*wall.dz-wz*wall.dx)/den:-1,edge=Math.abs(den)>1e-9?(wx*uz-wz*ux)/den:-1;
          const crossed=sweep>=0&&sweep<=1&&edge>=0&&edge<=1;
          if(distance>=required&&!crossed)continue;
          const oldSide=(ox-wall.ax)*px+(oz-wall.az)*pz,currentSide=(cx-wall.ax)*px+(cz-wall.az)*pz;
          let normalX=distance>1e-7?dx/distance:px,normalZ=distance>1e-7?dz/distance:pz,depth=required-distance;
          if(crossed||oldSide*currentSide<0&&t>0&&t<1){const sign=Math.abs(oldSide)>1e-7?Math.sign(oldSide):1;normalX=px*sign;normalZ=pz*sign;depth=required-currentSide*sign;}
          if(depth>deepest){deepest=depth;nx=normalX;nz=normalZ;leverX=lx;leverZ=lz;}
        }
        if(deepest<=.00001)continue;
        car.position.x+=nx*(deepest+.0001);car.position.z+=nz*(deepest+.0001);hit=corrected=true;
        const vx=fs*car.speed+fc*car.lateralSpeed,vz=fc*car.speed-fs*car.lateralSpeed,closing=vx*nx+vz*nz;
        if(closing<0){
          const impulse=-closing*1.04,tx=vx-closing*nx,tz=vz-closing*nz,tangentSpeed=Math.hypot(tx,tz),friction=tangentSpeed>1e-8?Math.max(0,1-impulse*.14/tangentSpeed):0;
          const outX=tx*friction-nx*closing*.04,outZ=tz*friction-nz*closing*.04;
          car.speed=Math.max(-2.2,outX*fs+outZ*fc);car.lateralSpeed=outX*fc-outZ*fs;
          car.yawRate+=Math.max(-.5,Math.min(.5,(leverZ*nx-leverX*nz)*impulse*.018));car.recordImpact(-closing);
        }
      }
      if(!corrected)break;
    }
    return hit;
  }
}
