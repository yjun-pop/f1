import * as THREE from 'three';
import type {Track} from './Track';
import type {Vehicle} from './Vehicle';
import type {TrafficSample} from './DriverAgent';
import {brakingDeceleration,cornerSpeed,HANDLING} from './Dynamics';

interface Character {aggression:number;caution:number;phase:number;lineBias:number;avoidance?:number}
interface Seen {gap:number;lane:number;forward:number;lateral:number;halfWidth:number;halfLength:number;sample:TrafficSample;hazard:boolean}
export interface TrafficRoute {
  mode:'avoid'|'attack'|'merge'|'wait'|'backout';target?:Vehicle;speed:number;
  lookahead?:number;
  holdLane?:boolean;
  longitudinalOnly?:boolean;
  point:(progress:number)=>THREE.Vector3;laneAt:(progress:number)=>number;
}
interface Commitment {target:Vehicle;lane:number;hazard:boolean;until:number}
/** A private, receding-horizon local planner. Candidates are road corridors,
 * not assigned rank slots. Every driver predicts the same physical traffic
 * snapshot, but owns its route, target, hysteresis and blocked-time memory. */
export class TrafficPlanner {
  mode:TrafficRoute['mode']|'clear'='clear';routesChosen=0;obstaclesPassed=0;passes=0;recoveries=0;
  private commitment?:Commitment;
  private stationary=new Map<Vehicle,number>();
  private sluggish=new Map<Vehicle,number>();
  private previousTime=0;private blockedTime=0;private mergeUntil=0;
  private backing?:{distance:number;until:number};
  private retryAfter=0;
  private get caution(){return Math.min(2,this.character.caution+(this.character.avoidance??0));}
  constructor(private track:Track,private character:Character,private reference:{point:(t:number)=>THREE.Vector3}){}
  reset(){this.mode='clear';this.routesChosen=this.obstaclesPassed=this.passes=this.recoveries=0;this.commitment=this.backing=undefined;this.stationary.clear();this.sluggish.clear();this.previousTime=this.blockedTime=this.mergeUntil=this.retryAfter=0;}
  cancel(){this.commitment=this.backing=undefined;this.mergeUntil=0;this.mode='clear';}
  update(car:Vehicle,traffic:readonly TrafficSample[],time:number,desiredSpeed:number,racing:boolean,expectedAt?:(progress:number)=>number):TrafficRoute|null {
    const dt=Math.max(0,Math.min(.1,time-this.previousTime));this.previousTime=time;
    if(car.offRoad){this.cancel();return null;}
    const length=this.track.length,origin=car.progress,normal=this.track.normal(origin);
    const from=car.position.clone().sub(this.track.point(origin)).dot(normal);
    const delta=(progress:number)=>((progress-origin+1.5)%1-.5)*length;
    const seen:Seen[]=traffic.map(sample=>{
      const tangent=this.track.tangent(sample.progress),n=this.track.normal(sample.progress);
      const lane=sample.position.clone().sub(this.track.point(sample.progress)).dot(n);
      const heading=sample.heading??sample.car.heading,angle=heading-Math.atan2(tangent.x,tangent.z);
      const velocity=sample.velocity??sample.car.velocity;
      const forward=velocity?.dot(tangent)??sample.speed*Math.cos(angle),lateral=velocity?.dot(n)??0;
      const halfWidth=1.075+1.45*Math.abs(Math.sin(angle)),halfLength=1.075+1.45*Math.abs(Math.cos(angle));
      if(Math.abs(forward)<.5&&sample.speed<1){if(!this.stationary.has(sample.car))this.stationary.set(sample.car,time);}else this.stationary.delete(sample.car);
      const queued=time>3&&car.speed<2&&sample.speed<.1&&Math.abs(forward)<.1;
      const stopped=queued||time>3&&this.stationary.has(sample.car)&&time-this.stationary.get(sample.car)!>.75+this.character.caution*.35;
      if(Math.abs(forward)<5&&sample.speed<6){if(!this.sluggish.has(sample.car))this.sluggish.set(sample.car,time);}else this.sluggish.delete(sample.car);
      const crawling=time>6&&this.sluggish.has(sample.car)&&time-this.sluggish.get(sample.car)!>1.5+this.character.caution*.5&&(expectedAt?.(sample.progress)??desiredSpeed)>10;
      // A good cornering line can point across the centreline tangent. Judge
      // a spin from body-relative slip, not that perfectly normal heading gap.
      const sideSlip=velocity?Math.abs(velocity.x*Math.cos(heading)-velocity.z*Math.sin(heading)):0;
      const backwards=forward<-4&&Math.abs(sample.yawRate??sample.car.yawRate)<.15;
      const hazard=stopped||crawling||backwards||Math.abs(forward)<8&&sideSlip>Math.max(6,sample.speed*.4)||sample.offRoad===true;
      return {gap:delta(sample.progress),lane,forward,lateral,halfWidth,halfLength,sample,hazard};
    }).filter(s=>Math.abs(s.lane)-s.halfWidth<10.1||Math.abs(s.lane+s.lateral*.8)-s.halfWidth<9.7);
    const live=new Set(traffic.map(s=>s.car));for(const car of this.stationary.keys())if(!live.has(car))this.stationary.delete(car);
    for(const car of this.sluggish.keys())if(!live.has(car))this.sluggish.delete(car);
    const rearClear=seen.every(s=>s.gap>=0||Math.abs(s.lane-from)>s.halfWidth+1.8||-s.gap>11+Math.max(0,s.forward)*1.2);
    const forward=this.track.tangent(origin),headingDifference=car.heading-Math.atan2(forward.x,forward.z);
    const reverseSafe=rearClear&&Math.abs(from-Math.sin(headingDifference)*4.5)<7.1;
    const backRoute=(moving:boolean):TrafficRoute=>({mode:moving?'backout':'wait',speed:0,target:this.commitment?.target,laneAt:()=>from,point:t=>this.track.point(t).addScaledVector(this.track.normal(t),from)});
    if(this.backing){
      if(car.distance>this.backing.distance&&time<this.backing.until){this.mode=reverseSafe?'backout':'wait';return backRoute(reverseSafe);}
      this.backing=undefined;this.commitment=undefined;
    }
    if(car.speed<-.025){this.mode='wait';return backRoute(false);}
    const obstructs=(s:Seen)=>{
      const intended=this.reference.point(s.sample.progress).sub(this.track.point(s.sample.progress)).dot(this.track.normal(s.sample.progress));
      return Math.min(Math.abs(s.lane-from),Math.abs(s.lane-intended),Math.abs(s.lane+s.lateral*.7-from))<s.halfWidth+1.5;
    };
    const front=seen.filter(s=>s.gap>-3&&s.gap<Math.min(95,35+car.speed*1.4)&&obstructs(s))
      .sort((a,b)=>a.gap-b.gap)[0];
    this.blockedTime=front&&car.speed<front.forward+2&&desiredSpeed>front.forward+5?this.blockedTime+dt:0;
    let committed=this.commitment&&seen.find(s=>s.sample.car===this.commitment!.target);
    if(this.commitment?.hazard&&committed&&!committed.hazard&&committed.forward>8)this.commitment.hazard=false;
    if(this.commitment&&!this.commitment.hazard&&time>this.commitment.until&&committed&&committed.gap>8){
      this.commitment=undefined;committed=undefined;this.mergeUntil=time+2;this.retryAfter=time+2+this.caution;
    }
    if(this.commitment&&(!committed||committed.gap<-13)){
      if(committed){if(this.commitment.hazard)this.obstaclesPassed++;else this.passes++;}
      this.commitment=undefined;committed=undefined;this.mergeUntil=time+3;
    }
    const obstacle=seen.filter(s=>s.hazard&&s.gap>-5&&s.gap<Math.min(95,35+car.speed*1.6)).sort((a,b)=>a.gap-b.gap)[0];
    const opportunity=racing&&time>this.retryAfter&&front&&front.gap>9&&car.speed>12&&desiredSpeed>front.forward+4&&
      (expectedAt?.(front.sample.progress)??desiredSpeed)>front.forward+4&&
      (car.speed-front.forward>1.8||this.blockedTime>.9)&&Math.abs(car.lateralSpeed)<3&&car.gripUsage<1.05?front:undefined;
    const target=committed??obstacle??opportunity;
    const merging=!target&&time<this.mergeUntil;
    if(!target&&!merging){this.mode='clear';return null;}
    const hazard=!!target?.hazard||!!this.commitment?.hazard;
    const tightObstacle=hazard&&target&&this.track.tangent(target.sample.progress-12/length).angleTo(this.track.tangent(target.sample.progress+12/length))>.6;
    const exitExists=!target||[-6.8,-4.5,0,4.5,6.8].some(lane=>seen.every(s=>s.gap<-5||s.gap>target.gap+10||Math.abs(lane-s.lane)>s.halfWidth+1.8));
    if(hazard&&target&&target.gap>0&&target.gap<12&&car.speed<.3&&Math.abs(from-target.lane)<target.halfWidth+1.8){
      if(target.forward<1&&reverseSafe&&exitExists){this.backing={distance:car.distance-4.5/length,until:time+5};this.recoveries++;this.mode='backout';return backRoute(true);}
      this.mode='wait';return backRoute(false);
    }
    const transition=merging?Math.max(24,car.speed):Math.min(Math.max(16,12+car.speed*.8),Math.max(5,(target?.gap??40)-7));
    const referenceLane=(t:number)=>this.reference.point(t).sub(this.track.point(t)).dot(this.track.normal(t));
    const progressScale=(point:(t:number)=>THREE.Vector3,t:number)=>Math.max(.25,point(t+3/length).distanceTo(point(t-3/length))/6);
    const targetScale=target?progressScale(t=>this.track.point(t).addScaledVector(this.track.normal(t),target.lane),target.sample.progress):1;
    const makeRoute=(goal:number,merge=false)=>{
      const laneAt=(progress:number)=>THREE.MathUtils.clamp(merge?referenceLane(progress):goal,-7.1,7.1);
      const point=(progress:number)=>this.track.point(progress).addScaledVector(this.track.normal(progress),laneAt(progress));
      return {laneAt,point};
    };
    const goals=merging?[referenceLane(origin+40/length),from]:[
      this.commitment?.lane??from,from,-6.8,-4.5,-2.25,0,2.25,4.5,6.8,
      target!.lane-target!.halfWidth-1.8-this.character.caution*.2,target!.lane+target!.halfWidth+1.8+this.character.caution*.2
    ].map(n=>THREE.MathUtils.clamp(n,-7.1,7.1));
    let best:{lane:number;speed:number;score:number;route:ReturnType<typeof makeRoute>}|undefined;
    for(const goal of [...new Set(goals.map(n=>Math.round(n*20)/20))]){
      // Do not aim back through the vehicle being passed. A time-based sweep
      // alone can look clear while the steering target already crosses it.
      if(target&&Math.abs(goal-target.lane)<target.halfWidth+(hazard?3:1.8))continue;
      if(seen.some(s=>Math.abs(s.gap)<10+Math.max(0,s.forward-car.speed)*.5&&Math.abs(s.lane-from)>1.2&&
        (s.lane-from)*(goal-from)>0&&Math.abs(goal-from)>Math.abs(s.lane-from)-s.halfWidth-1.2))continue;
      const rejoining=merging&&Math.abs(goal-from)>.1;
      const route=makeRoute(goal,rejoining);
      const lookahead=tightObstacle?4:hazard?THREE.MathUtils.clamp(5+car.speed*.1,6,10):THREE.MathUtils.clamp(7+car.speed*.3,9,26);
      const travel=Math.max(12,lookahead*1.8);
      const predictedLane=(d:number)=>THREE.MathUtils.lerp(from,route.laneAt(origin+d/length),THREE.MathUtils.smoothstep(d,0,travel));
      const predictedPoint=(d:number)=>this.track.point(origin+d/length).addScaledVector(this.track.normal(origin+d/length),predictedLane(d));
      let speed=Math.min(desiredSpeed,hazard?32:merging?94:Math.min(94,car.speed+3)),blocked=false;
      if(tightObstacle)speed=Math.min(speed,Math.sqrt(3.5**2+2*brakingDeceleration(car.speed,false,car.gripScale)*.65*Math.max(0,target!.gap-18)));
      const aim=route.point(origin+lookahead/length).sub(car.position),heading=Math.atan2(aim.x,aim.z)-car.heading;
      const pursuit=2*Math.abs(Math.sin(heading))/Math.max(5,aim.length());
      speed=Math.min(speed,cornerSpeed(pursuit/(car.gripScale*.8),94));
      // Actual curvature of the candidate, including its lateral transition.
      // Extend validation toward the expected passing distance (up to 300m),
      // rather than checking only the first 100m before a nearby corner.
      const passHorizon=hazard||merging?105:Math.min(300,Math.max(105,speed*((target!.gap+14)/Math.max(1,speed-target!.forward)+Math.abs(goal-from)/(2+this.character.aggression*1.5))));
      const samples=[4,12,24,36,48,60,78,96,...passHorizon>105?[120,150,190,240,300]:[],...target?[target.gap-6,target.gap,target.gap+6]:[]].filter(d=>d>0&&d<=passHorizon);
      for(const d of samples){
        const t=origin+d/length,a=route.point(t-3/length),b=route.point(t),c=route.point(t+3/length);
        const curvature=2*Math.abs((b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x))/Math.max(.001,a.distanceTo(b)*b.distanceTo(c)*c.distanceTo(a));
        const angle=Math.atan(curvature*HANDLING.wheelbase);
        // This corridor ends once the opponent is cleared. A later corner is
        // driven on the rejoin plan, not by holding this lateral offset forever.
        if(angle>.425&&d>transition+5&&!merging&&(!hazard||!target||d<target.gap+10)){blocked=true;break;}
        const steeringSpeed=angle<.001?94:Math.max(2,(.43/angle-1)/.025*.92);
        const limit=Math.min(steeringSpeed,cornerSpeed(curvature/(car.gripScale*.8),94))*(this.track.aiControlMargin?.(t)??1);
        speed=Math.min(speed,Math.sqrt(limit*limit+2*brakingDeceleration(limit,false,car.gripScale)*.7*Math.max(0,d-car.speed*.15)));
      }
      // Score the speed we can actually drive. Otherwise a corridor whose
      // theoretical speed is high can keep winning while low-speed escape
      // control repeatedly steers away from the previously chosen corridor.
      if(hazard&&target&&target.gap<15&&Math.abs(from-target.lane)<target.halfWidth+1.8)speed=Math.min(speed,Math.abs(from-target.lane)>1.3?2.5:1.3);
      const probe=Math.max(6,Math.min(Math.max(car.speed,speed),hazard?45:87)),horizon=Math.max(40,Math.min(105,(target?.gap??30)+24));
      for(const other of seen){
        const closing=probe-other.forward,catchDistance=Math.abs(closing)>.2?other.gap*probe/closing:Infinity;
        for(const d of [0,8,16,28,45,65,90,catchDistance]){
          if(d<0||d>horizon)continue;
          const seconds=d/probe,forwardGap=other.gap+other.forward*seconds-d;
          const lateral=other.lane+other.lateral*Math.min(.8,seconds);
          const longitudinal=2.6+other.halfLength+Math.max(0,probe-other.forward)*.035;
          if(Math.abs(forwardGap)<longitudinal&&Math.abs(predictedLane(d)-lateral)<other.halfWidth+1.45+Math.min(.6,Math.abs(other.lateral)*.15)){
            const own=d===0?car.position:predictedPoint(d),near=predictedPoint(d+.6).sub(predictedPoint(Math.max(0,d-.6)));
            const ownHeading=d===0?car.heading:Math.atan2(near.x,near.z),otherProgress=other.sample.progress+other.forward*seconds/length;
            const position=Math.abs(other.forward)<3?other.sample.position.clone().addScaledVector(other.sample.velocity??other.sample.car.velocity,Math.min(.8,seconds)):
              this.track.point(otherProgress).addScaledVector(this.track.normal(otherProgress),lateral);
            const f=this.track.tangent(otherProgress),startF=this.track.tangent(other.sample.progress);
            const otherHeading=(other.sample.heading??other.sample.car.heading)+(Math.abs(other.forward)>3?Math.atan2(f.x,f.z)-Math.atan2(startF.x,startF.z):0);
            let distance=Infinity;
            for(const a of [-1.45,0,1.45])for(const b of [-1.45,0,1.45]){
              const dx=own.x+Math.sin(ownHeading)*a-position.x-Math.sin(otherHeading)*b;
              const dz=own.z+Math.cos(ownHeading)*a-position.z-Math.cos(otherHeading)*b;
              distance=Math.min(distance,dx*dx+dz*dz);
            }
            const margin=.025+(hazard?.65+this.caution*.15:.7+this.caution*.3)*THREE.MathUtils.smoothstep(d,0,8);
            if(distance<(2.15+margin)**2){blocked=true;break;}
          }
        }
        if(blocked)break;
      }
      // On a bend an outside corridor travels farther for the same track
      // progress. Compare progress rates, not just speed against the rival's
      // centreline projection, or a slower outside pass can look profitable.
      const ownRate=speed/progressScale(route.point,target?.sample.progress??origin),targetRate=(target?.forward??0)/targetScale;
      const passingTime=((target?.gap??0)+14)/Math.max(.1,ownRate-targetRate)+Math.abs(goal-from)/(2+this.character.aggression*1.5);
      if(blocked||!hazard&&!merging&&(speed<12||ownRate<targetRate+1.2||!this.commitment&&passingTime>2+this.character.aggression*2))continue;
      const c=this.character,sidePreference=Math.sin(c.phase*1.7+c.lineBias)*.2;
      const switchCost=this.commitment&&Math.abs(goal-this.commitment.lane)>1.5?2+c.caution*2:0;
      const score=speed*(.24+c.aggression*.12)-Math.abs(goal-from)*(.45+c.caution*.3)-switchCost+goal*sidePreference+(rejoining?3:0)+(hazard&&this.commitment&&Math.abs(goal-this.commitment.lane)<.3?10:0);
      if(!best||score>best.score)best={lane:goal,speed,score,route};
    }
    if(!best){
      if(!hazard&&!this.commitment&&!merging){this.mode='clear';return null;}
      this.mode='wait';
      if(hazard&&target&&target.forward<1&&target.gap>0&&target.gap<11&&car.speed<.3&&this.blockedTime>.6&&reverseSafe&&exitExists){
        this.backing={distance:car.distance-4.5/length,until:time+5};this.recoveries++;this.mode='backout';return backRoute(true);
      }
      const blocker=seen.filter(s=>s.gap>-5&&Math.abs(s.lane-from)<s.halfWidth+1.5).sort((a,b)=>a.gap-b.gap)[0]??target;
      const route=makeRoute(from),gap=Math.max(0,(blocker?.gap??0)-8);
      // With moving traffic and no viable passing corridor, preserve the
      // driver's calibrated curved steering path. A constant road offset is
      // useful for a stopped obstacle, but can cut through a linked apex.
      return {mode:'wait',holdLane:hazard,longitudinalOnly:!hazard,target:blocker?.sample.car,lookahead:tightObstacle?4:hazard?6:undefined,speed:Math.max(0,Math.min(desiredSpeed,(blocker?.forward??0)+gap*.35)),...route};
    }
    this.mode=merging?'merge':hazard?'avoid':'attack';
    if(target){
      if(!this.commitment||this.commitment.target!==target.sample.car||Math.abs(this.commitment.lane-best.lane)>1.5)this.routesChosen++;
      const deadline=this.commitment?.target===target.sample.car?this.commitment.until:time+4+this.character.aggression*4;
      this.commitment={target:target.sample.car,lane:best.lane,hazard,until:deadline};
    }
    const closeEscape=hazard&&target&&target.gap<15&&Math.abs(from-target.lane)<target.halfWidth+1.8;
    const crawl=target&&Math.abs(from-target.lane)>1.3?2.5:1.3;
    return {mode:this.mode,target:target?.sample.car,speed:closeEscape?Math.min(best.speed,crawl):best.speed,
      holdLane:merging&&Math.abs(best.lane-from)<=.1,
      lookahead:tightObstacle?4:hazard?THREE.MathUtils.clamp(5+car.speed*.1,6,10):undefined,...best.route};
  }
}
