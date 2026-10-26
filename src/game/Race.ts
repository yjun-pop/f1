import * as THREE from 'three';
import {Track} from './Track';
import {Vehicle,resolveCollision} from './Vehicle';
import {LinePlanner} from './LinePlanner';
import {Controls,brakingDeceleration} from './Dynamics';
import {DriverAgent,observeTraffic} from './DriverAgent';
export interface Rival {
  agent:DriverAgent;car:Vehicle;distance:number;speed:number;name:string;
  personality:string;caution:number;launch:number;collisionScore:number;collisionCount:number;avoidance:number;
  passLane?:number;passUntil:number;defendUntil:number;defendCooldown:number;defendLane:number;
  rank:number;speedCap:number;powerAssist:number;attack:number;pace:number;aggression:number;reaction:number;lineBias:number;phase:number;lane:number;decision:number;stuck:number;control:Controls;
}
export class Race {
  state:'ready'|'countdown'|'racing'|'finished'='ready';
  countdown=4;elapsed=0;lapTime=0;best=0;lastLap=0;position=6;
  private aiSpeeds:Float64Array;
  private contacts=new Map<string,number>();
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
      {name:'NOVA',personality:'공격형',caution:0.25,launch:0.99,color:0x31bca6,pace:1.46,aggression:.92,reaction:.025,lineBias:-.35},
      {name:'VECTOR',personality:'전략형',caution:0.65,launch:1.01,color:0x2564d3,pace:1.38,aggression:.45,reaction:.03,lineBias:.55},
      {name:'SOLAR',personality:'균형형',caution:0.5,launch:1,color:0xeab442,pace:1.42,aggression:.72,reaction:.027,lineBias:-.7},
      {name:'POLAR',personality:'신중형',caution:0.9,launch:0.98,color:0xc6cdd1,pace:1.36,aggression:.25,reaction:.035,lineBias:.3},
      {name:'ORBIT',personality:'추월형',caution:0.35,launch:1.02,color:0x9768d1,pace:1.45,aggression:.83,reaction:.025,lineBias:.8}
    ];
    profiles.forEach((p,i)=>{const driver:Omit<Rival,'agent'>={...p,car:new Vehicle(track,scene,p.color,{grip:1.4,power:1.35}),distance:0,speed:0,collisionScore:0,collisionCount:0,avoidance:0,passUntil:0,defendUntil:0,defendCooldown:0,defendLane:0,phase:i*2.17,lane:0,decision:0,stuck:0,rank:i+1,speedCap:94,powerAssist:1,attack:0,control:{throttle:0,brake:0,steer:0}};const rival=Object.assign(driver,{agent:new DriverAgent(driver,track,planner,this.aiSpeeds)});this.opponents.push(rival);});this.reset();
    try{this.best=Number(localStorage.getItem(this.storageKey)||0);}catch{}
  }
  reset(){this.contacts.clear();this.state='ready';this.countdown=4;this.elapsed=0;this.lapTime=0;this.lapStart=0;this.lastLap=0;this.completed=0;this.position=6;
    this.opponents.forEach((o,i)=>{const progress=(15+(this.opponents.length-1-i)*12)/this.track.length;o.car.resetAt(progress,i%2?3:-3);o.distance=progress;o.speed=0;o.lane=(i%2?3:-3)-this.planner.point(progress).sub(this.track.point(progress)).dot(this.track.normal(progress));o.decision=0;o.stuck=0;o.rank=i+1;o.speedCap=94;o.powerAssist=1;o.attack=0;o.passLane=undefined;o.passUntil=0;o.defendUntil=0;o.defendCooldown=0;o.defendLane=0;this.agentFor(o).reset();o.collisionScore=0;o.collisionCount=0;o.avoidance=0;o.car.raceLaunchScale=undefined;o.car.boost=100;o.car.boosting=false;o.car.raceSpeedCap=undefined;o.car.raceCruiseCap=undefined;o.car.racePowerAssist=undefined;o.control={throttle:0,brake:0,steer:0};});}
  start(){if(this.state==='ready')this.state='countdown';}
  private balanceRivals(player:Vehicle,dt:number){
    // Snapshot standings once, using total race distance across lap seams.
    const order:{distance:number;rival:Rival|null}[]=[{distance:player.distance,rival:null},...this.opponents.map(rival=>({distance:rival.car.distance,rival}))];
    order.sort((a,b)=>b.distance-a.distance);
    this.position=order.findIndex(entry=>entry.rival===null)+1;
    order.forEach((entry,i)=>{if(entry.rival)entry.rival.rank=i+1;});
    const contenders=this.position<=3?this.opponents.filter(o=>o.rank<=3&&o.rank>this.position).sort((a,b)=>a.rank-b.rank):[];
    const attacker=contenders[Math.floor(this.elapsed/14)%Math.max(1,contenders.length)];
    const warmup=THREE.MathUtils.smoothstep(this.elapsed,12,35);
    for(const o of this.opponents){
      const gap=(o.car.distance-player.distance)*this.track.length;
      const behind=o.rank>this.position,strength=THREE.MathUtils.smoothstep(Math.max(0,Math.abs(gap)-12),0,350);
      const attack=behind&&contenders.includes(o)?(o===attacker?1:.45):0;
      o.attack=THREE.MathUtils.damp(o.attack,attack,.65,dt);
      // Ahead: only 1.2-2% off top speed, with no large corner-pace penalty.
      // Behind: more straight-line speed/power; 2nd/3rd take turns attacking
      // a leading player. Neither position nor velocity is directly changed.
      const targetCap=behind?94+warmup*(1+4*strength+5*o.attack):94*(1-warmup*(.012+.008*strength));
      const targetPower=behind?1+warmup*(.01+.08*strength+.06*o.attack):1;
      o.speedCap=THREE.MathUtils.damp(o.speedCap,THREE.MathUtils.clamp(targetCap,92,104),.7,dt);
      o.powerAssist=THREE.MathUtils.damp(o.powerAssist,Math.min(1.15,targetPower),.5,dt);
      // Equal launch machinery, then gradually restore the established race pace.
      o.car.raceLaunchScale=THREE.MathUtils.lerp(o.launch/o.car.powerScale,1,THREE.MathUtils.smoothstep(this.elapsed,5,22));
      o.car.raceSpeedCap=o.speedCap;o.car.raceCruiseCap=o.speedCap*87/94;o.car.racePowerAssist=o.powerAssist;
    }
  }
  private agentFor(o:Rival){
    // Also support test/reference drivers and dynamically added vehicles.
    if(!o.agent||o.agent.driver!==o)o.agent=new DriverAgent(o,this.track,this.planner,this.aiSpeeds);
    return o.agent;
  }
  private decide(o:Rival,player:Vehicle,traffic=observeTraffic([player,...this.opponents.map(other=>other.car)])){
    this.agentFor(o).think({elapsed:this.elapsed,playerPosition:this.position,traffic});
  }
  private scoreContact(a:Vehicle,b:Vehicle,key:string,impact:number){
    const previous=this.contacts.get(key);this.contacts.set(key,this.elapsed);
    if(previous!==undefined&&this.elapsed-previous<.6)return;
    for(const o of this.opponents){
      if(o.car!==a&&o.car!==b)continue;
      this.agentFor(o).onContact(o.car===a?b:a,impact,this.elapsed);
    }
  }
  update(dt:number,player:Vehicle){
    if(this.state==='countdown'){this.countdown-=dt;if(this.countdown<=0)this.state='racing';return;}
    if(this.state!=='racing')return;
    this.elapsed+=dt;this.lapTime=this.elapsed-this.lapStart;
    const done=Math.floor(player.distance+1e-6);
    if(done>this.completed){this.lastLap=this.lapTime;if(!this.best||this.lastLap<this.best){this.best=this.lastLap;try{localStorage.setItem(this.storageKey,String(this.best));}catch{}}
      this.completed=done;this.lapStart=this.elapsed;this.lapTime=0;if(done>=3){this.state='finished';return;}}
    this.balanceRivals(player,dt);
    // All drivers observe the same instant, before any car advances.
    const observation=observeTraffic([player,...this.opponents.map(o=>o.car)]);
    this.opponents.forEach(o=>{
      o.avoidance=Math.max(0,o.avoidance-dt*.012);
      o.decision-=dt;
      if(o.decision<=0){this.decide(o,player,observation);o.decision=o.reaction;}
      o.car.drive(dt,o.control);
      o.stuck=o.car.offRoad&&o.car.speed<5?o.stuck+dt:0;
      if(o.stuck>2.5){o.car.recover();o.stuck=0;o.decision=0;}
      o.distance=o.car.distance;o.speed=o.car.speed;
    });
    const cars=[player,...this.opponents.map(o=>o.car)];
    for(let a=0;a<cars.length;a++)for(let b=a+1;b<cars.length;b++){
      const impact=cars[a].velocity.sub(cars[b].velocity).length();
      if(resolveCollision(cars[a],cars[b]))this.scoreContact(cars[a],cars[b],`${a}:${b}`,impact);
    }
    for(const [key,time] of this.contacts)if(this.elapsed-time>.6)this.contacts.delete(key);
    this.position=1+this.opponents.filter(o=>o.distance>player.distance).length;
  }
}
export function formatTime(s:number){if(!s)return '—:——.———';return `${Math.floor(s/60)}:${(s%60).toFixed(3).padStart(6,'0')}`;}
