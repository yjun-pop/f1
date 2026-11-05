import type {Track} from './Track';

/** A compact street circuit cannot use two fixed 16m offsets: opposing
 * streets consume the same space. Reserve half the available separation on
 * each side instead of deleting an entire offset loop after it crosses. */
export class CompactTrackBoundary {
  private readonly count:number;private readonly left:Float64Array;private readonly right:Float64Array;
  constructor(track:Pick<Track,'length'|'roadPoint'|'roadNormal'>){
    this.count=Math.ceil(track.length/2);const step=track.length/this.count;
    const points=Array.from({length:this.count},(_,i)=>track.roadPoint(i/this.count)),normals=points.map((_,i)=>track.roadNormal(i/this.count));
    const cells=new Map<string,number[]>(),cellSize=32;
    points.forEach((p,i)=>{const key=`${Math.floor(p.x/cellSize)}/${Math.floor(p.z/cellSize)}`,cell=cells.get(key);if(cell)cell.push(i);else cells.set(key,[i]);});
    this.left=new Float64Array(this.count);this.right=new Float64Array(this.count);
    for(let i=0;i<this.count;i++){
      const p=points[i],n=normals[i],a=points[(i+this.count-2)%this.count],c=points[(i+2)%this.count];
      const ab=p.distanceTo(a),bc=p.distanceTo(c),ac=a.distanceTo(c),curvature=2*((p.x-a.x)*(c.z-p.z)-(p.z-a.z)*(c.x-p.x))/Math.max(.001,ab*bc*ac);
      let left=curvature<0?Math.min(16.2,.88/-curvature):16.2,right=curvature>0?Math.min(16.2,.88/curvature):16.2;
      for(let x=Math.floor((p.x-34)/cellSize);x<=Math.floor((p.x+34)/cellSize);x++)for(let z=Math.floor((p.z-34)/cellSize);z<=Math.floor((p.z+34)/cellSize);z++)for(const j of cells.get(`${x}/${z}`)??[]){
        if(Math.min(Math.abs(i-j),this.count-Math.abs(i-j))*step<36)continue;
        const dx=points[j].x-p.x,dz=points[j].z-p.z,distance=dx*dx+dz*dz;if(distance>34*34)continue;
        const lateral=dx*n.x+dz*n.z;if(Math.abs(lateral)<.1)continue;
        const bisector=distance/(2*Math.abs(lateral))-.65;
        if(lateral<0)left=Math.min(left,bisector);else right=Math.min(right,bisector);
      }
      this.left[i]=Math.max(5.2,left);this.right[i]=Math.max(5.2,right);
    }
    for(const values of [this.left,this.right]){
      // Slow narrowing starts before a tight return leg, without widening
      // the minimum clearance or introducing a sharp steering kink.
      for(let pass=0;pass<3;pass++){
        for(let i=0;i<this.count;i++)values[i]=Math.min(values[i],values[(i+this.count-1)%this.count]+step*.2);
        for(let i=this.count-1;i>=0;i--)values[i]=Math.min(values[i],values[(i+1)%this.count]+step*.2);
      }
      for(let i=0;i<this.count;i++)values[i]-=.18;
    }
  }
  offset(progress:number,side:number){
    const values=side<0?this.left:this.right,f=((progress%1+1)%1)*this.count,i=Math.floor(f),u=f-i,v=1-u;
    let result=0;
    result+=values[(i-1+this.count)%this.count]*(v*v*v/6);
    result+=values[i]*((3*u*u*u-6*u*u+4)/6);
    result+=values[(i+1)%this.count]*((-3*u*u*u+3*u*u+3*u+1)/6);
    result+=values[(i+2)%this.count]*(u*u*u/6);return result;
  }
}
