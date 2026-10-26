import * as THREE from 'three';
import {Track} from './Track';
import {Vehicle,resolveCollision} from './Vehicle';
import {LinePlanner} from './LinePlanner';
import {Controls,HANDLING,steeringLock} from './Dynamics';
export interface Rival {
  car:Vehicle;distance:number;speed:number;name:string;
  pace:number;aggression:number;reaction:number;lineBias:number;phase:number;lane:number;decision:number;stuck:number;control:Controls;
}
export class Race {
  state:'ready'|'countdown'|'racing'|'finished'='ready';
  countdown=4;elapsed=0;lapTime=0;best=0;lastLap=0;position=6;
  private lapStart=0;private completed=0;private storageKey:string;
  readonly opponents:Rival[]=[];
  constructor(private track:Track,scene:THREE.Scene,private planner:LinePlanner){
    this.storageKey=`apex-best-${track.name.toLowerCase()}-v3`;
    const profiles=[
      {name:'NOVA',color:0x31bca6,pace:1.01,aggression:.92,reaction:.1,lineBias:-.35},
      {name:'VECTOR',color:0x2564d3,pace:.94,aggression:.45,reaction:.22,lineBias:.55},
      {name:'SOLAR',color:0xeab442,pace:.97,aggression:.72,reaction:.16,lineBias:-.7},
      {name:'POLAR',color:0xc6cdd1,pace:.9,aggression:.25,reaction:.28,lineBias:.3},
      {name:'ORBIT',color:0x9768d1,pace:.99,aggression:.83,reaction:.13,lineBias:.8}
    ];
    profiles.forEach((p,i)=>this.opponents.push({...p,car:new Vehicle(track,scene,p.color),distance:0,speed:0,phase:i*2.17,lane:0,decision:0,stuck:0,control:{throttle:0,brake:0,steer:0}}));this.reset();
    try{this.best=Number(localStorage.getItem(this.storageKey)||0);}catch{}
  }
  reset(){this.state='ready';this.countdown=4;this.elapsed=0;this.lapTime=0;this.lapStart=0;this.lastLap=0;this.completed=0;this.position=6;
    this.opponents.forEach((o,i)=>{const progress=(10+Math.floor(i/2)*9)/this.track.length;o.car.resetAt(progress,i%2?3:-3);o.distance=progress;o.speed=0;o.lane=i%2?3:-3;o.decision=0;o.stuck=0;o.control={throttle:0,brake:0,steer:0};});}
  start(){if(this.state==='ready')this.state='countdown';}
  private decide(o:Rival,player:Vehicle){
    const car=o.car,lookahead=THREE.MathUtils.clamp(10+car.speed*.42,11,40),t=car.progress+lookahead/this.track.length;
    const traffic=[player,...this.opponents.filter(other=>other!==o).map(other=>other.car)];
    let desiredLane=o.lineBias+Math.sin(this.elapsed*.33+o.phase)*(.18+(1-o.aggression)*.28);
    let target=this.planner.advice(car.progress,car.speed)*o.pace*(.985+.015*Math.sin(this.elapsed*.23+o.phase));
    let closest:Vehicle|undefined,nearest=Infinity;
    for(const other of traffic){let gap=other.progress-car.progress;if(gap<-.5)gap+=1;if(gap>.5)gap-=1;const meters=gap*this.track.length;if(meters>0&&meters<nearest){nearest=meters;closest=other;}}
    if(closest&&nearest<35){
      const lane=closest.position.clone().sub(this.planner.point(closest.progress)).dot(this.track.normal(closest.progress));
      const preferred=o.aggression>.6?(lane>0?-1:1):(Math.sin(o.phase)>0?1:-1);
      const passLane=THREE.MathUtils.clamp(lane+preferred*(3.1+o.aggression),-5.8,5.8);
      const space=traffic.every(other=>other===closest||other.position.distanceTo(car.position)>13||Math.abs(other.position.clone().sub(this.planner.point(other.progress)).dot(this.track.normal(other.progress))-passLane)>2.5);
      if(space&&o.aggression>.35)desiredLane=passLane;
      const currentLane=car.position.clone().sub(this.planner.point(car.progress)).dot(this.track.normal(car.progress));
      if(nearest<14&&Math.abs(currentLane-lane)<2.5)target=Math.min(target,Math.max(5,closest.speed+(nearest-8)*.7));
    }
    const baseOffset=this.planner.point(t).sub(this.track.point(t)).dot(this.track.normal(t));
    desiredLane=THREE.MathUtils.clamp(desiredLane,-7.2-baseOffset,7.2-baseOffset);
    o.lane=THREE.MathUtils.damp(o.lane,desiredLane,1.2+o.aggression,o.reaction);
    const lane=THREE.MathUtils.clamp(o.lane,-7.2-baseOffset,7.2-baseOffset);
    const point=this.planner.point(t).addScaledVector(this.track.normal(t),lane);
    const to=point.sub(car.position),desired=Math.atan2(to.x,to.z);
    const error=Math.atan2(Math.sin(desired-car.heading),Math.cos(desired-car.heading));
    const angle=Math.atan2(2*HANDLING.wheelbase*Math.sin(error),Math.max(5,to.length()));
    const steer=THREE.MathUtils.clamp((angle-car.yawRate*.018)/steeringLock(car.speed),-1,1);
    if(car.offRoad)target=Math.min(target,14);
    if(Math.abs(error)>.5)target=Math.min(target,Math.max(9,22-Math.abs(error)*8));
    const difference=target-car.speed;
    o.control={steer,throttle:THREE.MathUtils.clamp(difference/5,0,1),brake:THREE.MathUtils.clamp(-difference/8,0,1),boost:o.aggression>.8&&difference>9&&Math.abs(error)<.08&&o.car.boost>35};
  }
  update(dt:number,player:Vehicle){
    if(this.state==='countdown'){this.countdown-=dt;if(this.countdown<=0)this.state='racing';return;}
    if(this.state!=='racing')return;
    this.elapsed+=dt;this.lapTime=this.elapsed-this.lapStart;
    const done=Math.floor(player.distance+1e-6);
    if(done>this.completed){this.lastLap=this.lapTime;if(!this.best||this.lastLap<this.best){this.best=this.lastLap;try{localStorage.setItem(this.storageKey,String(this.best));}catch{}}
      this.completed=done;this.lapStart=this.elapsed;this.lapTime=0;if(done>=3){this.state='finished';return;}}
    this.opponents.forEach(o=>{o.decision-=dt;if(o.decision<=0){this.decide(o,player);o.decision=o.reaction;}o.car.drive(dt,o.control);o.stuck=o.car.offRoad&&o.car.speed<5?o.stuck+dt:0;if(o.stuck>2.5){o.car.recover();o.stuck=0;o.decision=0;}o.distance=o.car.distance;o.speed=o.car.speed;});
    const cars=[player,...this.opponents.map(o=>o.car)];for(let a=0;a<cars.length;a++)for(let b=a+1;b<cars.length;b++)resolveCollision(cars[a],cars[b]);
    this.position=1+this.opponents.filter(o=>o.distance>player.distance).length;
  }
}
export function formatTime(s:number){if(!s)return '—:——.———';return `${Math.floor(s/60)}:${(s%60).toFixed(3).padStart(6,'0')}`;}
