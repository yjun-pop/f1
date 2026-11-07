import {readBest,writeBest,recordOwner} from './RecordStore';
import * as THREE from 'three';
import {Track} from './Track';
import {Vehicle,resolveCollision} from './Vehicle';
import {LinePlanner} from './LinePlanner';
import {brakingDeceleration} from './Dynamics';
import {DriverAgent,observeTraffic} from './DriverAgent';
import {PackDirector} from './PackDirector';
import {StartSequence,type StartSignal} from './StartSequence';
import {DEFAULT_FIELD_SIZE,DRIVER_PROFILES} from './RaceRoster';
import {RaceTiming} from './RaceTiming';
import {RaceLaps} from './RaceLaps';
export {formatTime} from './RaceLaps';
import {AISpeedPlanner} from './AISpeedPlanner';
import {CornerPaceObserver} from './CornerPaceObserver';
import {RaceAerodynamics} from './Aerodynamics';
import {gridSlot} from './StartingGrid';
import {Opponent,type Rival} from './Opponent';
export type {Rival} from './Opponent';
export class Race {
  private readonly recordUser=recordOwner();
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
  readonly timing:RaceTiming;readonly laps:RaceLaps;bestAtStart=0;private player?:Vehicle;
  readonly opponents:Opponent[]=[];
  get fieldSize(){return this.opponents.length+1;}
  private timingSamples(player:Vehicle){return [{id:'PLAYER',name:'PLAYER',distance:player.distance},...this.opponents.map(o=>({id:o.name,name:o.name,distance:o.car.distance}))];}
  get intervals(){return this.player?this.timing.neighbours(this.timingSamples(this.player),'PLAYER',this.elapsed):{ahead:null,behind:null};}
  private lapSamples(player:Vehicle){return [{id:'PLAYER',name:'YOU',distance:player.distance},...this.opponents.map(o=>({id:o.id,name:o.name,distance:o.car.distance}))];}
  get classification(){return this.player?this.laps.standings(this.lapSamples(this.player),this.elapsed):[];}
  private gridPlayer?:Vehicle;
  constructor(private track:Track,scene:THREE.Scene,private planner:LinePlanner,options:{opponentCount?:number;player?:Vehicle}={}){
    this.gridPlayer=options.player;
    this.timing=new RaceTiming(track.length);this.laps=new RaceLaps(track.length);this.aerodynamics=new RaceAerodynamics(track,planner);track.details.addDRSBoards(track,this.aerodynamics.zones);
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
    profiles.forEach((profile,i)=>this.opponents.push(new Opponent(profile,i,track,scene,planner,this.aiSpeeds,this.speedPlanner)));this.reset();
    this.best=readBest(this.storageKey,this.recordUser);this.bestAtStart=this.best;
  }
  reset(){this.laps.reset();this.bestAtStart=this.best;this.aerodynamics.reset();this.aeroPreparedAt=-Infinity;this.contacts.clear();this.pack.reset();this.cornerObserver.reset();this.startSequence.reset();this.timing.reset();this.player=undefined;this.state='ready';this.countdown=0;this.elapsed=0;this.lapTime=0;this.lapStart=0;this.lastLap=0;this.completed=0;this.position=this.fieldSize;
    // Bind the playable car before arming the start so paint, poses and timing
    // share one standing grid. Unbound simulations can stage their own field.
    if(this.gridPlayer){const slot=gridSlot(this.fieldSize);this.gridPlayer.reset();this.gridPlayer.resetAt(slot.meters/this.track.length,slot.lane);this.player=this.gridPlayer;}
    this.opponents.forEach((o,i)=>o.reset(this.gridPlayer?gridSlot(i+1):{meters:15+(this.opponents.length-1-i)*12,lane:i%2?3:-3},i+1));}

  start(){if(this.state==='ready'){this.bestAtStart=this.best;this.startSequence.arm();this.countdown=this.startSequence.remaining;this.state='countdown';}}
  private balanceRivals(player:Vehicle,dt:number){
    const normal=this.track.normal(player.progress);
    const heldUp=this.opponents.some(o=>{
      let gap=o.car.progress-player.progress;if(gap<-.5)gap++;if(gap>.5)gap--;gap*=this.track.length;
      const dx=o.car.position.x-player.position.x,dz=o.car.position.z-player.position.z;
      return gap>0&&gap<45&&Math.abs(dx*normal.x+dz*normal.z)<3.5&&player.speed<o.car.speed+6;
    });
    const corner=this.cornerObserver.sample(player,dt,!heldUp);if(corner)this.pack.recordCorner(corner.speed,corner.reference);
    const sample=((player.progress%1+1)%1)*this.aiSpeeds.length,index=Math.floor(sample);
    const referenceSpeed=THREE.MathUtils.lerp(this.aiSpeeds[index],this.aiSpeeds[(index+1)%this.aiSpeeds.length],sample-index);
    this.pack.observe(player,referenceSpeed,player.position.distanceToSquared(this.track.point(player.progress))<18*18,dt,heldUp);
    // Snapshot standings once, using total race distance across lap seams.
    const order:{distance:number;rival:Rival|null}[]=[{distance:player.distance,rival:null},...this.opponents.map(rival=>({distance:rival.car.distance,rival}))];
    order.sort((a,b)=>b.distance-a.distance);
    this.position=order.findIndex(entry=>entry.rival===null)+1;
    order.forEach((entry,i)=>{if(entry.rival)entry.rival.rank=i+1;});
    for(const o of this.opponents){
      const gap=(o.car.distance-player.distance)*this.track.length;
      // Difficulty may follow demonstrated player skill; tactical urgency is
      // owned by each driver's win objective, never a rotating attack slot.
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
      const clean=this.pack.active&&this.elapsed>12&&!player.offRoad&&!o.car.offRoad&&player.speed>12&&o.car.speed>8;
      targetPace=o.paceControl.update(targetPace,gap,dt,clean);
      o.setDifficulty({pace:targetPace,cap:targetCap,power:targetPower},this.elapsed,dt);
    }
  }
  private agentFor(o:Rival){
    // Reference controllers can also be run outside the registered field.
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
      o.onContact(o.car===a?b:a,impact,this.elapsed);
    }
  }
  update(dt:number,player:Vehicle){
    this.player=player;
    if(this.state==='countdown'){this.startSequence.advance(dt);this.countdown=this.startSequence.remaining;if(this.startSequence.signal.phase==='go'){this.state='racing';this.laps.reset(this.lapSamples(player),0);this.timing.update(this.timingSamples(player),0);}return;}
    if(this.state!=='racing')return;
    if(!this.laps.started)this.laps.reset(this.lapSamples(player),this.elapsed);
    if(this.aeroPreparedAt!==this.elapsed)this.prepareAerodynamics(player);this.aeroPreparedAt=-Infinity;
    this.elapsed+=dt;this.lapTime=this.elapsed-this.lapStart;
    const done=Math.floor(player.distance+1e-6);
    if(done>this.completed){this.laps.update([{id:'PLAYER',name:'YOU',distance:player.distance}],this.elapsed);const recorded=this.laps.lap('PLAYER',done);this.lastLap=recorded?.seconds??this.lapTime;this.pack.recordLap(this.lastLap*88/(this.track.circuit?.referenceLap??88),this.completed===0);if(!this.best||this.lastLap<this.best){this.best=this.lastLap;writeBest(this.storageKey,this.best,this.recordUser);}
      this.completed=done;this.lapStart=recorded?.elapsed??this.elapsed;this.lapTime=this.elapsed-this.lapStart;if(done>=3){this.laps.update(this.lapSamples(player),this.elapsed);this.position=this.classification.find(row=>row.id==='PLAYER')?.position??this.position;this.timing.update(this.timingSamples(player),this.elapsed);this.state='finished';this.aerodynamics.reset();return;}}
    this.balanceRivals(player,dt);
    // All drivers observe the same instant, before any car advances.
    const observation=observeTraffic([player,...this.opponents.map(o=>o.car)]);
    const frame={elapsed:this.elapsed,playerPosition:this.position,fieldSize:this.fieldSize,traffic:observation};
    // Decide the whole frame before moving any car. Each opponent owns its
    // reaction clock, controls and recovery; array order grants no priority.
    for(const opponent of this.opponents)opponent.plan(dt,frame);
    for(const opponent of this.opponents)opponent.advance(dt);
    const cars=[player,...this.opponents.map(o=>o.car)];
    for(let a=0;a<cars.length;a++)for(let b=a+1;b<cars.length;b++){
      // Capsule contacts cannot reach six metres. Avoid velocity/allocation
      // work for the other pairs in a larger grid.
      if(cars[a].position.distanceToSquared(cars[b].position)>36)continue;
      const impact=cars[a].velocity.sub(cars[b].velocity).length();
      if(resolveCollision(cars[a],cars[b])){
        const left=a===0?'player':this.opponents[a-1].id,right=this.opponents[b-1].id;
        this.scoreContact(cars[a],cars[b],left<right?`${left}|${right}`:`${right}|${left}`,impact);
      }
    }
    for(const [key,time] of this.contacts)if(this.elapsed-time>.6)this.contacts.delete(key);
    this.position=1+this.opponents.filter(o=>o.distance>player.distance).length;
    this.timing.update(this.timingSamples(player),this.elapsed);
    this.laps.update(this.lapSamples(player),this.elapsed);
  }
}
