import {wheelInput,type WheelInput,type WheelAction} from './WheelInput';
const WHEEL_KEYS:Record<string,WheelAction>={KeyQ:'shiftDown',KeyE:'shiftUp',KeyF:'drs',Escape:'pause',KeyC:'camera'};
export class Input {
  private keys = new Set<string>();
  private justPressed = new Set<string>();
  constructor(readonly wheel:WheelInput=wheelInput()) {
    window.addEventListener('keydown', e => {
      if(this.wheel.configuring||(e.target as HTMLElement)?.closest?.('dialog[open]'))return;
      if(e.code!=='Escape'&&(e.target as HTMLElement)?.matches?.('input,textarea,select,[contenteditable="true"]'))return;
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
      if (!e.repeat && !this.keys.has(e.code)) this.justPressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.clear());
  }
  poll(){return this.wheel.poll();}
  analog(){return this.wheel.controls;}
  clear(){this.keys.clear();this.justPressed.clear();this.wheel.suspend();}
  down(...codes: string[]) { return codes.some(c => this.keys.has(c)||(c==='ShiftLeft'||c==='ShiftRight')&&this.wheel.down('boost')); }
  consume(code: string) { const wheelHit=WHEEL_KEYS[code]?this.wheel.consume(WHEEL_KEYS[code]):false,hit=this.justPressed.has(code)||wheelHit;this.justPressed.delete(code);return hit; }
}
