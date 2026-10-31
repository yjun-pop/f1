import type {WheelDevice} from './WheelInput';
import type {DrivingFeedbackFrame} from './DrivingFeedback';

const clamp=(v:number)=>Number.isFinite(v)?Math.max(0,Math.min(1,v)):0;
export interface NativeRumble {
  type?:string;effects?:readonly string[];
  playEffect(type:'dual-rumble',parameters:{duration:number;startDelay:number;strongMagnitude:number;weakMagnitude:number}):Promise<unknown>;
  reset():Promise<unknown>;
}
/** Serialize writes, coalesce stale effects and always send a stop after the
 * last short lease. No effect is resumed after an output error. */
export class RumbleOutput {
  error='';private pending?:{strong:number;weak:number;duration:number};private work?:Promise<void>;
  private timer?:ReturnType<typeof setTimeout>;private running=false;
  constructor(readonly kind:'usb'|'native',private write:(strong:number,weak:number,duration:number)=>Promise<unknown>,private connected=()=>true){}
  get available(){return !this.error&&this.connected();}
  play(strong:number,weak:number,duration=160){
    if(!this.available)return Promise.resolve();
    strong=clamp(strong);weak=clamp(weak);duration=Number.isFinite(duration)?Math.max(1,Math.min(250,duration)):160;
    if(!strong&&!weak)return this.stop();
    clearTimeout(this.timer);this.timer=setTimeout(()=>void this.stop(),duration);
    this.pending={strong,weak,duration};return this.flush();
  }
  stop(){
    clearTimeout(this.timer);this.timer=undefined;
    if(!this.running&&!this.pending)return this.work??Promise.resolve();
    this.pending={strong:0,weak:0,duration:0};return this.flush();
  }
  private flush():Promise<void>{
    if(this.work)return this.work;
    this.work=(async()=>{
      while(this.pending){
        const effect=this.pending;this.pending=undefined;
        if(!this.connected()){this.running=false;continue;}
        this.running=!!(effect.strong||effect.weak);
        try{const result=await this.write(effect.strong,effect.weak,effect.duration);if(result==='not-supported')throw new Error('이 장치가 진동 효과를 지원하지 않습니다.');}
        catch(error){
          this.error=error instanceof Error?error.message:String(error);clearTimeout(this.timer);this.timer=undefined;this.pending=undefined;
          // A previously accepted effect may still be active. One best-effort
          // neutral packet is allowed; input remains available on output error.
          if(this.running&&this.connected())try{await this.write(0,0,0);}catch{}
          this.running=false;
        }
      }
    })().finally(()=>{this.work=undefined;if(this.pending)return this.flush();});return this.work;
  }
}
const nativeOutputs=new WeakMap<NativeRumble,RumbleOutput>();
export function rumbleFor(device:WheelDevice|undefined):RumbleOutput|undefined{
  if(!device||device.connected===false||device.inputsReady===false)return;
  if(device.rumble)return device.rumble;
  const actuator=device.vibrationActuator;
  if(!actuator||typeof actuator.playEffect!=='function'||typeof actuator.reset!=='function'||!(actuator.effects?.includes('dual-rumble')||actuator.type==='dual-rumble'))return;
  let output=nativeOutputs.get(actuator);
  if(!output){output=new RumbleOutput('native',(strong,weak,duration)=>strong||weak?actuator.playEffect('dual-rumble',{duration,startDelay:0,strongMagnitude:strong,weakMagnitude:weak}):actuator.reset(),()=>device.connected!==false);nativeOutputs.set(actuator,output);}
  return output;
}
export interface HapticTelemetry {
  speed:number;distance:number;lateralSpeed:number;brake:number;offRoad:boolean;impactSerial:number;impactStrength:number;
}
/** Physical vibration is independent of camera motion and audio volume. */
export class WheelHaptics {
  strength=.6;private output?:RumbleOutput;private clock=0;private sentAt=-Infinity;
  private gear?:number;private impactSerial?:number;private shift=0;private impact=0;
  constructor(){
    try{const saved=localStorage.getItem('apex-wheel-rumble');if(saved!==null)this.strength=clamp(Number(saved));}catch{}
    if(typeof window!=='undefined'){window.addEventListener?.('blur',()=>this.stop());window.addEventListener?.('pagehide',()=>this.stop());}
    if(typeof document!=='undefined')document.addEventListener?.('visibilitychange',()=>{if(document.hidden)this.stop();});
  }
  setStrength(value:number){this.strength=clamp(value);try{localStorage.setItem('apex-wheel-rumble',String(this.strength));}catch{}if(!this.strength)this.stop();}
  canRumble(device:WheelDevice|undefined){return !!rumbleFor(device)?.available;}
  status(device:WheelDevice|undefined){const output=rumbleFor(device);return output?.error?`진동 출력 오류: ${output.error}`:output?.available?`${output.kind==='usb'?'Wired Wheel':'브라우저'} 진동 출력 사용 가능`:'선택한 장치에서 지원되는 진동 출력을 찾지 못했습니다.';}
  stop(){void this.output?.stop();this.output=undefined;this.gear=this.impactSerial=undefined;this.shift=this.impact=0;this.sentAt=-Infinity;}
  async test(device:WheelDevice|undefined){
    this.stop();const output=rumbleFor(device);if(!output?.available)throw new Error(this.status(device));
    if(!this.strength)throw new Error('진동 강도를 먼저 올려주세요.');
    this.output=output;await output.play(.65*this.strength,.45*this.strength,220);if(output.error)throw new Error(output.error);
  }
  update(device:WheelDevice|undefined,car:HapticTelemetry,feedback:DrivingFeedbackFrame,dt:number,active:boolean){
    const output=rumbleFor(device);
    if(!active||!output?.available||!this.strength){if(this.output)this.stop();return;}
    if(output!==this.output){this.stop();this.output=output;}
    dt=Math.max(0,Math.min(.1,dt));this.clock+=dt;
    this.shift*=Math.exp(-dt*22);this.impact*=Math.exp(-dt*12);
    const changedGear=this.gear!==undefined&&feedback.engine.gear!==this.gear;
    const contact=this.impactSerial!==undefined&&car.impactSerial!==this.impactSerial;
    if(changedGear)this.shift=.55;if(contact)this.impact=Math.max(this.impact,clamp(car.impactStrength/12)*.85);
    this.gear=feedback.engine.gear;this.impactSerial=car.impactSerial;
    // At most 20 continuous updates/s; short shift/contact events go out now.
    if(this.clock-this.sentAt<.05&&!changedGear&&!contact)return;
    this.sentAt=this.clock;
    const moving=clamp(car.speed/12),slip=clamp((Math.abs(Math.atan2(car.lateralSpeed,Math.max(8,car.speed)))-.035)/.12);
    const strong=Math.min(.9,this.shift+this.impact+feedback.kerb*.4*moving+slip*.25*moving+(car.offRoad?.14*moving:0));
    const weak=Math.min(.85,this.shift*.5+this.impact*.6+feedback.kerb*.55*moving+slip*.3*moving+(.02+feedback.engine.load*.045)*moving);
    void output.play(strong*this.strength,weak*this.strength);
  }
}
