import type {WheelDevice} from './WheelInput';
import {RumbleOutput} from './WheelRumble';

interface Endpoint {endpointNumber:number;direction:string;type:string;packetSize:number}
interface Alternate {alternateSetting:number;interfaceClass:number;interfaceSubclass:number;interfaceProtocol:number;endpoints:readonly Endpoint[]}
interface Interface {interfaceNumber:number;alternate:Alternate;alternates:readonly Alternate[]}
interface Configuration {configurationValue:number;interfaces:readonly Interface[]}
export interface WheelUSBDevice {
  vendorId:number;productId:number;productName?:string;manufacturerName?:string;opened:boolean;
  configurations:readonly Configuration[];configuration?:Configuration|null;
  open():Promise<void>;close():Promise<void>;selectConfiguration(value:number):Promise<void>;
  claimInterface(value:number):Promise<void>;selectAlternateInterface(number:number,alternate:number):Promise<void>;
  transferIn(endpoint:number,length:number):Promise<{status:string;data?:DataView|null}>;
  transferOut?(endpoint:number,data:Uint8Array):Promise<{status:string;bytesWritten?:number}>;
  controlTransferIn?(setup:{requestType:'vendor';recipient:'interface';request:number;value:number;index:number},length:number):Promise<{status:string;data?:DataView|null}>;
}
export interface WheelUSBAPI {
  requestDevice(options:{filters:object[]}):Promise<WheelUSBDevice>;
  getDevices():Promise<WheelUSBDevice[]>;
  addEventListener?(type:'connect'|'disconnect',listener:(event:{device:WheelUSBDevice})=>void):void;
}
const hex=(v:number)=>v.toString(16).padStart(4,'0');
const key=(d:WheelUSBDevice)=>`${hex(d.vendorId)}:${hex(d.productId)}:${d.productName??''}`;
const WIRED_WHEEL={vendorId:0x0079,productId:0x189c};
export function xbox360Interface(device:WheelUSBDevice){
  const configs=[...device.configurations].sort((a,b)=>Number(b.configurationValue===device.configuration?.configurationValue)-Number(a.configurationValue===device.configuration?.configurationValue));
  for(const config of configs)for(const intf of config.interfaces)for(const alt of intf.alternates){
    if(alt.interfaceClass!==0xff||alt.interfaceSubclass!==0x5d||alt.interfaceProtocol!==1)continue;
    const endpoint=alt.endpoints.find(e=>e.direction==='in'&&e.type==='interrupt'&&e.endpointNumber>=1&&e.endpointNumber<=15&&e.packetSize>=20&&e.packetSize<=1024);
    if(endpoint)return {config:config.configurationValue,number:intf.interfaceNumber,alternate:alt.alternateSetting,endpoint:endpoint.endpointNumber,bytes:endpoint.packetSize};
  }
  throw new Error('이 USB 입력 형식은 아직 지원하지 않습니다. 유선 Xbox 360/XInput 인터페이스(FF/5D/01)가 필요합니다. HID 모드는 USB 휠 직접 연결에서 확인하세요.');
}
/** Wired Xbox 360 input report: 00 14, flags, two 8-bit triggers,
 * four little-endian signed 16-bit stick axes. Other Xbox protocols differ.
 * Protocol reference: Linux drivers/input/joystick/xpad.c (xpad360_process_packet).
 * No commands are sent to switch device modes or initialize vendor protocols. */
export function decodeXbox360(data:DataView){
  if(data.byteLength<2)throw new Error('USB 입력 보고서가 너무 짧습니다.');
  if(data.getUint8(0)!==0)return null;
  if(data.getUint8(1)!==20||data.byteLength<20)throw new Error('유선 XInput 입력 보고서의 길이가 맞지 않습니다.');
  const flags=data.getUint16(2,true),bits=[12,13,14,15,8,9,-1,-1,5,4,6,7,0,1,2,3,10];
  const buttons=bits.map(bit=>{const value=bit>=0?Number(!!(flags&(1<<bit))):0;return {value,pressed:!!value};});
  for(const [button,offset] of [[6,4],[7,5]]){const value=data.getUint8(offset)/255;buttons[button]={value,pressed:value>.55};}
  const axes=[6,8,10,12].map(offset=>{const raw=data.getInt16(offset,true);return raw/(raw<0?32768:32767);});
  return {axes,buttons};
}
type Pad=WheelDevice&{axes:number[];buttons:{value:number;pressed:boolean}[]};
export interface RumbleCapabilities {state:'not-queried'|'reading'|'reported'|'unavailable'|'timeout'|'invalid'|'error';message:string;strong?:number;weak?:number;advertised?:boolean}
interface Entry {device:WheelUSBDevice;pad:Pad;route:ReturnType<typeof xbox360Interface>;setup:SetupAttempt;active:boolean;packets:number;invalid:number;rumbleEndpoint?:number;capabilities?:RumbleCapabilities;capabilityWork?:Promise<RumbleCapabilities>}
interface SetupAttempt {
  name:string;vendorId:string;productId:string;stage:string;status:'connecting'|'waiting-input'|'ready'|'failed'|'cancelled';
  configurationBeforeOpen:number|null;configurationAfterOpen:number|null;activeConfiguration:number|null;
  route?:ReturnType<typeof xbox360Interface>;disconnectedDuringSetup?:boolean;error?:{name:string;message:string};
}
export function browserWheelUSB(){return typeof navigator==='undefined'?undefined:(navigator as Navigator&{usb?:WheelUSBAPI}).usb;}
function describe(device:WheelUSBDevice){return {name:device.productName??'',manufacturer:device.manufacturerName??'',vendorId:hex(device.vendorId),productId:hex(device.productId),
  configurations:device.configurations.slice(0,8).map(c=>({value:c.configurationValue,interfaces:c.interfaces.slice(0,16).map(i=>({number:i.interfaceNumber,alternates:i.alternates.slice(0,16).map(a=>({setting:a.alternateSetting,class:hex(a.interfaceClass),subclass:hex(a.interfaceSubclass),protocol:hex(a.interfaceProtocol),endpoints:a.endpoints.slice(0,16).map(e=>({number:e.endpointNumber,direction:e.direction,type:e.type,packetSize:e.packetSize}))}))}))}))};}
/** Browser-local, user-selected wired XInput transport. Only the known wired
 * wheel's matched interface may receive the standard eight-byte rumble packet. */
export class USBWheel {
  private entries=new Map<WheelUSBDevice,Entry>();private pending=new Map<WheelUSBDevice,Promise<void>>();private reserved=new Set<number>();
  private known=new Set<string>();private epochs=new WeakMap<WheelUSBDevice,number>();private generation=0;private disabled=false;
  private events:{at:number;type:string;name:string;detail?:string}[]=[];
  lastError='';lastSelected?:ReturnType<typeof describe>;private lastSetup?:SetupAttempt;
  constructor(private api:WheelUSBAPI|undefined=browserWheelUSB()){
    api?.addEventListener?.('disconnect',({device})=>{this.epochs.set(device,(this.epochs.get(device)??0)+1);const entry=this.entries.get(device);if(entry||this.pending.has(device))this.record('disconnected',device);if(entry)this.drop(entry);});
    api?.addEventListener?.('connect',({device})=>{
      if(this.disabled||!this.known.has(key(device)))return;
      const epoch=(this.epochs.get(device)??0)+1;this.epochs.set(device,epoch);const generation=this.generation;this.record('reconnected',device);
      void (async()=>{try{await this.pending.get(device);}catch{}if(!this.disabled&&generation===this.generation&&epoch===this.epochs.get(device))await this.attach(device);})().catch(error=>this.failure(device,error));
    });
  }
  private record(type:string,device:WheelUSBDevice,detail?:string){this.events.push({at:Date.now(),type,name:device.productName??'',...(detail?{detail}: {})});if(this.events.length>32)this.events.shift();}
  private failure(device:WheelUSBDevice,error:unknown){this.lastError=error instanceof Error?`${error.name}: ${error.message}`:String(error);this.record('error',device,this.lastError);}
  get available(){return !!this.api;}
  get devices(){return [...this.entries.values()].filter(e=>e.active&&e.device.opened).map(e=>e.pad);}
  get diagnostics(){return {available:this.available,lastError:this.lastError||null,selected:this.lastSelected??null,setup:this.lastSetup?{...this.lastSetup}:null,events:[...this.events],devices:[...this.entries.values()].map(e=>({name:e.pad.displayName,id:e.pad.id,ready:e.pad.inputsReady,packets:e.packets,invalidReports:e.invalid,route:e.route,rumble:{available:!!e.pad.rumble?.available,error:e.pad.rumble?.error||null,endpoint:e.rumbleEndpoint??null,output:e.pad.rumble?.diagnostics??null,capabilities:e.capabilities??{state:'not-queried',message:'모터 지원 정보 조회 전'}}}))};}
  rumbleCapabilities(id:string){const cap=[...this.entries.values()].find(e=>e.pad.id===id)?.capabilities;return cap?{...cap}:undefined;}
  checkRumbleCapabilities(id:string):Promise<RumbleCapabilities>{
    const entry=[...this.entries.values()].find(e=>e.pad.id===id&&e.active&&e.pad.inputsReady&&e.pad.rumble);
    if(!entry)return Promise.resolve({state:'unavailable',message:'진동 정보를 조회할 Wired Wheel 입력이 준비되지 않았습니다.'});
    if(entry.capabilityWork)return entry.capabilityWork;
    // Capabilities are static for this connection. Do not queue more endpoint-0
    // requests after a firmware timeout; reconnecting creates a fresh entry.
    if(entry.capabilities&&entry.capabilities.state!=='reading')return Promise.resolve({...entry.capabilities});
    entry.capabilities={state:'reading',message:'장치의 모터 지원 정보를 읽고 있습니다.'};
    const work=this.readRumbleCapabilities(entry).then(result=>{
      if(!entry.active||!entry.device.opened)return {state:'unavailable' as const,message:'지원 정보 조회 중 장치 연결이 해제됐습니다.'};
      entry.capabilities=result;return {...result};
    }).finally(()=>{entry.capabilityWork=undefined;});entry.capabilityWork=work;return work;
  }
  private async readRumbleCapabilities(entry:Entry):Promise<RumbleCapabilities>{
    const device=entry.device;
    if(!device.controlTransferIn)return {state:'unavailable',message:'브라우저에서 모터 지원 정보를 읽을 수 없습니다.'};
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{
      // SDL FetchXInputCapabilities: vendor/interface IN, request 01,
      // value 0000, 8 bytes. This reads advertised motor ranges; no device
      // mode, feature, enable or firmware command is written.
      const reply=await Promise.race([
        device.controlTransferIn({requestType:'vendor',recipient:'interface',request:1,value:0,index:entry.route.number},8),
        new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),300);})
      ]);
      if(!reply)return {state:'timeout',message:'장치가 모터 지원 정보 조회에 응답하지 않았습니다. 지원 여부는 미확인입니다.'};
      if(reply.status!=='ok')return {state:'unavailable',message:`모터 지원 정보 조회 응답: ${reply.status}. 지원 여부는 미확인입니다.`};
      if(!reply.data||reply.data.byteLength!==8)return {state:'invalid',message:'모터 지원 정보 응답의 길이가 맞지 않아 지원 여부를 판정할 수 없습니다.'};
      const strong=reply.data.getUint8(3),weak=reply.data.getUint8(4),advertised=strong>0||weak>0;
      return {state:'reported',strong,weak,advertised,message:advertised?'장치가 모터 출력을 보고했습니다. 실제 반응은 테스트로 확인하세요.':'장치 응답에서 모터 지원이 확인되지 않았습니다. 이 값만으로 실제 미지원을 단정할 수는 없습니다.'};
    }catch(error){return {state:'error',message:`모터 지원 정보 조회 실패: ${error instanceof Error?error.message:String(error)}. 입력 연결은 유지합니다.`};}
    finally{clearTimeout(timer);}
  }
  async request(){
    if(!this.api)throw new Error('WebUSB는 외부 데스크톱 Chrome·Edge에서 사용할 수 있습니다.');
    this.disabled=false;this.lastError='';const generation=this.generation;
    let device:WheelUSBDevice;
    try{device=await this.api.requestDevice({filters:[WIRED_WHEEL]});}catch(error){if((error as Error).name==='NotFoundError')return 0;this.lastError=error instanceof Error?`${error.name}: ${error.message}`:String(error);throw error;}
    if(generation!==this.generation)return 0;
    this.record('selected',device);
    try{await this.attach(device);return this.entries.has(device)?1:0;}catch(error){this.failure(device,error);throw error;}
  }
  async restore(){
    if(!this.api||this.disabled)return;
    try{for(const device of await this.api.getDevices())if(!this.disabled){try{await this.attach(device);}catch(error){this.failure(device,error);}}}catch(error){this.lastError=error instanceof Error?error.message:String(error);}
  }
  private attach(device:WheelUSBDevice){
    if(this.entries.has(device))return Promise.resolve();const pending=this.pending.get(device);if(pending)return pending;
    const work=this.open(device);this.pending.set(device,work);void work.finally(()=>this.pending.delete(device)).catch(()=>{});return work;
  }
  private async open(device:WheelUSBDevice){
    this.lastSelected=describe(device);const route=xbox360Interface(device),generation=this.generation,epoch=this.epochs.get(device)??0;
    const index=Array.from({length:16},(_,i)=>i+16).find(i=>!this.reserved.has(i)&&![...this.entries.values()].some(e=>e.pad.index===i));
    if(index===undefined)throw new Error('사용할 수 있는 USB 입력 슬롯이 없습니다.');
    this.known.add(key(device));this.reserved.add(index);let openedHere=false;
    const setup:SetupAttempt={name:device.productName??'',vendorId:hex(device.vendorId),productId:hex(device.productId),stage:'open-device',status:'connecting',configurationBeforeOpen:device.configuration?.configurationValue??null,configurationAfterOpen:null,activeConfiguration:device.configuration?.configurationValue??null,route};this.lastSetup=setup;
    const cancelled=()=>this.disabled||generation!==this.generation||epoch!==(this.epochs.get(device)??0);
    try{
      if(!device.opened){await device.open();openedHere=true;}
      if(cancelled()){await device.close();return;}
      setup.configurationAfterOpen=device.configuration?.configurationValue??null;
      // open() may expose a different active configuration. Prefer its supported
      // input interface rather than resetting the entire device unnecessarily.
      Object.assign(route,xbox360Interface(device));setup.activeConfiguration=setup.configurationAfterOpen;
      if(device.configuration?.configurationValue!==route.config){
        setup.stage='select-configuration';this.record('select-configuration',device,`active=${setup.activeConfiguration??'none'}, requested=${route.config}`);
        await device.selectConfiguration(route.config);
        if(device.configuration?.configurationValue!==route.config)throw new Error('브라우저가 요청한 USB 구성을 활성화하지 않았습니다.');
      }
      if(cancelled()){await device.close();return;}
      setup.activeConfiguration=device.configuration?.configurationValue??null;setup.stage='claim-interface';
      await device.claimInterface(route.number);
      if(cancelled()){await device.close();return;}
      if(device.configuration?.interfaces.find(i=>i.interfaceNumber===route.number)?.alternate.alternateSetting!==route.alternate){setup.stage='select-alternate';await device.selectAlternateInterface(route.number,route.alternate);}
      if(cancelled()){await device.close();return;}
      const pad:Pad={id:`webusb:xinput360:${key(device)}`,displayName:device.productName||'USB XInput 휠',index,connected:true,mapping:'standard',source:'usb',inputsReady:false,axes:Array(4).fill(NaN),buttons:Array.from({length:17},()=>({value:0,pressed:false}))};
      const entry:Entry={device,pad,route,setup,active:true,packets:0,invalid:0};
      const alternate=device.configurations.find(c=>c.configurationValue===route.config)?.interfaces.find(i=>i.interfaceNumber===route.number)?.alternates.find(a=>a.alternateSetting===route.alternate);
      const output=alternate?.endpoints.find(e=>e.direction==='out'&&e.type==='interrupt'&&e.endpointNumber>=1&&e.endpointNumber<=15&&e.packetSize>=8);
      if(device.vendorId===WIRED_WHEEL.vendorId&&device.productId===WIRED_WHEEL.productId&&output&&device.transferOut){
        entry.rumbleEndpoint=output.endpointNumber;
        pad.rumble=new RumbleOutput('usb',async(strong,weak)=>{
          // Linux xpad_play_effect, XTYPE_XBOX360. No mode, LED, firmware,
          // feature-report or steering-force commands are sent.
          const packet=Uint8Array.from([0,8,0,Math.round(strong*255),Math.round(weak*255),0,0,0]);
          const result=await device.transferOut!(output.endpointNumber,packet);
          if(result.status!=='ok'||result.bytesWritten!==undefined&&result.bytesWritten!==packet.length)throw new Error(`USB 진동 전송 실패 (${result.status})`);
        },()=>device.opened);
      }
      this.entries.set(device,entry);setup.status='waiting-input';setup.stage='receive-input';this.record('opened',device);void this.receive(entry);
    }catch(error){
      setup.status='failed';setup.activeConfiguration=device.configuration?.configurationValue??null;setup.error={name:error instanceof Error?error.name:'Error',message:error instanceof Error?error.message:String(error)};
      setup.disconnectedDuringSetup=epoch!==(this.epochs.get(device)??0);
      if(openedHere)try{await device.close();}catch{}
      if(this.disabled||generation!==this.generation){setup.status='cancelled';return;}
      if(setup.disconnectedDuringSetup)throw new Error(`USB 연결 준비 중 장치가 분리되거나 다시 인식되었습니다. 휠 USB를 다시 연결한 뒤 재시도하세요. 원문: ${setup.error.message}`,{cause:error});
      if(setup.stage==='select-configuration')throw new Error(`장치는 찾았지만 USB 구성 ${route.config}을 활성화하지 못했습니다. 휠 USB를 다시 연결하고 가능하면 허브 대신 단일 어댑터로 연결하세요. 계속 실패하면 chrome://device-log의 USB 오류를 확인해주세요. 원문: ${setup.error.message}`,{cause:error});
      throw error;
    }finally{this.reserved.delete(index);}
  }
  private async receive(entry:Entry){
    while(entry.active){
      try{
        const report=await entry.device.transferIn(entry.route.endpoint,entry.route.bytes);if(!entry.active)return;
        if(report.status!=='ok'||!report.data)throw new Error(`USB 입력 전송 실패 (${report.status})`);
        try{
          const state=decodeXbox360(report.data);if(!state)continue;
          const wasReady=entry.pad.inputsReady;entry.pad.axes=state.axes;entry.pad.buttons=state.buttons;entry.pad.inputsReady=true;entry.setup.status='ready';entry.packets++;
          if(!wasReady)this.record('ready',entry.device);
        }catch(error){entry.invalid++;void entry.pad.rumble?.stop();entry.setup.status='waiting-input';entry.pad.inputsReady=false;entry.pad.axes.fill(NaN);for(const button of entry.pad.buttons){button.value=0;button.pressed=false;}if(entry.invalid===1)this.failure(entry.device,error);}
      }catch(error){if(!entry.active)return;entry.setup.status='failed';entry.setup.error={name:error instanceof Error?error.name:'Error',message:error instanceof Error?error.message:String(error)};this.failure(entry.device,error);await this.closeEntry(entry);return;}
    }
  }
  private drop(entry:Entry){entry.active=false;entry.pad.connected=false;entry.pad.inputsReady=false;entry.pad.axes.fill(NaN);for(const b of entry.pad.buttons){b.value=0;b.pressed=false;}this.entries.delete(entry.device);return entry.pad.rumble?.stop();}
  private async closeEntry(entry:Entry,stopping=this.drop(entry)){
    let timer:ReturnType<typeof setTimeout>|undefined;
    // An OS transfer that never completes must not trap the disconnect UI.
    try{await Promise.race([stopping,new Promise<void>(resolve=>{timer=setTimeout(resolve,250);})]);}finally{clearTimeout(timer);}
    try{await entry.device.close();}catch{}
  }
  async disconnect(){this.disabled=true;this.generation++;const entries=[...this.entries.values()],stops=entries.map(entry=>this.drop(entry));for(const [i,entry] of entries.entries()){this.record('closed',entry.device);await this.closeEntry(entry,stops[i]);}}
}
