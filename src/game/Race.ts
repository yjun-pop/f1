import * as THREE from 'three';
import {Track} from './Track';
import {Vehicle,resolveCollision} from './Vehicle';
import {LinePlanner} from './LinePlanner';
import {Controls,HANDLING,steeringLock,brakingDeceleration} from './Dynamics';
export interface Rival {
  car:Vehicle;distance:number;speed:number;name:string;
  adaptivePace:number;pace:number;aggression:number;reaction:number;lineBias:number;phase:number;lane:number;decision:number;stuck:number;control:Controls;
}
export class Race {
  state:'ready'|'countdown'|'racing'|'finished'='ready';
  countdown=4;elapsed=0;lapTime=0;best=0;lastLap=0;position=6;
  private lapStart=0;private completed=0;private storageKey:string;
  readonly opponents:Rival[]=[];
  constructor(private track:Track,scene:THREE.Scene,private planner:LinePlanner){
    this.storageKey=`apex-best-${track.name.toLowerCase()}-v3`;
    const profiles=[
      {name:'NOVA',color:0x31bca6,pace:1.1,aggression:.92,reaction:.055,lineBias:-.35},
      {name:'VECTOR',color:0x2564d3,pace:1.06,aggression:.45,reaction:.085,lineBias:.55},
      {name:'SOLAR',color:0xeab442,pace:1.08,aggression:.72,reaction:.07,lineBias:-.7},
      {name:'POLAR',color:0xc6cdd1,pace:1.04,aggression:.25,reaction:.1,lineBias:.3},
      {name:'ORBIT',color:0x9768d1,pace:1.095,aggression:.83,reaction:.06,lineBias:.8}
    ];
    profiles.forEach((p,i)=>this.opponents.push({...p,car:new Vehicle(track,scene,p.color),distance:0,speed:0,phase:i*2.17,lane:0,decision:0,stuck:0,adaptivePace:1,control:{throttle:0,brake:0,steer:0}}));this.reset();
    try{this.best=Number(localStorage.getItem(this.storageKey)||0);}catch{}
  }
  reset(){this.state='ready';this.countdown=4;this.elapsed=0;this.lapTime=0;this.lapStart=0;this.lastLap=0;this.completed=0;this.position=6;
    this.opponents.forEach((o,i)=>{const progress=(10+Math.floor(i/2)*9)/this.track.length;o.car.resetAt(progress,i%2?3:-3);o.distance=progress;o.speed=0;o.lane=(i%2?3:-3)-this.planner.point(progress).sub(this.track.point(progress)).dot(this.track.normal(progress));o.decision=0;o.stuck=0;o.adaptivePace=1;o.control={throttle:0,brake:0,steer:0};});}
  start(){if(this.state==='ready')this.state='countdown';}
  private adaptPace(o:Rival,player:Vehicle,dt:number){
    // Use total race distance, not wrapped circuit progress: a lapped player
    // is still behind even just after crossing the start/finish line.
    const gap=(o.car.distance-player.distance)*this.track.length;
    const separation=Math.max(0,Math.abs(gap)-45);
    const strength=THREE.MathUtils.smoothstep(separation,0,350);
    // Give the grid time to launch. Keep close battles neutral; approach the
    // new pace over several seconds instead of suddenly braking or speeding up.
    const warmup=THREE.MathUtils.smoothstep(this.elapsed,5,15);
    const target=1+warmup*strength*(gap>0?-.22:.2);
    o.adaptivePace=THREE.MathUtils.damp(o.adaptivePace,target,.22,dt);
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
    const pace=Math.min(1.22,o.pace*o.adaptivePace);
    const reference=car.progress+car.speed*.12/this.track.length;
    const plannedTarget=Math.min(94,this.planner.speed(reference)*pace);
    const nextTarget=Math.min(94,this.planner.speed(reference+8/this.track.length)*pace);
    const plannedAcceleration=(nextTarget*nextTarget-plannedTarget*plannedTarget)/16;
    let target=plannedTarget;
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
        const lanes=[otherBias-3.5,otherBias+3.5].filter(lane=>lane>=low&&lane<=high&&traffic.every(other=>
          other===ahead||Math.abs(gapTo(other))>18||Math.abs(biasAt(other)-lane)>2.8));
        lanes.sort((a,b)=>Math.abs(a-currentBias)-Math.abs(b-currentBias));
        if(lanes.length)desiredLane=lanes[0];
      }
      if(nearest<9+car.speed*.2&&Math.abs(currentBias-otherBias)<2.6){
        target=Math.min(target,Math.max(5,ahead.speed+(nearest-7-car.speed*.12)*.9));
      }
    }
    // Stay in the current corridor until an alongside car has cleared,
    // including when finishing a pass and returning to the racing line.
    if(traffic.some(other=>Math.abs(gapTo(other))<8&&Math.abs(biasAt(other)-desiredLane)<2.8))desiredLane=currentBias;
    const baseOffset=this.planner.point(t).sub(this.track.point(t)).dot(this.track.normal(t));
    desiredLane=THREE.MathUtils.clamp(desiredLane,-7.2-baseOffset,7.2-baseOffset);
    o.lane=THREE.MathUtils.damp(o.lane,desiredLane,1.2+o.aggression,o.reaction);
    const lane=THREE.MathUtils.clamp(o.lane,-7.2-baseOffset,7.2-baseOffset);
    const point=this.planner.point(t).addScaledVector(this.track.normal(t),lane);
    const to=point.sub(car.position),desired=Math.atan2(to.x,to.z);
    const error=Math.atan2(Math.sin(desired-car.heading),Math.cos(desired-car.heading));
    const angle=Math.atan2(2*HANDLING.wheelbase*Math.sin(error),Math.max(5,to.length()));
    const steer=THREE.MathUtils.clamp((angle-car.yawRate*.018)/steeringLock(car.speed),-1,1);
    if(this.planner.cornerLimit(car.progress)<60&&Math.abs(currentBias-o.lane)>1.5)target=Math.min(target,this.planner.speed(reference));
    if(car.offRoad)target=Math.min(target,14);
    if(Math.abs(error)>.5)target=Math.min(target,Math.max(9,22-Math.abs(error)*8));
    // Feed forward the acceleration required by the speed profile and road
    // drag. Error-only throttle used to coast below the target and brake late.
    const feedforward=target<plannedTarget-.1?0:plannedAcceleration;
    const acceleration=feedforward+(target-car.speed)*2;
    const drag=.00105*car.speed*car.speed+(car.offRoad?4.2:.35);
    const demand=acceleration+drag;
    const boost=target>78&&car.speed>35&&Math.abs(error)<.09&&plannedAcceleration>-.5&&demand>0&&car.boost>(o.control.boost?5:35);
    const engine=(boost?23:17)*(1-car.speed/140);
    o.control={steer,throttle:THREE.MathUtils.clamp(demand/Math.max(1,engine),0,1),brake:THREE.MathUtils.clamp(-demand/brakingDeceleration(car.speed,car.offRoad),0,1),boost};
  }
  update(dt:number,player:Vehicle){
    if(this.state==='countdown'){this.countdown-=dt;if(this.countdown<=0)this.state='racing';return;}
    if(this.state!=='racing')return;
    this.elapsed+=dt;this.lapTime=this.elapsed-this.lapStart;
    const done=Math.floor(player.distance+1e-6);
    if(done>this.completed){this.lastLap=this.lapTime;if(!this.best||this.lastLap<this.best){this.best=this.lastLap;try{localStorage.setItem(this.storageKey,String(this.best));}catch{}}
      this.completed=done;this.lapStart=this.elapsed;this.lapTime=0;if(done>=3){this.state='finished';return;}}
    this.opponents.forEach(o=>{
      this.adaptPace(o,player,dt);o.decision-=dt;
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
