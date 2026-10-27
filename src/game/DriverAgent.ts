import * as THREE from 'three';
import type {Rival} from './Race';
import {Track} from './Track';
import {Vehicle} from './Vehicle';
import {LinePlanner} from './LinePlanner';
import {HANDLING,steeringLock,brakingDeceleration,cornerSpeed,lateralGrip} from './Dynamics';
import {CornerRacecraft} from './CornerRacecraft';
import {AISpeedPlanner} from './AISpeedPlanner';

export interface TrafficSample {
  readonly car:Vehicle;readonly position:THREE.Vector3;readonly progress:number;readonly speed:number;
}
export interface DriverObservation {readonly elapsed:number;readonly playerPosition:number;readonly fieldSize?:number;readonly traffic:readonly TrafficSample[]}
export function observeTraffic(cars:readonly Vehicle[]):readonly TrafficSample[]{
  return cars.map(car=>({car,position:car.position.clone(),progress:car.progress,speed:car.speed}));
}
export type DriverIntent='race'|'follow'|'overtake'|'defend'|'yield'|'recover';
interface OpponentMemory {lastSeen:number;gap:number;closing:number;contacts:number;riskUntil:number;lane:number;lateralRate:number}
/** One autonomous controller per car: private perception, opponent memory,
 * tactical state and decisions. Only immutable track data is shared. */
export class DriverAgent {
  intent:DriverIntent='race';decisions=0;lastDecision=0;lastIncident=-Infinity;
  target?:Vehicle;observation?:DriverObservation;
  private elapsed=0;private playerPosition=6;
  private memory=new Map<Vehicle,OpponentMemory>();
  private passingTarget?:Vehicle;private pendingPass?:Vehicle;private passDeadline=0;
  passAttempts=0;passesCompleted=0;
  readonly corner:CornerRacecraft;
  private narrowCorners:{entry:number;exit:number}[]=[];
  constructor(readonly driver:Omit<Rival,'agent'>,private track:Track,private planner:LinePlanner,private aiSpeeds:Readonly<Float64Array>,private speedPlanner:AISpeedPlanner){
    for(let i=0;i<planner.apices.length-1;i++){
      let last=i;
      while(last+1<planner.apices.length&&planner.apices[last].direction!==planner.apices[last+1].direction&&(planner.apices[last+1].progress-planner.apices[last].progress)*track.length<120)last++;
      if(last>i){this.narrowCorners.push({entry:planner.apices[i].progress*track.length,exit:planner.apices[last].progress*track.length});i=last;}
    }
    this.corner=new CornerRacecraft(track,planner,this.narrowCorners,this.speedPlanner);
  }
  get memorySize(){return this.memory.size;}
  get status(){if(this.corner.current&&this.intent!=='yield'&&this.intent!=='recover')return this.corner.current.exiting?'코너 탈출':{inside:'인코스 공략',defend:'코너 방어',cutback:'탈출 준비'}[this.corner.current.role];return {race:'주행',follow:'추종',overtake:'추월',defend:'방어',yield:'양보',recover:'복귀'}[this.intent];}
  memoryFor(car:Vehicle):Readonly<OpponentMemory>|undefined{return this.memory.get(car);}
  reset(){this.intent='race';this.decisions=0;this.lastDecision=0;this.lastIncident=-Infinity;this.target=undefined;this.observation=undefined;this.passingTarget=undefined;this.pendingPass=undefined;this.passDeadline=0;this.passAttempts=this.passesCompleted=0;this.memory.clear();this.corner.reset();}
  onContact(other:Vehicle,impact:number,time:number){
    const o=this.driver,remembered=this.memory.get(other);
    this.memory.set(other,{lastSeen:time,gap:remembered?.gap??0,closing:remembered?.closing??0,contacts:(remembered?.contacts??0)+1,riskUntil:time+6+o.caution*4,lane:remembered?.lane??0,lateralRate:remembered?.lateralRate??0});
    this.lastIncident=time;this.intent='yield';this.target=other;
    this.passingTarget=undefined;this.pendingPass=undefined;
    this.corner.cancel();
    o.collisionScore-=5+Math.min(20,impact*2);o.collisionCount++;
    o.avoidance=Math.min(1.5,o.avoidance+.35+impact*.025);
    o.defendUntil=0;o.passUntil=0;o.passLane=undefined;o.decision=0;
  }
  private perceive(traffic:readonly TrafficSample[],gapTo:(other:TrafficSample)=>number,speed:number){
    this.target=undefined;
    for(const other of traffic){
      const previous=this.memory.get(other.car);
      const lane=other.position.clone().sub(this.speedPlanner.point(other.progress)).dot(this.track.normal(other.progress));
      const drift=previous?THREE.MathUtils.clamp((lane-previous.lane)/Math.max(.01,this.elapsed-previous.lastSeen),-4,4):0;
      this.memory.set(other.car,{lane,lateralRate:previous?previous.lateralRate*.5+drift*.5:0,lastSeen:this.elapsed,gap:gapTo(other),closing:speed-other.speed,contacts:previous?.contacts??0,riskUntil:previous?.riskUntil??0});
    }
    for(const [car,memory] of this.memory)if(this.elapsed-memory.lastSeen>8)this.memory.delete(car);
  }
  private racingSpeed(progress:number){
    const f=((progress%1+1)%1)*this.aiSpeeds.length,i=Math.floor(f);
    return THREE.MathUtils.lerp(this.aiSpeeds[i],this.aiSpeeds[(i+1)%this.aiSpeeds.length],f-i);
  }
  think(observation:DriverObservation){
    const o=this.driver;
    this.decisions++;this.lastDecision=observation.elapsed;this.observation=observation;
    this.elapsed=observation.elapsed;this.playerPosition=observation.playerPosition;
    this.intent=this.elapsed-this.lastIncident<1.25?'yield':'race';
    const car=o.car,lookahead=THREE.MathUtils.clamp(7+car.speed*.3,9,26),t=car.progress+lookahead/this.track.length;
    const traffic=observation.traffic.filter(other=>other.car!==car&&other.position.distanceToSquared(car.position)<100*100);
    const biasCache=new Map<object,number>();
    const biasAt=(other:Pick<Vehicle,'position'|'progress'>)=>{
      let bias=biasCache.get(other);if(bias===undefined){bias=other.position.clone().sub(this.speedPlanner.point(other.progress)).dot(this.track.normal(other.progress));biasCache.set(other,bias);}return bias;
    };
    const offsetAt=(progress:number)=>this.speedPlanner.point(progress).sub(this.track.point(progress)).dot(this.track.normal(progress));
    const gapTo=(other:TrafficSample)=>{let gap=other.progress-car.progress;if(gap<-.5)gap+=1;if(gap>.5)gap-=1;return gap*this.track.length;};
    this.perceive(traffic,gapTo,car.speed);
    // A safe merge can end the manoeuvre just before the rear car is fully
    // clear. Remember its outcome separately from the active lane command.
    if(this.pendingPass){
      const rival=traffic.find(other=>other.car===this.pendingPass);
      if(rival&&gapTo(rival)<-12){this.passesCompleted++;this.pendingPass=undefined;}
      else if(!rival||this.elapsed>this.passDeadline)this.pendingPass=undefined;
    }
    const settling=this.elapsed-this.lastIncident<1.25;
    const currentBias=biasAt(car);
    // Tight alternating turns need a stable entry corridor (Rettifilo,
    // Roggia and Ascari), especially at the 85-second pursuit pace.
    const meters=car.progress*this.track.length;
    const fieldSize=observation.fieldSize??observation.traffic.length;
    const crowdedField=fieldSize>6;
    // A larger standing grid must first clear Rettifilo; local battles then
    // use their own timing instead of all drivers returning to one slot.
    const racingField=fieldSize>2;
    const openingFormation=racingField&&this.elapsed<40&&meters<1300;
    const competitive=racingField&&!openingFormation;
    const elitePursuit=competitive&&(o.racePace??o.pace)/Math.sqrt(car.gripScale)>1.24;
    const battleThreshold=elitePursuit?84:72;
    const straight=[0,20,40,60].every(distance=>this.planner.cornerLimit(car.progress+distance/this.track.length)>(competitive?battleThreshold:60));
    const passRoadClear=!competitive||[0,30,60,90,120].every(distance=>this.planner.cornerLimit(car.progress+distance/this.track.length)>battleThreshold);
    const converging=competitive&&!passRoadClear;
    const narrow=this.narrowCorners.find(corner=>meters>corner.entry-360&&meters<corner.exit+100);
    const chicaneTraffic=!!narrow&&traffic.some(other=>Math.abs(gapTo(other))<100);
    // Each independent driver remembers contact and spends more margin afterward.
    const caution=o.caution+o.avoidance,clearance=2.8+caution*.3;
    let desiredLane=this.elapsed<2?currentBias:chicaneTraffic?0:competitive&&straight&&!elitePursuit?o.lineBias:(o.racePace??o.pace)>1.42?0:o.lineBias;
    if(chicaneTraffic){o.passLane=undefined;o.passUntil=0;o.defendUntil=0;this.passingTarget=undefined;this.intent='yield';}
    if(competitive&&!passRoadClear){this.passingTarget=undefined;o.passLane=undefined;o.passUntil=0;desiredLane=0;}
    if(competitive&&this.passingTarget){
      const rival=traffic.find(other=>other.car===this.passingTarget);
      if(rival&&gapTo(rival)<-12){this.passingTarget=undefined;o.passUntil=this.elapsed+.45;}
      else if(!rival||this.elapsed>o.passUntil)this.passingTarget=undefined;
      if(this.passingTarget&&o.passLane!==undefined){desiredLane=o.passLane;this.intent='overtake';}
    }
    // AI uses the precomputed braking envelope with its own short reaction
    // distance, rather than the extra early-braking margin intended for a human.
    // Distinct corner/exit preferences change with track position. This only
    // varies the individual target inside the established physical pace cap.
    const rhythm=competitive&&!elitePursuit?1+.04*Math.sin(car.distance*Math.PI*7.3+o.phase):1;
    const pace=Math.min(1.47,(o.racePace??o.pace)*rhythm);
    const advanced=openingFormation?0:THREE.MathUtils.smoothstep(pace,1.25,1.43);
    const physicalRoom=advanced>.8&&car.gripUsage<1.04&&Math.abs(Math.atan2(car.lateralSpeed,Math.max(8,car.speed)))<.1;
    const cornerRoom=pace/Math.sqrt(car.gripScale)<1.19||physicalRoom;
    const alignedForCorner=advanced<.1||!!this.corner.current||Math.abs(currentBias)<1&&Math.abs(o.lane)<1;
    const preferExit=advanced>.1&&this.speedPlanner.projectedGripUse(pace,car.gripScale)>.75;
    const cornerPlan=this.corner.update(o,traffic,competitive&&cornerRoom&&alignedForCorner&&(!elitePursuit||physicalRoom)&&!settling&&!chicaneTraffic&&!this.passingTarget,elitePursuit&&!physicalRoom,preferExit);
    const reference=car.progress+car.speed*(cornerPlan?.preview??.12)/this.track.length;
    // Advanced drivers use geometry and actual tire/braking capacity, rather
    // than a capped multiple of the conservative guide shown to the player.
    // Keep the established gentle targets for less experienced players and
    // the standing-grid chicane, then blend continuously into physical plans.
    const speedAt=(progress:number)=>advanced===0?this.racingSpeed(progress)*pace:THREE.MathUtils.lerp(this.racingSpeed(progress)*pace,this.speedPlanner.speed(progress,pace,car.gripScale),advanced);
    const cornerAt=(progress:number)=>advanced===0?this.planner.cornerLimit(progress)*pace:THREE.MathUtils.lerp(this.planner.cornerLimit(progress)*pace,this.speedPlanner.cornerLimit(progress,pace,car.gripScale),advanced);
    const safeTarget=(progress:number)=>{
      let target=Math.min(o.speedCap,speedAt(progress));
      const braking=brakingDeceleration(car.speed,car.offRoad,car.gripScale)*THREE.MathUtils.lerp(.75,.82,advanced);
      const reaction=THREE.MathUtils.lerp(.18,.06,advanced);
      for(let distance=12;distance<=300;distance+=12){
        const corner=Math.min(o.speedCap,cornerAt(progress+distance/this.track.length));
        target=Math.min(target,Math.sqrt(corner*corner+2*braking*Math.max(0,distance-car.speed*reaction)));
      }
      return target;
    };
    const plannedTarget=safeTarget(reference);
    const nextTarget=safeTarget(reference+8/this.track.length);
    const plannedAcceleration=(nextTarget*nextTarget-plannedTarget*plannedTarget)/16;
    let target=plannedTarget,passing=competitive&&!!this.passingTarget;
    const ahead=traffic.filter(other=>gapTo(other)>0&&gapTo(other)<(chicaneTraffic||advanced>.1?100:70)&&(chicaneTraffic||converging||Math.abs(biasAt(other)-currentBias)<3))
      .sort((a,b)=>gapTo(a)-gapTo(b))[0];
    if(ahead){
      this.target=ahead.car;if(!chicaneTraffic&&!settling)this.intent='follow';
      const nearest=gapTo(ahead),otherBias=biasAt(ahead);
      if(!cornerPlan&&!settling&&(!openingFormation||this.elapsed<o.passUntil)&&!chicaneTraffic&&passRoadClear&&(competitive||pace<=1.42||o.speedCap<=94||car.speed-ahead.speed>2)&&nearest<Math.min(70,25+car.speed*.7)&&car.speed>=ahead.speed-1&&[0,.25,.5,.75,1].every(fraction=>this.planner.cornerLimit(car.progress+fraction*Math.max(60,car.speed*(competitive?1.8:pace>1.42&&o.speedCap>94?3.5:2.2))/this.track.length)>60)){
        // Try both passing corridors and reject ones that clip the edge at
        // either car or at the steering target. Clamping an impossible pass
        // to the same lane used to create queues and repeated contact.
        const offsets=[offsetAt(car.progress),offsetAt(ahead.progress),offsetAt(t)];
        if(competitive)for(let distance=30;distance<=Math.max(160,car.speed*2.5);distance+=30)offsets.push(offsetAt(car.progress+distance/this.track.length));
        const low=Math.max(...offsets.map(offset=>-7.4-offset),competitive?-4.2:-Infinity);
        const high=Math.min(...offsets.map(offset=>7.4-offset),competitive?4.2:Infinity);
        const lanes=[otherBias-3.5,otherBias+3.5].filter(lane=>lane>=low&&lane<=high&&traffic.every(other=>{
          const predicted=biasAt(other)+(competitive?(this.memory.get(other.car)?.lateralRate??0)*.6:0);
          if(other===ahead||Math.min(Math.abs(biasAt(other)-lane),Math.abs(predicted-lane))>clearance)return true;
          const gap=gapTo(other),longitudinalClearance=gap<0?14+Math.max(0,other.speed-car.speed)*.5:18;
          return Math.abs(gap)>longitudinalClearance;
        }));
        // Keep the selected side through small lateral movements of the
        // target instead of repeatedly swapping left/right passing lanes.
        const cost=(lane:number)=>Math.abs(lane-currentBias)+(this.elapsed<o.passUntil&&o.passLane!==undefined&&Math.abs(lane-o.passLane)>3?(competitive?5:.8):0)+((this.memory.get(ahead.car)?.riskUntil??0)>this.elapsed?Math.max(0,4.2-Math.abs(lane-(otherBias+(this.memory.get(ahead.car)?.lateralRate??0)*.5)))*.4:0);
        lanes.sort((a,b)=>cost(a)-cost(b));
        if(lanes.length){
          desiredLane=lanes[0];passing=true;o.passLane=desiredLane;
          if(competitive){if(this.passingTarget!==ahead.car){this.passingTarget=ahead.car;this.passAttempts++;o.passUntil=this.elapsed+8+o.aggression*3;this.pendingPass=ahead.car;this.passDeadline=o.passUntil+3;}}
          else o.passUntil=this.elapsed+1.25+o.aggression*.5;
          this.intent='overtake';
        }else if(competitive){this.passingTarget=undefined;passing=false;}
      }
      if(chicaneTraffic&&narrow){
        // Include cars in the other lane: both corridors soon share an apex.
        // Build headway progressively, not by demanding the full braking-zone
        // gap 360m early. Bound following speed by the actual braking distance;
        // a moving queue can roll through while a stopped obstacle still stops it.
        const approach=THREE.MathUtils.smoothstep(meters,narrow.entry-360,narrow.entry-160);
        const elite=competitive&&pace/Math.sqrt(car.gripScale)>1.24;
        const headway=elite?(crowdedField?.35:.45):competitive?.4+caution*.08:.60;
        const safeGap=(elite?7:8)+car.speed*THREE.MathUtils.lerp(.12,headway,approach)+caution*(elite?1:1.5);
        const braking=brakingDeceleration(car.speed,car.offRoad,car.gripScale)*.7;
        const safeSpeed=Math.sqrt(ahead.speed*ahead.speed+2*braking*Math.max(0,nearest-7));
        const rollingTarget=ahead.speed+(nearest-safeGap)*.35;
        target=Math.min(target,safeSpeed,Math.max(0,elite&&crowdedField?Math.max(ahead.speed-2,rollingTarget):rollingTarget));
      }
      const closing=Math.max(0,car.speed-ahead.speed);
      const brakingGap=7+caution*3+car.speed*(.12+caution*.05+advanced*.12)+closing*.35+closing*closing/(2*brakingDeceleration(car.speed,car.offRoad,car.gripScale)*.8);
      if(nearest<Math.max(9+car.speed*.2,brakingGap)&&(converging||Math.abs(currentBias-otherBias)<2.6)){
        // While safely pulling out, retain the speed needed to pass instead
        // of braking to the target's speed before leaving its corridor.
        const pullingOut=competitive&&passing&&nearest>12+closing*.8;
        const followingTime=pullingOut?.03:.12+caution*.05+advanced*.12;
        target=Math.min(target,Math.max(5,ahead.speed+(nearest-7-caution*3-car.speed*followingTime)*.9));
      }
    }
    // Defend once before a corner while the attacker is still well behind.
    // A short hold and cooldown prevent reactive weaving or late blocking.
    const nextApex=this.planner.apices.find(apex=>apex.progress>car.progress)??this.planner.apices[0];
    const apexDistance=nextApex?((nextApex.progress-car.progress+1)%1)*this.track.length:Infinity;
    const alongside=traffic.some(other=>Math.abs(gapTo(other))<14);
    if(!settling&&!chicaneTraffic&&!passing&&!ahead&&straight&&!alongside){
      if(this.elapsed<o.defendUntil){desiredLane=o.defendLane;this.intent='defend';}
      else if(o.aggression-o.avoidance*.35>.5&&this.elapsed>o.defendCooldown&&apexDistance>200&&apexDistance<(competitive?440:260)&&traffic.some(other=>{
        const gap=-gapTo(other),closing=other.speed-car.speed;
        return gap>22&&gap<45&&closing>1&&gap/closing>3;
      })){
        desiredLane=o.lineBias+(nextApex?.direction??1)*1.2;
        this.intent='defend';o.defendLane=desiredLane;o.defendUntil=this.elapsed+1.2;o.defendCooldown=this.elapsed+8;
      }
    }else o.defendUntil=0;
    if(cornerPlan){desiredLane=cornerPlan.laneAt(t);this.target=cornerPlan.opponent;this.intent=cornerPlan.role==='defend'?'defend':cornerPlan.exiting?'race':'overtake';}
    // Stay in the current corridor until an alongside car has cleared,
    // including when finishing a pass and returning to the racing line.
    if(traffic.some(other=>{
      const gap=gapTo(other);
      const rearClearance=8+Math.max(0,other.speed-car.speed-5)*.5;
      if(gap<0&&-gap>=rearClearance||gap>=8&&(passing||gap>35))return false;
      const lane=biasAt(other);
      if(competitive&&(currentBias-lane)*(desiredLane-currentBias)>0)return false;
      return lane>Math.min(currentBias,desiredLane)-clearance&&lane<Math.max(currentBias,desiredLane)+clearance;
    })){desiredLane=currentBias;if(!passing)this.intent='yield';}
    const baseOffset=this.speedPlanner.point(t).sub(this.track.point(t)).dot(this.track.normal(t));
    desiredLane=THREE.MathUtils.clamp(desiredLane,-7.2-baseOffset,7.2-baseOffset);
    o.lane=THREE.MathUtils.damp(o.lane,desiredLane,1.2+o.aggression,o.reaction);
    const lane=THREE.MathUtils.clamp(o.lane,-7.2-baseOffset,7.2-baseOffset);
    const point=this.speedPlanner.point(t).addScaledVector(this.track.normal(t),lane);
    const to=point.sub(car.position),desired=Math.atan2(to.x,to.z);
    const error=Math.atan2(Math.sin(desired-car.heading),Math.cos(desired-car.heading));
    const angle=Math.atan2(2*HANDLING.wheelbase*Math.sin(error),Math.max(5,to.length()));
    const steer=THREE.MathUtils.clamp((angle-car.yawRate*.01)/steeringLock(car.speed,car.gripScale),-1,1);
    if(advanced>.1&&Math.abs(currentBias-lane)>.35){
      // A car returning to its corridor may need a tighter turn than the
      // reference path. Bound the actual pursuit curvature before it drifts
      // outside the road, not just the curvature of an already aligned car.
      const curvature=Math.abs(Math.tan(angle))/HANDLING.wheelbase;
      target=Math.min(target,cornerSpeed(curvature/(car.gripScale*.96),o.speedCap));
    }
    if(Math.abs(lane)>1.2||cornerPlan&&Math.abs(lane)>.1||(advanced>.1||chicaneTraffic)&&Math.abs(lane)>.1){
      // A passing corridor can have a tighter radius than the racing line.
      // Anticipate its corners instead of carrying the ideal line's speed
      // into the grass while racing side by side.
      const lanePoint=(progress:number)=>this.speedPlanner.point(progress).addScaledVector(this.track.normal(progress),THREE.MathUtils.clamp(cornerPlan&&this.intent!=='yield'?cornerPlan.laneAt(progress):lane,-7.2-offsetAt(progress),7.2-offsetAt(progress)));
      for(const distance of advanced>.1?[0,12,24,40,60,90,120,160,200]:[0,12,24,40,60,90]){
        const progress=car.progress+distance/this.track.length;
        const a=lanePoint(progress-4/this.track.length),b=lanePoint(progress),c=lanePoint(progress+4/this.track.length);
        const ab=a.distanceTo(b),bc=b.distanceTo(c),ca=c.distanceTo(a);
        const curvature=2*Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x))/Math.max(.001,ab*bc*ca);
        const limit=cornerSpeed(curvature/car.gripScale,o.speedCap/.92)*.92;
        const braking=advanced>.1?this.speedPlanner.braking(limit,curvature,car.gripScale):brakingDeceleration(car.speed,false,car.gripScale)*.75;
        target=Math.min(target,Math.sqrt(limit*limit+2*braking*Math.max(0,distance-car.speed*.15)));
      }
    }
    if(this.speedPlanner.curvature(car.progress)>.0068&&Math.abs(currentBias-o.lane)>1.5)target=Math.min(target,advanced>.5?speedAt(reference)*.92:this.planner.speed(reference)*Math.sqrt(car.gripScale));
    if(car.offRoad){target=Math.min(target,14);this.intent='recover';}
    if(Math.abs(error)>.5)target=Math.min(target,Math.max(9,22-Math.abs(error)*8));
    // Feed forward the acceleration required by the speed profile and road
    // drag. Error-only throttle used to coast below the target and brake late.
    // Front runners bank ERS; a trailing challenger can spend it on the pass.
    const attackingLeader=this.playerPosition===1&&o.rank>1;
    const reserve=attackingLeader?(o.attack>.7?12:22):THREE.MathUtils.lerp(48,24,o.aggression);
    const localBattle=competitive&&(passing||this.intent==='defend');
    const cleanExit=!!cornerPlan?.exiting&&Math.abs(error)<.06&&Math.abs(car.lateralAcceleration)<lateralGrip(car.speed)*car.gripScale*.65&&(!ahead||gapTo(ahead)>18);
    const acceleratingExit=(!narrow||meters>narrow.exit+24)&&plannedAcceleration>1&&target>Math.max(32,car.speed+2)&&Math.abs(car.lateralAcceleration)<lateralGrip(car.speed)*car.gripScale*.55;
    const wantsBoost=(target>78||acceleratingExit)&&car.speed>20&&Math.abs(error)<.09&&plannedAcceleration>-.5&&car.boost>Math.max(5,(localBattle||cleanExit?Math.max(12,32-o.aggression*18):reserve)-(o.control.boost?8:0))&&(!ahead||passing||cleanExit||gapTo(ahead)>35);
    if(!wantsBoost)target=Math.min(target,o.speedCap*87/94);
    const feedforward=target<plannedTarget-.1?0:plannedAcceleration;
    const exitDrive=cleanExit&&!elitePursuit?Math.min(.8,Math.max(0,target-car.speed)*.12):0;
    const acceleration=feedforward+(target-car.speed)*2+exitDrive;
    const drag=.00105*car.speed*car.speed+(car.offRoad?4.2:.35);
    let demand=acceleration+drag;
    if((advanced>.1||elitePursuit||cornerPlan)&&demand>drag){
      // Preserve cornering grip when a dense fast pack accelerates together.
      // Steering demand anticipates saturation before measured lateral force
      // falls; it avoids buying pace through repeated off-track recoveries.
      const grip=lateralGrip(car.speed,car.offRoad)*car.gripScale*.96;
      const turning=Math.max(Math.abs(car.lateralAcceleration),car.speed*car.speed*Math.abs(Math.tan(car.steerAngle))/HANDLING.wheelbase);
      const available=Math.sqrt(Math.max(0,grip*grip-turning*turning));
      demand=Math.min(demand,drag+available);
    }
    const boost=wantsBoost&&demand>0;
    const pursuit=1+(o.powerAssist-1)*THREE.MathUtils.smoothstep(car.speed,45,75);
    const engine=(boost?23:17)*car.powerScale*(car.raceLaunchScale??1)*pursuit*(1-car.speed/140);
    o.control={steer,throttle:THREE.MathUtils.clamp(demand/Math.max(1,engine),0,1),brake:THREE.MathUtils.clamp(-demand/brakingDeceleration(car.speed,car.offRoad,car.gripScale),0,1),boost};
  }
}
