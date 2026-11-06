import {MathUtils} from 'three';
/** Per-entrant difficulty calibration from sustained physical gap movement.
 * Only driving pace targets change; the car's engine, speed cap and race
 * progress are untouched. A broad free battle zone permits real overtakes. */
export class PaceControl {
  private previousGap?:number;private age=0;private rate=0;private trim=0;
  reset(){this.previousGap=undefined;this.age=this.rate=this.trim=0;}
  update(base:number,gap:number,dt:number,enabled:boolean){
    if(!enabled||!Number.isFinite(gap)||dt<=0){this.previousGap=undefined;this.rate=0;return base;}
    if(this.previousGap!==undefined&&Math.abs(gap-this.previousGap)>Math.max(25,dt*180))this.reset();
    const rate=this.previousGap===undefined?0:(gap-this.previousGap)/dt;this.previousGap=gap;this.age+=dt;
    this.rate=MathUtils.damp(this.rate,rate,.25,dt);
    const weight=MathUtils.smoothstep(Math.abs(gap),70,300),direction=Math.sign(gap);
    // Help an escaping leader become attainable, or a losing pursuer close.
    // Already-closing gaps must never earn a leader more pace or
    // penalize a trailing car before it has actually reached the battle.
    this.trim=direction>0?Math.min(0,this.trim):Math.max(0,this.trim);
    const error=this.rate+direction*1.5*weight;
    const divergence=direction>0?Math.max(0,error):Math.min(0,error);
    if(this.age>6)this.trim=MathUtils.clamp(this.trim-divergence*.0025*dt*weight,-.22,.14);
    if(Math.abs(gap)<45)this.trim=MathUtils.damp(this.trim,0,.025,dt);
    const pressure=-direction*.035*weight*MathUtils.smoothstep(this.age,0,3);
    return MathUtils.clamp(base+this.trim+pressure,.65,1.47);
  }
}
