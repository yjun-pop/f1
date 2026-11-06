import * as THREE from 'three';
import {PaceControl} from './PaceControl';
import {Vehicle} from './Vehicle';
import {DriverAgent,type DriverObservation} from './DriverAgent';
import type {Track} from './Track';
import type {LinePlanner} from './LinePlanner';
import type {AISpeedPlanner} from './AISpeedPlanner';
import type {Controls} from './Dynamics';
import type {DRIVER_PROFILES} from './RaceRoster';

export interface Rival {
  agent:DriverAgent;car:Vehicle;distance:number;speed:number;name:string;
  personality:string;caution:number;launch:number;collisionScore:number;collisionCount:number;avoidance:number;
  passLane?:number;passUntil:number;defendUntil:number;defendCooldown:number;defendLane:number;
  racePace?:number;rank:number;speedCap:number;powerAssist:number;attack:number;pace:number;aggression:number;reaction:number;lineBias:number;phase:number;lane:number;decision:number;stuck:number;control:Controls;
}
type DriverProfile=(typeof DRIVER_PROFILES)[number];

/** A race entrant owns its physical car and every mutable driving state.
 * Geometry/speed caches and a frame's observations may be shared; tactical
 * memory, energy decisions, incident penalties and clocks never are. */
export class Opponent implements Rival {
  readonly paceControl=new PaceControl();
  readonly id:string;readonly car:Vehicle;readonly agent:DriverAgent;
  name:string;personality:string;caution:number;launch:number;pace:number;aggression:number;reaction:number;lineBias:number;phase:number;
  distance=0;speed=0;collisionScore=0;collisionCount=0;avoidance=0;
  passLane?:number;passUntil=0;defendUntil=0;defendCooldown=0;defendLane=0;
  racePace?:number;rank=1;speedCap=94;powerAssist=1;attack=0;lane=0;decision=0;stuck=0;
  control:Controls={throttle:0,brake:0,steer:0};
  constructor(profile:DriverProfile,index:number,private track:Track,scene:THREE.Scene,planner:LinePlanner,aiSpeeds:Readonly<Float64Array>,private speedPlanner:AISpeedPlanner){
    this.name=profile.name;this.id=`ai:${profile.name.toLowerCase()}`;
    this.personality=profile.personality;this.caution=profile.caution;this.launch=profile.launch;this.pace=profile.pace;
    this.aggression=profile.aggression;this.reaction=profile.reaction;this.lineBias=profile.lineBias;this.phase=index*2.17;
    this.car=new Vehicle(track,scene,profile.color,{grip:1.4,power:1});
    this.agent=new DriverAgent(this,track,planner,aiSpeeds,speedPlanner);
  }
  reset(slot:{meters:number;lane:number},rank:number){
    const progress=slot.meters/this.track.length;
    this.car.resetAt(progress,slot.lane);this.distance=progress;this.speed=0;
    this.lane=slot.lane-this.speedPlanner.point(progress).sub(this.track.point(progress)).dot(this.track.normal(progress));
    this.decision=this.stuck=0;this.rank=rank;this.speedCap=94;this.powerAssist=1;this.attack=0;
    this.passLane=undefined;this.passUntil=this.defendUntil=this.defendCooldown=this.defendLane=0;
    this.paceControl.reset();this.agent.reset();this.collisionScore=this.collisionCount=this.avoidance=0;this.racePace=undefined;
    this.car.raceGripAssist=this.car.raceLaunchScale=undefined;this.car.boost=100;this.car.boosting=false;
    this.car.raceSpeedCap=this.car.raceCruiseCap=this.car.racePowerAssist=undefined;
    this.control={throttle:0,brake:0,steer:0};
  }
  setDifficulty(target:{pace:number;cap:number;power:number},elapsed:number,dt:number){
    // Difficulty supplies a performance envelope, never a lane or opponent.
    // Local strategy alone decides how to spend the car's actual resources.
    this.attack=THREE.MathUtils.damp(this.attack,this.agent.strategy.goal.urgency,.25,dt);
    this.racePace=THREE.MathUtils.damp(this.racePace??this.pace,target.pace,.12,dt);
    this.speedCap=Math.min(target.cap,THREE.MathUtils.damp(this.speedCap,target.cap,.4,dt));
    this.powerAssist=Math.min(target.power,THREE.MathUtils.damp(this.powerAssist,target.power,.4,dt));
    this.car.raceLaunchScale=THREE.MathUtils.lerp(this.launch,1,THREE.MathUtils.smoothstep(elapsed,5,22));
    this.car.raceGripAssist=1;this.car.raceSpeedCap=this.speedCap;this.car.raceCruiseCap=this.speedCap*87/94;this.car.racePowerAssist=this.powerAssist;
  }
  plan(dt:number,observation:DriverObservation){
    this.avoidance=Math.max(0,this.avoidance-dt*.012);this.decision-=dt;
    if(this.decision<=0){this.agent.think(observation);this.decision=this.reaction;}
  }
  advance(dt:number){
    this.car.drive(dt,this.control);
    this.stuck=this.car.offRoad&&this.car.speed<5&&!this.agent.behavior.recoveryWaiting?this.stuck+dt:0;
    if(this.stuck>2.5){this.car.recover();this.stuck=0;this.decision=0;}
    this.distance=this.car.distance;this.speed=this.car.speed;
  }
  onContact(other:Vehicle,impact:number,elapsed:number){this.agent.onContact(other,impact,elapsed);}
}
