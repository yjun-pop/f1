import type {WheelDevice} from './WheelInput';

export interface HIDItem {
  reportSize:number;reportCount:number;logicalMinimum:number;logicalMaximum:number;
  isAbsolute?:boolean;isArray?:boolean;isBufferedBytes?:boolean;isConstant?:boolean;isRange?:boolean;hasNull?:boolean;
  usages?:readonly number[];usageMinimum?:number;usageMaximum?:number;
}
export interface HIDReport {reportId:number;items:readonly HIDItem[]}
export interface HIDCollection {usagePage:number;usage:number;inputReports?:readonly HIDReport[];children?:readonly HIDCollection[]}
export interface HIDInputEvent {reportId:number;data:DataView}
export interface HIDWheelDevice {
  vendorId:number;productId:number;productName:string;opened:boolean;collections:readonly HIDCollection[];
  open():Promise<void>;close():Promise<void>;
  addEventListener(type:'inputreport',listener:(event:HIDInputEvent)=>void):void;
  removeEventListener(type:'inputreport',listener:(event:HIDInputEvent)=>void):void;
}
export interface WheelHIDAPI {
  requestDevice(options:{filters:{usagePage:number;usage:number}[]}):Promise<HIDWheelDevice[]>;
  getDevices():Promise<HIDWheelDevice[]>;
  addEventListener?(type:'disconnect',listener:(event:{device:HIDWheelDevice})=>void):void;
}
interface Field {kind:'axis'|'button';index:number;offset:number;size:number;min:number;max:number;usage:number}
interface ReportLayout {bytes:number;fields:Field[]}
export interface HIDLayout {reports:Map<number,ReportLayout>;axes:number;buttons:number;signature:string}
const AXES=new Set([0x10030,0x10031,0x10032,0x10033,0x10034,0x10035,0x10036,0x10037,0x10038,0x200ba,0x200bb,0x200c4,0x200c5,0x200c6,0x200c8]);
const controller=(c:HIDCollection):boolean=>c.usagePage===1&&[4,5,8].includes(c.usage)||c.usagePage===2&&c.usage===2||!!c.children?.some(controller);
const hex=(value:number)=>value.toString(16).padStart(4,'0');
/** Top-level report lists already contain descendant items in descriptor order.
 * Never traverse children again or guess offsets in vendor-defined packets. */
export function compileHIDLayout(collections:readonly HIDCollection[]):HIDLayout {
  const owners=new Map<number,number>();
  for(const collection of collections)for(const report of collection.inputReports??[])owners.set(report.reportId,(owners.get(report.reportId)??0)+1);
  const reports=new Map<number,ReportLayout>();let axes=0,buttons=0;
  for(const collection of collections.filter(controller))for(const report of collection.inputReports??[]){
    if(owners.get(report.reportId)!==1)throw new Error('여러 컬렉션이 같은 보고서를 공유하는 입력 형식은 아직 지원하지 않습니다.');
    if(!Number.isInteger(report.reportId)||report.reportId<0||report.reportId>255||reports.size>=32||report.items.length>1024)throw new Error('USB 입력 설명의 크기 또는 보고서 번호가 올바르지 않습니다.');
    const fields:Field[]=[];let offset=0;
    for(const item of report.items){
      const size=item.reportSize,count=item.reportCount;
      if(!Number.isInteger(size)||!Number.isInteger(count)||size<0||size>32||count<0||count>512||offset+size*count>65536)throw new Error('USB 입력 필드 크기를 해석할 수 없습니다.');
      for(let i=0;i<count;i++){
        const usage=item.isRange?(item.usageMinimum??0)+Math.min(i,Math.max(0,(item.usageMaximum??0)-(item.usageMinimum??0))):item.usages?.[Math.min(i,(item.usages?.length??1)-1)]??0;
        const kind=AXES.has(usage)?'axis':usage>>>16===9&&(usage&0xffff)>0?'button':undefined;
        if(kind&&!item.isConstant&&!item.isBufferedBytes&&!item.isArray&&item.isAbsolute!==false&&size>0){
          const min=item.logicalMinimum,max=item.logicalMaximum;
          if(!Number.isFinite(min)||!Number.isFinite(max)||max<=min||kind==='axis'&&axes>=64||kind==='button'&&buttons>=128)throw new Error('USB 입력 범위나 입력 개수를 해석할 수 없습니다.');
          fields.push({kind,index:kind==='axis'?axes++:buttons++,offset:offset+i*size,size,min,max,usage});
        }
      }
      offset+=size*count;
    }
    if(fields.length)reports.set(report.reportId,{bytes:Math.ceil(offset/8),fields});
  }
  if(!axes&&!buttons)throw new Error('표준 조향·페달·버튼 설명을 찾지 못했습니다. 장치 모드와 USB 진단을 확인하세요.');
  let hash=2166136261;for(const ch of JSON.stringify([...reports]))hash=Math.imul(hash^ch.charCodeAt(0),16777619)>>>0;
  return {reports,axes,buttons,signature:hash.toString(16)};
}
function integer(data:DataView,offset:number,size:number,signed:boolean){
  let value=0;
  if(offset%8===0&&[8,16,32].includes(size)){
    const byte=offset/8;
    value=size===8?data.getUint8(byte):size===16?data.getUint16(byte,true):data.getUint32(byte,true);
  }else for(let bit=0;bit<size;bit++)value+=((data.getUint8((offset+bit)>>3)>>((offset+bit)&7))&1)*2**bit;
  return signed&&value>=2**(size-1)?value-2**size:value;
}
/** data excludes the report ID, as specified by HIDInputReportEvent. */
export function decodeHIDReport(layout:HIDLayout,id:number,data:DataView){
  const report=layout.reports.get(id);if(!report)return null;
  if(data.byteLength<report.bytes)throw new Error('USB 입력 보고서가 설명된 길이보다 짧습니다.');
  return report.fields.map(field=>{
    const raw=integer(data,field.offset,field.size,field.min<0);
    if(raw<field.min||raw>field.max)throw new Error('USB 입력이 설명된 범위를 벗어났습니다.');
    const value=(raw-field.min)/(field.max-field.min);
    return {kind:field.kind,index:field.index,value:field.kind==='axis'?value*2-1:value};
  });
}
interface Entry {
  device:HIDWheelDevice;layout:HIDLayout;pad:WheelDevice&{axes:number[];buttons:{pressed:boolean;value:number;touched:boolean}[]};
  seen:Set<number>;packets:number;invalid:number;listener:(event:HIDInputEvent)=>void;
}
export function browserWheelHID(){return typeof navigator!=='undefined'?(navigator as Navigator&{hid?:WheelHIDAPI}).hid:undefined;}
/** Read-only controller input. No output, feature, motor or firmware commands. */
export class HIDWheel {
  private entries=new Map<HIDWheelDevice,Entry>();private pending=new Map<HIDWheelDevice,Promise<void>>();private reserved=new Set<number>();private lost=new WeakSet<HIDWheelDevice>();private generation=0;private disconnected=false;
  lastError='';lastSelected?:{name:string;vendorId:string;productId:string};
  constructor(private api:WheelHIDAPI|undefined=browserWheelHID()){
    api?.addEventListener?.('disconnect',event=>{this.lost.add(event.device);const entry=this.entries.get(event.device);if(entry){entry.pad.connected=false;entry.device.removeEventListener('inputreport',entry.listener);this.entries.delete(event.device);}});
  }
  get available(){return !!this.api;}
  get devices(){return [...this.entries.values()].filter(e=>e.device.opened&&e.pad.connected).map(e=>e.pad);}
  get diagnostics(){return {available:this.available,lastError:this.lastError||null,selected:this.lastSelected??null,devices:[...this.entries.values()].map(e=>({name:e.device.productName,vendorId:hex(e.device.vendorId),productId:hex(e.device.productId),opened:e.device.opened,ready:e.pad.inputsReady,packets:e.packets,invalidReports:e.invalid,axes:e.layout.axes,buttons:e.layout.buttons,reports:[...e.layout.reports].map(([id,r])=>({id,bytes:r.bytes,fields:r.fields.map(f=>({kind:f.kind,index:f.index,bitOffset:f.offset,bits:f.size,usage:hex(f.usage),min:f.min,max:f.max}))}))}))};}
  async request(){
    if(!this.api)throw new Error('USB 직접 연결은 외부 Chrome·Edge에서 사용할 수 있습니다.');
    this.disconnected=false;this.lastError='';const generation=this.generation;
    try{
      const devices=await this.api.requestDevice({filters:[{usagePage:1,usage:4},{usagePage:1,usage:5},{usagePage:1,usage:8},{usagePage:2,usage:2}]});
      if(!devices.length||generation!==this.generation)return 0;
      let count=0;for(const device of devices){if(generation!==this.generation)return 0;try{await this.attach(device);if(this.entries.has(device))count++;}catch(error){this.lastError=error instanceof Error?error.message:String(error);}}
      if(generation!==this.generation)return 0;
      if(!count)throw new Error(this.lastError||'USB 장치를 열지 못했습니다. 스팀 등 다른 앱을 종료하고 장치 모드를 확인하세요.');return count;
    }catch(error){this.lastError=error instanceof Error?error.message:String(error);throw error;}
  }
  async restore(){
    if(!this.api||this.disconnected)return;
    try{for(const device of await this.api.getDevices())if(!this.disconnected){try{await this.attach(device);}catch(error){this.lastError=error instanceof Error?error.message:String(error);}}}catch(error){this.lastError=error instanceof Error?error.message:String(error);}
  }
  private attach(device:HIDWheelDevice){
    if(this.entries.has(device))return Promise.resolve();const active=this.pending.get(device);if(active)return active;
    this.lost.delete(device);const work=this.open(device);this.pending.set(device,work);void work.finally(()=>this.pending.delete(device)).catch(()=>{});return work;
  }
  private async open(device:HIDWheelDevice){
    this.lastSelected={name:device.productName,vendorId:hex(device.vendorId),productId:hex(device.productId)};
    const layout=compileHIDLayout(device.collections),generation=this.generation;
    if(this.entries.size>=16)throw new Error('USB 입력 장치를 너무 많이 연결했습니다. 사용하지 않는 장치를 해제하세요.');
    const index=Array.from({length:16},(_,i)=>i+16).find(i=>!this.reserved.has(i)&&![...this.entries.values()].some(e=>e.pad.index===i));
    if(index===undefined)throw new Error('사용할 수 있는 USB 입력 슬롯이 없습니다.');
    this.reserved.add(index);
    const pad:Entry['pad']={id:`webhid:${hex(device.vendorId)}:${hex(device.productId)}:${layout.signature}:${device.productName||'USB 휠'}`,index,connected:false,mapping:'',source:'hid',inputsReady:false,
      axes:Array(layout.axes).fill(NaN),buttons:Array.from({length:layout.buttons},()=>({pressed:false,value:0,touched:false}))};
    const entry:Entry={device,layout,pad,seen:new Set(),packets:0,invalid:0,listener:event=>{
      if(!layout.reports.has(event.reportId))return;
      try{
        const fields=decodeHIDReport(layout,event.reportId,event.data)!;
        for(const field of fields)if(field.kind==='axis')pad.axes[field.index]=field.value;else pad.buttons[field.index]={value:field.value,pressed:field.value>.55,touched:field.value>0};
        entry.seen.add(event.reportId);entry.packets++;pad.inputsReady=entry.seen.size===layout.reports.size;
      }catch(error){entry.invalid++;entry.seen.delete(event.reportId);pad.inputsReady=false;pad.axes.fill(NaN);for(const button of pad.buttons){button.pressed=false;button.value=0;button.touched=false;}entry.seen.clear();this.lastError=error instanceof Error?error.message:String(error);}
    }};
    device.addEventListener('inputreport',entry.listener);
    try{
      if(!device.opened)await device.open();
      if(generation!==this.generation||this.lost.has(device)){device.removeEventListener('inputreport',entry.listener);await device.close();return;}
      pad.connected=true;this.entries.set(device,entry);
    }catch(error){device.removeEventListener('inputreport',entry.listener);throw error;}finally{this.reserved.delete(index);}
  }
  async disconnect(){
    this.disconnected=true;this.generation++;const entries=[...this.entries.values()];this.entries.clear();
    for(const entry of entries){entry.pad.connected=false;entry.device.removeEventListener('inputreport',entry.listener);try{await entry.device.close();}catch{}}
  }
}
