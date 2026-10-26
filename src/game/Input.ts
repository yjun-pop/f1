export class Input {
  private keys = new Set<string>();
  private justPressed = new Set<string>();
  constructor() {
    window.addEventListener('keydown', e => {
      if(e.code!=='Escape'&&(e.target as HTMLElement)?.matches?.('input,textarea,select,[contenteditable="true"]'))return;
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
      if (!e.repeat && !this.keys.has(e.code)) this.justPressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.justPressed.clear(); });
  }
  clear(){this.keys.clear();this.justPressed.clear();}
  down(...codes: string[]) { return codes.some(c => this.keys.has(c)); }
  consume(code: string) { const hit = this.justPressed.has(code); this.justPressed.delete(code); return hit; }
}
