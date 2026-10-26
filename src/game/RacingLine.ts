import * as THREE from 'three';
import {Track} from './Track';
import {Vehicle} from './Vehicle';
import {LinePlanner} from './LinePlanner';
import {brakingDeceleration} from './Dynamics';

interface CornerZone {start:number;end:number;minimumSpeed:number;minimumGrassSpeed?:number}
const STEP=2.5,MAX_SAMPLES=512,HEIGHTS=[.25,.49,.73];
/** Corner-only, upright guidance following the optimized path in world space. */
export class RacingLine {
  readonly planner:LinePlanner;
  private ribbon:THREE.Mesh<THREE.BufferGeometry,THREE.MeshBasicMaterial>;
  private zones:CornerZone[];
  private markers:THREE.InstancedMesh;
  private markerPose=new THREE.Object3D();
  private positions=new Float32Array(MAX_SAMPLES*9);
  private colors=new Float32Array(MAX_SAMPLES*12);
  private color=new THREE.Color();
  private brakeColor=new THREE.Color(0xff4436);
  private holdColor=new THREE.Color(0xffd85a);
  private accelerateColor=new THREE.Color(0x42ed80);
  private sampleCount=0;
  private engagedZone=-1;
  visible=true;targetKmh=0;instruction='ACCELERATE';
  constructor(private track:Track,scene:THREE.Scene){
    this.planner=new LinePlanner(track);this.zones=this.findCorners();
    const geometry=new THREE.BufferGeometry(),indices:number[]=[];
    geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color',new THREE.BufferAttribute(this.colors,4).setUsage(THREE.DynamicDrawUsage));
    for(let i=0;i<MAX_SAMPLES-1;i++)for(let row=0;row<2;row++){
      const a=i*3+row,b=a+3;indices.push(a,b,a+1,a+1,b,b+1);
    }
    geometry.setIndex(indices);geometry.setDrawRange(0,0);
    const material=new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.88,side:THREE.DoubleSide,depthWrite:false,toneMapped:false});
    this.ribbon=new THREE.Mesh(geometry,material);this.ribbon.name='corner-guide-ribbon';this.ribbon.frustumCulled=false;this.ribbon.visible=false;this.ribbon.renderOrder=2;scene.add(this.ribbon);
    // Upright, forward-facing cues keep the guide readable when the driver is
    // exactly on the line and the longitudinal ribbon is viewed edge-on.
    const chevron=new THREE.Shape();chevron.moveTo(-.34,0);chevron.lineTo(0,.26);chevron.lineTo(.34,0);chevron.lineTo(.34,.13);chevron.lineTo(0,.4);chevron.lineTo(-.34,.13);chevron.closePath();
    this.markers=new THREE.InstancedMesh(new THREE.ShapeGeometry(chevron),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false,toneMapped:false}),Math.ceil(MAX_SAMPLES/6));
    this.markers.name='corner-guide-cues';this.markers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.markers.frustumCulled=false;this.markers.visible=false;this.markers.renderOrder=3;scene.add(this.markers);
  }
  private findCorners(){
    const n=this.planner.count,spacing=this.track.length/n;
    const points=Array.from({length:n},(_,i)=>this.track.point(i/n));
    const mask=points.map((p,i)=>{
      const before=p.clone().sub(points[(i-3+n)%n]),after=points[(i+3)%n].clone().sub(p);
      return before.angleTo(after)>.022;
    });
    // Join short straights inside a chicane so its entry and exit stay visible
    // as one manoeuvre, including zones crossing the lap seam.
    const original=[...mask],gapLimit=Math.ceil(55/spacing);
    for(let i=0;i<n;i++)if(original[i]){
      let gap=1;while(gap<=gapLimit&&!original[(i+gap)%n])gap++;
      if(gap<=gapLimit)for(let j=1;j<gap;j++)mask[(i+j)%n]=true;
    }
    const anchor=mask.findIndex(value=>!value),zones:CornerZone[]=[];
    if(anchor<0)return [{start:0,end:this.track.length,minimumSpeed:Math.min(...this.planner.cornerSpeeds)}];
    let start=-1,minimumSpeed=87,minimumGrassSpeed=87;
    for(let step=1;step<=n+1;step++){
      const index=anchor+step,curved=step<=n&&mask[index%n];
      if(curved){if(start<0){start=index;minimumSpeed=87;minimumGrassSpeed=87;}minimumSpeed=Math.min(minimumSpeed,this.planner.cornerSpeeds[index%n]);minimumGrassSpeed=Math.min(minimumGrassSpeed,this.planner.cornerLimit(index/n,true));}
      else if(start>=0){
        const from=(start%n)*spacing-18;
        const end=from+(index-start)*spacing+63;
        // Spline joins and small kinks on straights are not corner entries.
        const named=this.track.sections.length===0||this.track.sections.some(section=>[-1,0,1].some(lap=>{
          const meters=section.progress*this.track.length+lap*this.track.length;
          return meters>=from-42&&meters<=end+15;
        }));
        if(named)zones.push({start:from,end,minimumSpeed,minimumGrassSpeed});start=-1;
      }
    }
    return zones;
  }
  toggle(){this.visible=!this.visible;}
  update(vehicle:Vehicle){
    const allowed=this.planner.advice(vehicle.progress,vehicle.speed,vehicle.offRoad);
    this.targetKmh=Math.round(allowed*3.6);
    const threshold=this.instruction==='BRAKE'?3:9;
    this.instruction=vehicle.kmh>this.targetKmh+threshold?'BRAKE':vehicle.kmh>this.targetKmh-10?'HOLD':'ACCELERATE';
    const meters=((vehicle.progress%1+1)%1)*this.track.length;
    let active:CornerZone|undefined,approach=0,best=Infinity,selected=-1;
    for(const [zoneIndex,zone] of this.zones.entries()){
      const minimum=vehicle.offRoad?(zone.minimumGrassSpeed??zone.minimumSpeed*Math.sqrt(.43)):zone.minimumSpeed;
      const stopping=this.planner.brakingDistance(vehicle.speed,minimum,vehicle.offRoad);
      const lead=THREE.MathUtils.clamp(Math.max(75,vehicle.speed*2.5,stopping+vehicle.speed*.4+35),75,900);
      for(const lap of [-1,0,1]){
        const start=zone.start+lap*this.track.length,end=zone.end+lap*this.track.length;
        const distance=this.planner.pathDistance(meters/this.track.length,start/this.track.length),score=Math.max(0,distance);
        if(meters<=end&&(distance<=lead||(this.engagedZone===zoneIndex&&distance<=350))&&score<best){active={...zone,start,end};approach=lead;best=score;selected=zoneIndex;}
      }
    }
    const latched=selected>=0&&this.engagedZone===selected;this.engagedZone=selected;
    this.sampleCount=0;this.ribbon.visible=this.visible&&!!active;this.ribbon.geometry.setDrawRange(0,0);
    this.markers.visible=this.ribbon.visible;this.markers.count=0;
    if(!this.ribbon.visible||!active)return;
    const first=Math.ceil(Math.max(meters+2,active.start-approach)/STEP)*STEP;
    const end=Math.min(active.end,first+(MAX_SAMPLES-1)*STEP);
    const count=Math.min(MAX_SAMPLES,Math.ceil((end-first)/STEP)+1);
    if(count<2){this.ribbon.visible=false;this.markers.visible=false;return;}
    let forecast=vehicle.speed,previousProgress=meters/this.track.length;
    for(let i=0;i<count;i++){
      const s=Math.min(end,first+i*STEP),t=s/this.track.length,p=this.planner.point(t),distance=s-meters;
      const target=Math.min(this.planner.speed(t),this.planner.cornerLimit(t,vehicle.offRoad));
      const next=Math.min(this.planner.speed(t+8/this.track.length),this.planner.cornerLimit(t+8/this.track.length,vehicle.offRoad));
      const profileDistance=this.planner.pathDistance(t,t+8/this.track.length);
      const profileAcceleration=(next*next-target*target)/(2*Math.max(.1,profileDistance));
      // Start with the actual car speed. Predict attainable braking/acceleration
      // along the guide, so a corner exit is not painted red just because the
      // car is still fast before braking at the entry.
      const deceleration=brakingDeceleration(forecast,vehicle.offRoad)*.65;
      const acceleration=Math.max(2,(vehicle.boosting?23:17)*(1-forecast/140)-.00105*forecast*forecast-.35);
      const demand=profileAcceleration+(target-forecast)*1.6;
      const signed=THREE.MathUtils.clamp(demand/(demand<0?deceleration:acceleration),-1,1);
      const blend=Math.tanh(Math.abs(signed)*1.8);
      this.color.copy(this.holdColor).lerp(signed<0?this.brakeColor:this.accelerateColor,blend);
      const fade=THREE.MathUtils.smoothstep(distance,2,15)*(1-THREE.MathUtils.smoothstep(s,active.end-25,active.end));
      if(i%6===0&&distance>8&&fade>.1){
        const nextPoint=this.planner.point(t+2/this.track.length);
        this.markerPose.position.set(p.x,p.y+.29,p.z);this.markerPose.rotation.set(0,Math.atan2(nextPoint.x-p.x,nextPoint.z-p.z),0);
        this.markerPose.scale.setScalar(fade);this.markerPose.updateMatrix();
        this.markers.setMatrixAt(this.markers.count,this.markerPose.matrix);this.markers.setColorAt(this.markers.count++,this.color);
      }
      for(let row=0;row<3;row++){
        const vertex=i*3+row,position=vertex*3,color=vertex*4;
        this.positions[position]=p.x;this.positions[position+1]=p.y+HEIGHTS[row];this.positions[position+2]=p.z;
        this.colors[color]=this.color.r;this.colors[color+1]=this.color.g;this.colors[color+2]=this.color.b;this.colors[color+3]=fade*(row===1?.9:.12);
      }
      forecast=Math.sqrt(Math.max(0,forecast*forecast+2*THREE.MathUtils.clamp(demand,-deceleration,acceleration)*this.planner.pathDistance(previousProgress,t)));
      previousProgress=t;
    }
    this.sampleCount=count;
    this.ribbon.material.opacity=Math.max(latched?this.ribbon.material.opacity:0,.88*THREE.MathUtils.smoothstep(approach-(active.start-meters),0,25));
    (this.markers.material as THREE.MeshBasicMaterial).opacity=this.ribbon.material.opacity*.9;
    this.markers.instanceMatrix.needsUpdate=true;if(this.markers.instanceColor)this.markers.instanceColor.needsUpdate=true;
    this.ribbon.geometry.setDrawRange(0,(count-1)*12);
    this.ribbon.geometry.getAttribute('position').needsUpdate=true;this.ribbon.geometry.getAttribute('color').needsUpdate=true;
  }
}
