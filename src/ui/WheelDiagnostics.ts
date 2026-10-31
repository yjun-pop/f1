import type {WheelInput} from '../game/WheelInput';
interface Context {secure:boolean|null;api:boolean;focused:boolean|null;embedded:boolean|null}
/** Local, explicit support report. No USB enumeration or automatic upload. */
export function wheelDiagnosticReport(wheel:WheelInput,context:Context){
  return JSON.stringify({version:2,secureContext:context.secure,gamepadAPI:context.api,focused:context.focused,embeddedFrame:context.embedded,
    result:wheel.devices.length?'devices-visible':wheel.readErrorName?'read-error':'empty-gamepad-list',error:wheel.readErrorName||null,
    devices:wheel.devices.map(p=>({id:p.id,index:p.index,mapping:p.mapping||'none',axes:p.axes.length,buttons:p.buttons.length,...(p.source?{source:p.source,inputsReady:p.inputsReady}: {})})),
    directUSB:wheel.usb?.diagnostics??{available:false,devices:[]}},null,2);
}
export function currentWheelDiagnostic(wheel:WheelInput){
  let embedded:boolean|null=null;try{embedded=window.self!==window.top;}catch{embedded=true;}
  return wheelDiagnosticReport(wheel,{secure:typeof globalThis.isSecureContext==='boolean'?globalThis.isSecureContext:null,
    api:typeof navigator!=='undefined'&&typeof navigator.getGamepads==='function',focused:typeof document.hasFocus==='function'?document.hasFocus():null,embedded});
}
