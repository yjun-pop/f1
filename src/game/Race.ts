import * as THREE from 'three';
import {Track} from './Track';
import {Vehicle,resolveCollision} from './Vehicle';
import {LinePlanner} from './LinePlanner';
import {Controls,HANDLING,steeringLock,brakingDeceleration,cornerSpeed} from './Dynamics';
export interface Rival {
  car:Vehicle;distance:number;speed:number;name:string;
  rank:number;speedCap:number;powerAssist:number;attack:number;pace:number;aggression:number;reaction:number;lineBias:number;phase:number;lane:number;decision:number;stuck:number;control:Controls;
}
export class Race {
  state:'ready'|'countdown'|'racing'|'finished'='ready';
  countdown=4;elapsed=0;lapTime=0;best=0;lastLap=0;position=6;
  private aiSpeeds:Float64Array;
  private lapStart=0;private completed=0;private storageKey:string;
  readonly opponents:Rival[]=[];
  constructor(private track:Track,scene:THREE.Scene,private planner:LinePlanner){
    // Calibrated for an approximately 86-second flying lap. Rivals use the
    // same physical integration with explicit bounded grip/power assistance;
    // the player's performance and human guidance remain stock.
    this.aiSpeeds=Float64Array.from(planner.cornerSpeeds);
    const count=planner.count;
    for(let pass=0;pass<12;pass++){
      for(let i=count-1;i>=0;i--){const next=(i+1)%count;this.aiSpeeds[i]=Math.min(this.aiSpeeds[i],Math.sqrt(this.aiSpeeds[next]**2+2*brakingDeceleration(this.aiSpeeds[next])*.65*planner.distances[i]));}
      for(let i=0;i<count;i++){
        const next=(i+1)%count,speed=this.aiSpeeds[i];
        const acceleration=6;
        this.aiSpeeds[next]=Math.min(this.aiSpeeds[next],Math.sqrt(speed*speed+2*acceleration*planner.distances[i]));
      }
    }
    this.storageKey=`apex-best-${track.name.toLowerCase()}-v3`;
    const profiles=[
      {name:'NOVA',color:0x31bca6,pace:1.46,aggression:.92,reaction:.025,lineBias:-.35},
      {name:'VECTOR',color:0x2564d3,pace:1.38,aggression:.45,reaction:.03,lineBias:.55},
      {name:'SOLAR',color:0xeab442,pace:1.42,aggression:.72,reaction:.027,lineBias:-.7},
      {name:'POLAR',color:0xc6cdd1,pace:1.36,aggression:.25,reaction:.035,lineBias:.3},
      {name:'ORBIT',color:0x9768d1,pace:1.45,aggression:.83,reaction:.025,lineBias:.8}
    ];
    profiles.forEach((p,i)=>this.opponents.push({...p,car:new Vehicle(track,scene,p.color,{grip:1.4,power:1.35}),distance:0,speed:0,phase:i*2.17,lane:0,decision:0,stuck:0,rank:i+1,speedCap:94,powerAssist:1,attack:0,control:{throttle:0,brake:0,steer:0}}));this.reset();
    try{this.best=Number(localStorage.getItem(this.storageKey)||0);}catch{}
  }
  reset(){this.state='ready';this.countdown=4;this.elapsed=0;this.lapTime=0;this.lapStart=0;this.lastLap=0;this.completed=0;this.position=6;
    this.opponents.forEach((o,i)=>{const progress=(15+(this.opponents.length-1-i)*12)/this.track.length;o.car.resetAt(progress,i%2?3:-3);o.distance=progress;o.speed=0;o.lane=(i%2?3:-3)-this.planner.point(progress).sub(this.track.point(progress)).dot(this.track.normal(progress));o.decision=0;o.stuck=0;o.rank=i+1;o.speedCap=94;o.powerAssist=1;o.attack=0;o.car.boost=100;o.car.boosting=false;o.car.raceSpeedCap=undefined;o.car.raceCruiseCap=undefined;o.car.racePowerAssist=undefined;o.control={throttle:0,brake:0,steer:0};});}
  start(){if(this.state==='ready')this.state='countdown';}
  private racingSpeed(progress:number){
    const f=((progress%1+1)%1)*this.aiSpeeds.length,i=Math.floor(f);
    return THREE.MathUtils.lerp(this.aiSpeeds[i],this.aiSpeeds[(i+1)%this.aiSpeeds.length],f-i);
  }
  private balanceRivals(player:Vehicle,dt:number){
    // Snapshot standings once, using total race distance across lap seams.
    const order:{distance:number;rival:Rival|null}[]=[{distance:player.distance,rival:null},...this.opponents.map(rival=>({distance:rival.car.distance,rival}))];
    order.sort((a,b)=>b.distance-a.distance);
    this.position=order.findIndex(entry=>entry.rival===null)+1;
    order.forEach((entry,i)=>{if(entry.rival)entry.rival.rank=i+1;});
    const contenders=this.position<=3?this.opponents.filter(o=>o.rank<=3&&o.rank>this.position).sort((a,b)=>a.rank-b.rank):[];
    const attacker=contenders[Math.floor(this.elapsed/14)%Math.max(1,contenders.length)];
    const warmup=THREE.MathUtils.smoothstep(this.elapsed,2,8);
    for(const o of this.opponents){
      const gap=(o.car.distance-player.distance)*this.track.length;
      const behind=o.rank>this.position,strength=THREE.MathUtils.smoothstep(Math.max(0,Math.abs(gap)-12),0,350);
      const attack=behind&&contenders.includes(o)?(o===attacker?1:.45):0;
      o.attack=THREE.MathUtils.damp(o.attack,attack,.65,dt);
      // Ahead: only 1.2-2% off top speed, with no large corner-pace penalty.
      // Behind: more straight-line speed/power; 2nd/3rd take turns attacking
      // a leading player. Neither position nor velocity is directly changed.
      const targetCap=behind?94+warmup*(2+12*strength+8*o.attack):94*(1-warmup*(.012+.008*strength));
      const targetPower=behind?1+warmup*(.04+.24*strength+.16*o.attack):1;
      o.speedCap=THREE.MathUtils.damp(o.speedCap,THREE.MathUtils.clamp(targetCap,92,110),.7,dt);
      o.powerAssist=THREE.MathUtils.damp(o.powerAssist,Math.min(1.35,targetPower),.5,dt);
      o.car.raceSpeedCap=o.speedCap;o.car.raceCruiseCap=o.speedCap*87/94;o.car.racePowerAssist=o.powerAssist;
    }
  }
  private decide(o:Rival,player:Vehicle){
    const car=o.car,lookahead=THREE.MathUtils.clamp(7+car.speed*.3,9,26),t=car.progress+lookahead/this.track.length;
    const traffic=[player,...this.opponents.filter(other=>other!==o).map(other=>other.car)]
      .filter(other=>other.position.distanceToSquared(car.position)<100*100);
    const biasAt=(other:Vehicle)=>other.position.clone().sub(this.planner.point(other.progress)).dot(this.track.normal(other.progress));
    const offsetAt=(progress:number)=>this.planner.point(progress).sub(this.track.point(progress)).dot(this.track.normal(progress));
    const gapTo=(other:Vehicle)=>{let gap=other.progress-car.progress;if(gap<-.5)gap+=1;if(gap>.5)gap-=1;return gap*this.track.length;};
    const currentBias=biasAt(car);
    let desiredLane=this.elapsed<2?currentBias:o.lineBias;
    // AI uses the precomputed braking envelope with its own short reaction
    // distance, rather than the extra early-braking margin intended for a human.
    const pace=Math.min(1.47,o.pace);
    const reference=car.progress+car.speed*.12/this.track.length;
    // At the tire limit, spend the remaining grip on turning rather than
    // making the more aggressive exit acceleration compete with cornering.
    const gripReserve=THREE.MathUtils.smoothstep(pace/Math.sqrt(car.gripScale),1.2,1.26);
    const speedAt=(t:number)=>THREE.MathUtils.lerp(this.racingSpeed(t),this.planner.speed(t),gripReserve);
    const plannedTarget=Math.min(o.speedCap,speedAt(reference)*pace);
    const nextTarget=Math.min(o.speedCap,speedAt(reference+8/this.track.length)*pace);
    const plannedAcceleration=(nextTarget*nextTarget-plannedTarget*plannedTarget)/16;
    let target=plannedTarget,passing=false;
    const ahead=traffic.filter(other=>gapTo(other)>0&&gapTo(other)<70&&Math.abs(biasAt(other)-currentBias)<3)
      .sort((a,b)=>gapTo(a)-gapTo(b))[0];
    if(ahead){
      const nearest=gapTo(ahead),otherBias=biasAt(ahead);
      if(nearest<Math.min(70,25+car.speed*.7)&&car.speed>=ahead.speed-1&&[0,15,30,45].every(distance=>this.planner.cornerLimit(car.progress+distance/this.track.length)>60)){
        // Try both passing corridors and reject ones that clip the edge at
        // either car or at the steering target. Clamping an impossible pass
        // to the same lane used to create queues and repeated contact.
        const offsets=[offsetAt(car.progress),offsetAt(ahead.progress),offsetAt(t)];
        const low=Math.max(...offsets.map(offset=>-7.4-offset));
        const high=Math.min(...offsets.map(offset=>7.4-offset));
        const lanes=[otherBias-3.5,otherBias+3.5].filter(lane=>lane>=low&&lane<=high&&traffic.every(other=>{
          if(other===ahead||Math.abs(biasAt(other)-lane)>2.8)return true;
          const gap=gapTo(other),clearance=gap<0?14+Math.max(0,other.speed-car.speed)*.5:18;
          return Math.abs(gap)>clearance;
        }));
        lanes.sort((a,b)=>Math.abs(a-currentBias)-Math.abs(b-currentBias));
        if(lanes.length){desiredLane=lanes[0];passing=true;}
      }
      if(nearest<9+car.speed*.2&&Math.abs(currentBias-otherBias)<2.6){
        target=Math.min(target,Math.max(5,ahead.speed+(nearest-7-car.speed*.12)*.9));
      }
    }
    // Stay in the current corridor until an alongside car has cleared,
    // including when finishing a pass and returning to the racing line.
    if(traffic.some(other=>{
      const gap=gapTo(other);
      if(Math.abs(gap)>=8&&(passing||gap<0||gap>35))return false;
      const lane=biasAt(other);
      return lane>Math.min(currentBias,desiredLane)-2.8&&lane<Math.max(currentBias,desiredLane)+2.8;
    }))desiredLane=currentBias;
    const baseOffset=this.planner.point(t).sub(this.track.point(t)).dot(this.track.normal(t));
    desiredLane=THREE.MathUtils.clamp(desiredLane,-7.2-baseOffset,7.2-baseOffset);
    o.lane=THREE.MathUtils.damp(o.lane,desiredLane,1.2+o.aggression,o.reaction);
    const lane=THREE.MathUtils.clamp(o.lane,-7.2-baseOffset,7.2-baseOffset);
    const point=this.planner.point(t).addScaledVector(this.track.normal(t),lane);
    const to=point.sub(car.position),desired=Math.atan2(to.x,to.z);
    const error=Math.atan2(Math.sin(desired-car.heading),Math.cos(desired-car.heading));
    const angle=Math.atan2(2*HANDLING.wheelbase*Math.sin(error),Math.max(5,to.length()));
    const steer=THREE.MathUtils.clamp((angle-car.yawRate*.01)/steeringLock(car.speed,car.gripScale),-1,1);
    if(Math.abs(lane)>1.2){
      // A passing corridor can have a tighter radius than the racing line.
      // Anticipate its corners instead of carrying the ideal line's speed
      // into the grass while racing side by side.
      const lanePoint=(progress:number)=>this.planner.point(progress).addScaledVector(this.track.normal(progress),THREE.MathUtils.clamp(lane,-7.2-offsetAt(progress),7.2-offsetAt(progress)));
      for(const distance of [0,12,24,40,60,90]){
        const progress=car.progress+distance/this.track.length;
        const a=lanePoint(progress-4/this.track.length),b=lanePoint(progress),c=lanePoint(progress+4/this.track.length);
        const ab=a.distanceTo(b),bc=b.distanceTo(c),ca=c.distanceTo(a);
        const curvature=2*Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x))/Math.max(.001,ab*bc*ca);
        const limit=cornerSpeed(curvature/car.gripScale,o.speedCap/.92)*.92;
        target=Math.min(target,Math.sqrt(limit*limit+2*brakingDeceleration(car.speed,false,car.gripScale)*.75*Math.max(0,distance-car.speed*.15)));
      }
    }
    if(this.planner.cornerLimit(car.progress)<60&&Math.abs(currentBias-o.lane)>1.5)target=Math.min(target,this.planner.speed(reference)*Math.sqrt(car.gripScale));
    if(car.offRoad)target=Math.min(target,14);
    if(Math.abs(error)>.5)target=Math.min(target,Math.max(9,22-Math.abs(error)*8));
    // Feed forward the acceleration required by the speed profile and road
    // drag. Error-only throttle used to coast below the target and brake late.
    // Front runners bank ERS; a trailing challenger can spend it on the pass.
    const wantsBoost=target>78&&car.speed>35&&Math.abs(error)<.09&&plannedAcceleration>-.5&&car.boost>(o.control.boost?5:35)&&o.rank>=this.position;
    if(!wantsBoost)target=Math.min(target,o.speedCap*87/94);
    const feedforward=target<plannedTarget-.1?0:plannedAcceleration;
    const acceleration=feedforward+(target-car.speed)*2;
    const drag=.00105*car.speed*car.speed+(car.offRoad?4.2:.35);
    const demand=acceleration+drag;
    const boost=wantsBoost&&demand>0;
    const pursuit=1+(o.powerAssist-1)*THREE.MathUtils.smoothstep(car.speed,45,75);
    const engine=(boost?23:17)*car.powerScale*pursuit*(1-car.speed/140);
    o.control={steer,throttle:THREE.MathUtils.clamp(demand/Math.max(1,engine),0,1),brake:THREE.MathUtils.clamp(-demand/brakingDeceleration(car.speed,car.offRoad,car.gripScale),0,1),boost};
  }
  update(dt:number,player:Vehicle){
    if(this.state==='countdown'){this.countdown-=dt;if(this.countdown<=0)this.state='racing';return;}
    if(this.state!=='racing')return;
    this.elapsed+=dt;this.lapTime=this.elapsed-this.lapStart;
    const done=Math.floor(player.distance+1e-6);
    if(done>this.completed){this.lastLap=this.lapTime;if(!this.best||this.lastLap<this.best){this.best=this.lastLap;try{localStorage.setItem(this.storageKey,String(this.best));}catch{}}
      this.completed=done;this.lapStart=this.elapsed;this.lapTime=0;if(done>=3){this.state='finished';return;}}
    this.balanceRivals(player,dt);
    this.opponents.forEach(o=>{
      o.decision-=dt;
      if(o.decision<=0){this.decide(o,player);o.decision=o.reaction;}
      o.car.drive(dt,o.control);
      o.stuck=o.car.offRoad&&o.car.speed<5?o.stuck+dt:0;
      if(o.stuck>2.5){o.car.recover();o.stuck=0;o.decision=0;}
      o.distance=o.car.distance;o.speed=o.car.speed;
    });
    const cars=[player,...this.opponents.map(o=>o.car)];for(let a=0;a<cars.length;a++)for(let b=a+1;b<cars.length;b++)resolveCollision(cars[a],cars[b]);
    this.position=1+this.opponents.filter(o=>o.distance>player.distance).length;
  }
}
export function formatTime(s:number){if(!s)return '—:——.———';return `${Math.floor(s/60)}:${(s%60).toFixed(3).padStart(6,'0')}`;}
