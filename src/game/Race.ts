import * as THREE from 'three';
import {Track} from './Track';
import {Vehicle,resolveCollision} from './Vehicle';
import {LinePlanner} from './LinePlanner';
import {Controls,brakingDeceleration} from './Dynamics';
import {DriverAgent,observeTraffic} from './DriverAgent';
import {PackDirector} from './PackDirector';
import {StartSequence,type StartSignal} from './StartSequence';
import {DEFAULT_FIELD_SIZE,DRIVER_PROFILES} from './RaceRoster';
import {RaceTiming} from './RaceTiming';
import {AISpeedPlanner} from './AISpeedPlanner';
import {CornerPaceObserver} from './CornerPaceObserver';
import {RaceAerodynamics} from './Aerodynamics';
export interface Rival {
  agent:DriverAgent;car:Vehicle;distance:number;speed:number;name:string;
  personality:string;caution:number;launch:number;collisionScore:number;collisionCount:number;avoidance:number;
  passLane?:number;passUntil:number;defendUntil:number;defendCooldown:number;defendLane:number;
  racePace?:number;rank:number;speedCap:number;powerAssist:number;attack:number;pace:number;aggression:number;reaction:number;lineBias:number;phase:number;lane:number;decision:number;stuck:number;control:Controls;
}
export class Race {
  readonly aerodynamics:RaceAerodynamics;private aeroPreparedAt=-Infinity;
  prepareAerodynamics(player:Vehicle){this.aerodynamics.update([player,...this.opponents.map(o=>o.car)],this.elapsed,this.state==='racing');this.aeroPreparedAt=this.elapsed;}
  state:'ready'|'countdown'|'racing'|'finished'='ready';
  countdown=0;elapsed=0;lapTime=0;best=0;lastLap=0;position=DEFAULT_FIELD_SIZE;
  readonly startSequence=new StartSequence();
  get startSignal():StartSignal {return this.state==='countdown'||this.state==='racing'&&this.elapsed<.85?this.startSequence.signal:{run:this.startSequence.signal.run,phase:'idle',lights:0};}
  private aiSpeeds:Float64Array;
  private speedPlanner:AISpeedPlanner;
  private cornerObserver:CornerPaceObserver;
  private contacts=new Map<string,number>();
  private pack=new PackDirector();
  private lapStart=0;private completed=0;private storageKey:string;
  readonly timing:RaceTiming;private player?:Vehicle;
  readonly opponents:Rival[]=[];
  get fieldSize(){return this.opponents.length+1;}
  private timingSamples(player:Vehicle){return [{id:'PLAYER',name:'PLAYER',distance:player.distance},...this.opponents.map(o=>({id:o.name,name:o.name,distance:o.car.distance}))];}
  get intervals(){return this.player?this.timing.neighbours(this.timingSamples(this.player),'PLAYER',this.elapsed):{ahead:null,behind:null};}
  constructor(private track:Track,scene:THREE.Scene,private planner:LinePlanner,options:{opponentCount?:number}={}){
    this.timing=new RaceTiming(track.length);this.aerodynamics=new RaceAerodynamics(track,planner);track.details.addDRSBoards(track,this.aerodynamics.zones);
    // Rivals retain fixed steering/grip calibration, but share the player's
    // engine output, ERS and speed limits. Difficulty adjusts driving targets.
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
    this.speedPlanner=new AISpeedPlanner(track);
    this.cornerObserver=new CornerPaceObserver(track,planner);
    this.storageKey=`apex-best-${track.name.toLowerCase()}-v3`;
    const profiles=DRIVER_PROFILES.slice(0,Math.max(1,Math.min(DRIVER_PROFILES.length,Math.floor(options.opponentCount??DEFAULT_FIELD_SIZE-1))));
    profiles.forEach((p,i)=>{const driver:Omit<Rival,'agent'>={...p,car:new Vehicle(track,scene,p.color,{grip:1.4,power:1}),distance:0,speed:0,collisionScore:0,collisionCount:0,avoidance:0,passUntil:0,defendUntil:0,defendCooldown:0,defendLane:0,phase:i*2.17,lane:0,decision:0,stuck:0,rank:i+1,speedCap:94,powerAssist:1,attack:0,control:{throttle:0,brake:0,steer:0}};const rival=Object.assign(driver,{agent:new DriverAgent(driver,track,planner,this.aiSpeeds,this.speedPlanner)});this.opponents.push(rival);});this.reset();
    try{this.best=Number(localStorage.getItem(this.storageKey)||0);}catch{}
  }
  reset(){this.aerodynamics.reset();this.aeroPreparedAt=-Infinity;this.contacts.clear();this.pack.reset();this.cornerObserver.reset();this.startSequence.reset();this.timing.reset();this.player=undefined;this.state='ready';this.countdown=0;this.elapsed=0;this.lapTime=0;this.lapStart=0;this.lastLap=0;this.completed=0;this.position=this.fieldSize;
    this.opponents.forEach((o,i)=>{const progress=(15+(this.opponents.length-1-i)*12)/this.track.length;o.car.resetAt(progress,i%2?3:-3);o.distance=progress;o.speed=0;o.lane=(i%2?3:-3)-this.speedPlanner.point(progress).sub(this.track.point(progress)).dot(this.track.normal(progress));o.decision=0;o.stuck=0;o.rank=i+1;o.speedCap=94;o.powerAssist=1;o.attack=0;o.passLane=undefined;o.passUntil=0;o.defendUntil=0;o.defendCooldown=0;o.defendLane=0;this.agentFor(o).reset();o.collisionScore=0;o.collisionCount=0;o.avoidance=0;o.racePace=undefined;o.car.raceGripAssist=undefined;o.car.raceLaunchScale=undefined;o.car.boost=100;o.car.boosting=false;o.car.raceSpeedCap=undefined;o.car.raceCruiseCap=undefined;o.car.racePowerAssist=undefined;o.control={throttle:0,brake:0,steer:0};});}
  start(){if(this.state==='ready'){this.startSequence.arm();this.countdown=this.startSequence.remaining;this.state='countdown';}}
  private balanceRivals(player:Vehicle,dt:number){
    const corner=this.cornerObserver.sample(player,dt);if(corner)this.pack.recordCorner(corner.speed,corner.reference);
    const sample=((player.progress%1+1)%1)*this.aiSpeeds.length,index=Math.floor(sample);
    const referenceSpeed=THREE.MathUtils.lerp(this.aiSpeeds[index],this.aiSpeeds[(index+1)%this.aiSpeeds.length],sample-index);
    this.pack.observe(player,referenceSpeed,player.position.distanceToSquared(this.track.point(player.progress))<18*18,dt);
    // Snapshot standings once, using total race distance across lap seams.
    const order:{distance:number;rival:Rival|null}[]=[{distance:player.distance,rival:null},...this.opponents.map(rival=>({distance:rival.car.distance,rival}))];
    order.sort((a,b)=>b.distance-a.distance);
    this.position=order.findIndex(entry=>entry.rival===null)+1;
    order.forEach((entry,i)=>{if(entry.rival)entry.rival.rank=i+1;});
    const contenders=this.position<=3?this.opponents.filter(o=>o.rank<=3&&o.rank>this.position).sort((a,b)=>a.rank-b.rank):[];
    const attacker=contenders[Math.floor(this.elapsed/14)%Math.max(1,contenders.length)];
    for(const o of this.opponents){
      const gap=(o.car.distance-player.distance)*this.track.length;
      const attack=contenders.includes(o)?(o===attacker?1:.45):0;
      o.attack=THREE.MathUtils.damp(o.attack,attack,.25,dt);
      const freePace=o.pace;
      let targetPace=freePace,targetCap=94,targetPower=1;
      if(this.pack.active){
        const pack=this.pack.targets(gap,o.rank,this.position,o.pace,o.attack,this.fieldSize);
        const formation=this.fieldSize>6&&o.car.distance*this.track.length<(this.track.circuit?.formationEnd??1300)-50;
        const matching=formation?0:THREE.MathUtils.smoothstep(this.elapsed,4,18);
        targetPace=THREE.MathUtils.lerp(freePace,pack.pace,matching);
        // No extra straight-line performance in a visible duel or while the
        // player spends ERS. Also check world distance across lap seams.
        const unseen=THREE.MathUtils.smoothstep(o.car.position.distanceTo(player.position),180,300);
        const allowed=!player.boosting&&!(player.throttle>.9&&player.speed>85);
        if(allowed){targetCap=94+(pack.cap-94)*unseen;targetPower=1+(pack.power-1)*unseen;}
      }
      // Skill adapts over several seconds, including after a position swap.
      // Engine assistance has a hard local ceiling: entering visible range
      // cannot carry a stale acceleration advantage into a pass.
      o.racePace=THREE.MathUtils.damp(o.racePace??o.pace,targetPace,.12,dt);
      o.speedCap=Math.min(targetCap,THREE.MathUtils.damp(o.speedCap,targetCap,.4,dt));
      o.powerAssist=Math.min(targetPower,THREE.MathUtils.damp(o.powerAssist,targetPower,.4,dt));
      o.car.raceLaunchScale=THREE.MathUtils.lerp(o.launch,1,THREE.MathUtils.smoothstep(this.elapsed,5,22));
      o.car.raceGripAssist=1;
      o.car.raceSpeedCap=o.speedCap;o.car.raceCruiseCap=o.speedCap*87/94;o.car.racePowerAssist=o.powerAssist;
    }
  }
  private agentFor(o:Rival){
    // Also support test/reference drivers and dynamically added vehicles.
    if(!o.agent||o.agent.driver!==o)o.agent=new DriverAgent(o,this.track,this.planner,this.aiSpeeds,this.speedPlanner);
    return o.agent;
  }
  private decide(o:Rival,player:Vehicle,traffic=observeTraffic([player,...this.opponents.map(other=>other.car)])){
    this.agentFor(o).think({elapsed:this.elapsed,playerPosition:this.position,fieldSize:this.fieldSize,traffic});
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
    this.player=player;
    if(this.state==='countdown'){this.startSequence.advance(dt);this.countdown=this.startSequence.remaining;if(this.startSequence.signal.phase==='go'){this.state='racing';this.timing.update(this.timingSamples(player),0);}return;}
    if(this.state!=='racing')return;
    if(this.aeroPreparedAt!==this.elapsed)this.prepareAerodynamics(player);this.aeroPreparedAt=-Infinity;
    this.elapsed+=dt;this.lapTime=this.elapsed-this.lapStart;
    const done=Math.floor(player.distance+1e-6);
    if(done>this.completed){this.lastLap=this.lapTime;this.pack.recordLap(this.lastLap*88/(this.track.circuit?.referenceLap??88),this.completed===0);if(!this.best||this.lastLap<this.best){this.best=this.lastLap;try{localStorage.setItem(this.storageKey,String(this.best));}catch{}}
      this.completed=done;this.lapStart=this.elapsed;this.lapTime=0;if(done>=3){this.timing.update(this.timingSamples(player),this.elapsed);this.state='finished';this.aerodynamics.reset();return;}}
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
      // Capsule contacts cannot reach six metres. Avoid velocity/allocation
      // work for the other pairs in a larger grid.
      if(cars[a].position.distanceToSquared(cars[b].position)>36)continue;
      const impact=cars[a].velocity.sub(cars[b].velocity).length();
      if(resolveCollision(cars[a],cars[b]))this.scoreContact(cars[a],cars[b],`${a}:${b}`,impact);
    }
    for(const [key,time] of this.contacts)if(this.elapsed-time>.6)this.contacts.delete(key);
    this.position=1+this.opponents.filter(o=>o.distance>player.distance).length;
    this.timing.update(this.timingSamples(player),this.elapsed);
  }
}
export function formatTime(s:number){if(!s)return '—:——.———';return `${Math.floor(s/60)}:${(s%60).toFixed(3).padStart(6,'0')}`;}
