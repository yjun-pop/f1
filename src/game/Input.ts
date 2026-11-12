import {wheelInput,type WheelInput,type WheelAction} from './WheelInput';
const WHEEL_KEYS:Record<string,WheelAction>={KeyQ:'shiftDown',KeyE:'shiftUp',KeyF:'drs',Escape:'pause',KeyC:'camera'};
export class Input {
  private source?:'keyboard'|'wheel';private wheelValues=[0,0,0,0];
  get controlDevice(){return this.source??(this.wheel.drivingDevice?'wheel':'keyboard');}
  private keys = new Set<string>();
  private justPressed = new Set<string>();
  constructor(readonly wheel:WheelInput=wheelInput()) {
    window.addEventListener('keydown', e => {
      if(this.wheel.configuring||(e.target as HTMLElement)?.closest?.('dialog[open]'))return;
      if(e.code!=='Escape'&&(e.target as HTMLElement)?.matches?.('input,textarea,select,[contenteditable="true"]'))return;
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
      if (!e.repeat && !this.keys.has(e.code)) this.justPressed.add(e.code);
      this.keys.add(e.code);if(['KeyW','KeyS','KeyA','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight'].includes(e.code))this.source='keyboard';
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.clear());
  }
  poll(){const changed=this.wheel.poll(),a=this.wheel.controls;if(a){const values=[a.throttle,a.brake,a.steer,a.boost?1:0];if(values.some((v,i)=>Math.abs(v-this.wheelValues[i])>.03)){this.source='wheel';this.wheelValues=values;}}return changed;}
  analog(){return this.wheel.controls;}
  clear(){this.keys.clear();this.justPressed.clear();this.wheel.suspend();}
  down(...codes: string[]) { return codes.some(c => this.keys.has(c)||(c==='ShiftLeft'||c==='ShiftRight')&&this.wheel.down('boost')); }
  consume(code: string) { if(document.querySelector('dialog[open]')){this.justPressed.delete(code);if(WHEEL_KEYS[code])this.wheel.consume(WHEEL_KEYS[code]);return false;} const wheelHit=WHEEL_KEYS[code]?this.wheel.consume(WHEEL_KEYS[code]):false,hit=this.justPressed.has(code)||wheelHit;this.justPressed.delete(code);return hit; }
}
