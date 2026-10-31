import {HIDWheel} from './HIDWheel';
import {USBWheel} from './USBWheel';
export interface WheelDevice {id:string;displayName?:string;index:number;connected:boolean;mapping:string;axes:readonly number[];buttons:readonly {pressed:boolean;value:number;touched?:boolean}[];source?:'hid'|'usb';inputsReady?:boolean}
export const WHEEL_STORAGE_KEY='apex-wheel-profile-v1';
export const WHEEL_ACTIONS=['shiftDown','shiftUp','boost','drs','pause','camera'] as const;
export type WheelAction=typeof WHEEL_ACTIONS[number];
export interface PedalBinding {source:'axis'|'button';index:number;rest:number;full:number}
export interface WheelProfile {
  version:1;deviceId:string;pedalDeviceId:string;enabled:boolean;
  deviceIndex?:number;pedalIndex?:number;
  steering:{axis:number;center:number;left:number;right:number};
  throttle:PedalBinding;brake:PedalBinding;
  buttons:Record<WheelAction,number|null>;deadzone:number;sensitivity:number;
}
export interface WheelControls {steer:number;throttle:number;brake:number;boost:boolean;keyboard:false}
export interface WheelStorage {getItem(key:string):string|null;setItem(key:string,value:string):void}
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
const endpoint=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1.001;
const axisIndex=(v:unknown):v is number=>Number.isInteger(v)&&Number(v)>=0&&Number(v)<64;
export function validWheelProfile(value:unknown):value is WheelProfile {
  if(!value||typeof value!=='object')return false;const p=value as WheelProfile,s=p.steering;
  if(p.version!==1||typeof p.enabled!=='boolean'||typeof p.deviceId!=='string'||!p.deviceId||p.deviceId.length>1024||typeof p.pedalDeviceId!=='string'||!p.pedalDeviceId||p.pedalDeviceId.length>1024)return false;
  if([p.deviceIndex,p.pedalIndex].some(v=>v!==undefined&&(!Number.isInteger(v)||v<0||v>31)))return false;
  if(!s||!axisIndex(s.axis)||![s.center,s.left,s.right].every(endpoint)||(s.left-s.center)*(s.right-s.center)>=0||Math.min(Math.abs(s.left-s.center),Math.abs(s.right-s.center))<.15)return false;
  const sameDevice=p.deviceId===p.pedalDeviceId&&(p.deviceIndex??0)===(p.pedalIndex??0);
  for(const pedal of [p.throttle,p.brake])if(!pedal||!['axis','button'].includes(pedal.source)||!Number.isInteger(pedal.index)||pedal.index<0||pedal.index>=(pedal.source==='axis'?64:128)||!endpoint(pedal.rest)||!endpoint(pedal.full)||pedal.source==='button'&&Math.min(pedal.rest,pedal.full)<0||Math.abs(pedal.full-pedal.rest)<.15||sameDevice&&pedal.source==='axis'&&pedal.index===s.axis)return false;
  if(p.throttle.source===p.brake.source&&p.throttle.index===p.brake.index&&(Math.sign(p.throttle.full-p.throttle.rest)===Math.sign(p.brake.full-p.brake.rest)||Math.abs(p.throttle.rest-p.brake.rest)>.001))return false;
  if(!p.buttons||!WHEEL_ACTIONS.every(action=>p.buttons[action]===null||Number.isInteger(p.buttons[action])&&Number(p.buttons[action])>=0&&Number(p.buttons[action])<128))return false;
  const buttons=Object.values(p.buttons).filter(v=>v!==null);if(new Set(buttons).size!==buttons.length)return false;
  if(sameDevice&&[p.throttle,p.brake].some(pedal=>pedal.source==='button'&&buttons.includes(pedal.index)))return false;
  return Number.isFinite(p.deadzone)&&p.deadzone>=0&&p.deadzone<=.15&&Number.isFinite(p.sensitivity)&&p.sensitivity>=.5&&p.sensitivity<=2;
}
export function pedalValue(raw:number,binding:PedalBinding){return Number.isFinite(raw)?clamp((raw-binding.rest)/(binding.full-binding.rest),0,1):0;}
export function pedalRaw(pad:WheelDevice,binding:PedalBinding){return binding.source==='axis'?pad.axes[binding.index]:pad.buttons[binding.index]?.value;}
export function steeringValue(raw:number,profile:WheelProfile){
  if(!Number.isFinite(raw))return 0;
  const s=profile.steering,delta=raw-s.center,left=delta*(s.left-s.center)>=0;
  const normalized=clamp(Math.abs(delta/(left?s.left-s.center:s.right-s.center))*profile.sensitivity,0,1);
  return normalized<=profile.deadzone?0:(left?1:-1)*(normalized-profile.deadzone)/(1-profile.deadzone);
}
export function changedAxis(rest:readonly number[],full:readonly number[],exclude=-1,limit=64){
  let axis=-1,change=.15;for(let i=0;i<Math.min(rest.length,full.length,limit);i++)if(i!==exclude&&endpoint(rest[i])&&endpoint(full[i])&&Math.abs(full[i]-rest[i])>change){axis=i;change=Math.abs(full[i]-rest[i]);}return axis;
}
export function changedPedal(restAxes:readonly number[],fullAxes:readonly number[],restButtons:readonly number[],fullButtons:readonly number[],exclude=-1):PedalBinding|undefined {
  const axis=changedAxis(restAxes,fullAxes,exclude),button=changedAxis(restButtons,fullButtons,-1,128);
  if(axis>=0&&(button<0||Math.abs(fullAxes[axis]-restAxes[axis])>=Math.abs(fullButtons[button]-restButtons[button])))return {source:'axis',index:axis,rest:restAxes[axis],full:fullAxes[axis]};
  if(button>=0)return {source:'button',index:button,rest:restButtons[button],full:fullButtons[button]};
}
export function findWheelDevice(devices:readonly WheelDevice[],id:string,index?:number){const matches=devices.filter(p=>p.id===id);return matches.length>1?matches.find(p=>p.index===index):matches[0];}
const readBrowserPads=()=>{
  if(typeof navigator==='undefined'||!navigator.getGamepads){const error=new Error('Gamepad unavailable');error.name=globalThis.isSecureContext===false?'InsecureContextError':'NotSupportedError';throw error;}
  return Array.from(navigator.getGamepads());
};
const browserStorage:WheelStorage={getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value)};
/** Browser-local, calibrated analog input. Device identity survives slot changes;
 * a new connection must be neutral before it can supply driving controls. */
export class WheelInput {
  profile?:WheelProfile;devices:readonly WheelDevice[]=[];controls:WheelControls|null=null;
  supported=true;armed=false;connected=false;configuring=false;readErrorName='';private layoutChanged=false;
  private identity='';private held=new Set<number>();private pressed=new Set<WheelAction>();private waitingUSB=false;
  constructor(private readPads:()=>readonly(WheelDevice|null)[]=readBrowserPads,private storage:WheelStorage=browserStorage,readonly usb:HIDWheel|undefined=readPads===readBrowserPads?new HIDWheel():undefined,readonly rawUSB:USBWheel|undefined=readPads===readBrowserPads?new USBWheel():undefined){
    try{const saved=JSON.parse(storage.getItem(WHEEL_STORAGE_KEY)??'null');if(validWheelProfile(saved))this.profile=saved;}catch{}
    if(this.profile?.enabled&&(this.profile.deviceId.startsWith('webhid:')||this.profile.pedalDeviceId.startsWith('webhid:')))void this.usb?.restore();
    if(this.profile?.enabled&&(this.profile.deviceId.startsWith('webusb:')||this.profile.pedalDeviceId.startsWith('webusb:')))void this.rawUSB?.restore();
  }
  get status(){
    if(!this.supported)return this.detectionStatus;
    if(!this.profile?.enabled)return this.devices.length?'휠 설정에서 장치를 선택하고 입력을 보정하세요.':'키보드 주행 · 휠을 연결하고 장치 버튼을 한 번 눌러주세요.';
    if(this.layoutChanged)return '장치의 입력 구성이 바뀌었습니다. 휠 설정에서 다시 보정하세요.';
    if(this.waitingUSB)return 'USB 입력을 기다립니다. 휠·페달을 움직이고 패들 버튼을 한 번 눌러주세요.';
    if(!this.connected)return '휠 또는 페달 연결 해제 · 장치를 다시 연결하거나 키보드로 계속할 수 있습니다.';
    if(!this.armed)return '휠을 중앙에 놓고 페달·버튼을 모두 놓으면 입력이 활성화됩니다.';
    return `휠 주행 · ${this.profile.deviceId}`;
  }
  get detectionStatus(){
    if(this.devices.length)return `인식한 입력 장치 ${this.devices.length}개`;
    if(this.readErrorName==='SecurityError')return '브라우저가 게임패드 접근을 차단했습니다. 게임 주소를 Chrome·Edge의 일반 탭에서 직접 열어주세요.';
    if(this.readErrorName==='InsecureContextError')return '보안 연결이 필요합니다. HTTPS 게임 주소에서 다시 열어주세요.';
    if(!this.supported)return '이 브라우저에서 게임패드 입력을 읽을 수 없습니다. 외부 Chrome·Edge에서 게임 주소를 직접 열어주세요.';
    return this.devices.length?`브라우저가 인식한 입력 장치 ${this.devices.length}개`:'브라우저의 게임패드 목록이 비어 있습니다. 이 창을 클릭한 뒤 휠 버튼을 눌러주세요.';
  }
  save(profile:WheelProfile){
    if(!validWheelProfile(profile))throw new Error('조향·페달 범위 또는 버튼 중복을 확인하세요.');
    this.profile=JSON.parse(JSON.stringify(profile));this.identity='';this.suspend();
    try{this.storage.setItem(WHEEL_STORAGE_KEY,JSON.stringify(profile));return true;}catch{return false;}
  }
  suspend(){this.controls=null;this.armed=false;this.pressed.clear();}
  consume(action:WheelAction){const pressed=this.pressed.has(action);this.pressed.delete(action);return pressed;}
  down(action:WheelAction){const button=this.profile?.buttons[action];return this.armed&&button!==undefined&&button!==null&&this.held.has(button);}
  poll(){
    const previouslyConnected=this.connected;this.connected=false;this.controls=null;this.layoutChanged=false;this.waitingUSB=false;
    try{this.devices=this.readPads().filter((pad):pad is WheelDevice=>!!pad&&pad.connected!==false);this.supported=true;this.readErrorName='';}catch(error){this.devices=[];this.supported=false;const name=(error as {name?:unknown}|null)?.name;this.readErrorName=typeof name==='string'?name:'Error';}
    const direct=[...this.usb?.devices??[],...this.rawUSB?.devices??[]],used=new Set(this.devices.map(p=>p.index));
    for(const pad of direct){if(used.has(pad.index)){const free=Array.from({length:32},(_,i)=>i).find(i=>!used.has(i));if(free===undefined)continue;pad.index=free;}used.add(pad.index);this.devices=[...this.devices,pad];}
    if(direct.length)this.supported=true;
    const profile=this.profile,wheel=profile&&findWheelDevice(this.devices,profile.deviceId,profile.deviceIndex),pedals=profile&&findWheelDevice(this.devices,profile.pedalDeviceId,profile.pedalIndex);
    if(!profile?.enabled||!wheel||!pedals||this.configuring){this.identity='';this.held.clear();this.suspend();return previouslyConnected&&!this.configuring;}
    if(wheel.inputsReady===false||pedals.inputsReady===false){this.waitingUSB=true;this.identity='';this.held.clear();this.suspend();return previouslyConnected;}
    const rawSteer=wheel.axes[profile.steering.axis],rawThrottle=pedalRaw(pedals,profile.throttle),rawBrake=pedalRaw(pedals,profile.brake);
    if(!endpoint(rawSteer)||!endpoint(rawThrottle)||!endpoint(rawBrake)||Object.values(profile.buttons).some(button=>button!==null&&button>=wheel.buttons.length)){this.layoutChanged=true;this.identity='';this.held.clear();this.suspend();return previouslyConnected;}
    this.connected=true;
    const identity=`${wheel.index}/${pedals.index}/${wheel.id}/${pedals.id}`,held=new Set<number>();
    for(let i=0;i<wheel.buttons.length;i++)if(wheel.buttons[i].pressed||wheel.buttons[i].value>.55)held.add(i);
    if(identity!==this.identity){this.identity=identity;this.held=held;this.suspend();}
    const steer=steeringValue(rawSteer,profile),throttle=pedalValue(rawThrottle,profile.throttle),brake=pedalValue(rawBrake,profile.brake);
    if(!this.armed){
      const mappedHeld=Object.values(profile.buttons).some(button=>button!==null&&held.has(button));
      this.armed=Math.abs(steer)<.12&&throttle<.04&&brake<.04&&!mappedHeld;this.held=held;
      if(!this.armed)return false;
    }
    for(const action of WHEEL_ACTIONS){const button=profile.buttons[action];if(button!==null&&held.has(button)&&!this.held.has(button))this.pressed.add(action);}
    this.held=held;this.controls={steer,throttle:throttle<.015?0:throttle,brake:brake<.015?0:brake,boost:this.down('boost'),keyboard:false};return false;
  }
}
let shared:WheelInput|undefined;
export function wheelInput(){return shared??=new WheelInput();}
