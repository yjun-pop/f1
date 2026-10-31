import './WheelSetup.css';
import {wheelInput,changedAxis,changedPedal,validWheelProfile,steeringValue,pedalValue,pedalRaw,findWheelDevice,WHEEL_ACTIONS,type WheelAction,type WheelInput,type WheelProfile} from '../game/WheelInput';

const LABELS:Record<WheelAction,string>={shiftDown:'기어 내리기',shiftUp:'기어 올리기',boost:'ERS · 누르는 동안',drs:'DRS',pause:'일시정지 · 계속',camera:'시점 변경'};
const STEPS=[
  ['휠 중앙','휠을 중앙에 놓고, 페달에서 발을 떼세요.'],
  ['왼쪽 조향','게임에서 최대 좌회전으로 사용할 만큼 휠을 왼쪽으로 돌려 유지하세요. 보통 중앙에서 180° 정도입니다.'],
  ['오른쪽 조향','같은 정도로 휠을 오른쪽으로 돌려 유지하세요.'],
  ['가속 페달 놓기','휠을 중앙으로 돌리고 모든 페달에서 발을 떼세요.'],
  ['가속 페달 밟기','가속 페달만 끝까지 밟고 유지하세요.'],
  ['브레이크 놓기','모든 페달에서 발을 떼세요.'],
  ['브레이크 밟기','브레이크만 끝까지 밟고 유지하세요.']
];
export class WheelSetup {
  readonly element:HTMLDialogElement;
  private frame=0;private lastPaint=-Infinity;private deviceStamp?:string;private step=-1;
  private center:number[]=[];private throttleRest:number[]=[];private brakeRest:number[]=[];
  private throttleButtons:number[]=[];private brakeButtons:number[]=[];
  private steering?:WheelProfile['steering'];private throttle?:WheelProfile['throttle'];
  private draft?:WheelProfile;private learning?:{action:WheelAction;held:Set<number>;until:number};
  constructor(private wheel:WheelInput=wheelInput()){
    this.element=document.createElement('dialog');this.element.className='wheel-dialog';this.element.setAttribute('aria-labelledby','wheel-title');
    this.element.innerHTML=`<div class="wheel-top"><div><span>APEX FORMULA / CONTROLS</span><h2 id="wheel-title">레이싱 휠 설정</h2></div><button type="button" id="wheel-close" aria-label="휠 설정 닫기">닫기 ✕</button></div>
      <p class="wheel-intro">휠 버튼을 한 번 눌러 장치를 표시한 뒤 조향과 페달을 보정하세요. 설정은 이 브라우저에 저장됩니다.</p>
      <p id="wheel-detection" class="wheel-notice" role="status"></p>
      <div class="wheel-devices"><label>조향·버튼 장치<select id="wheel-device"></select></label><label>페달 장치<select id="wheel-pedals"></select></label></div>
      <section class="wheel-calibration" aria-labelledby="wheel-step-title"><span id="wheel-step-count">입력 보정</span><h3 id="wheel-step-title">장치를 선택해 주세요</h3><p id="wheel-step-description">처음 연결한 휠은 보정을 마쳐야 차량을 움직일 수 있습니다.</p><div class="wheel-step-buttons"><button type="button" id="wheel-calibrate">보정 시작</button><button type="button" id="wheel-next" hidden>현재 위치 기록 →</button></div></section>
      <p id="wheel-message" class="wheel-message" role="status" aria-live="polite"></p>
      <div class="wheel-meters"><label>조향 <output id="wheel-steer-value">0%</output><meter id="wheel-steer" min="-1" max="1" value="0"></meter></label><label>가속 <output id="wheel-throttle-value">0%</output><meter id="wheel-throttle" min="0" max="1" value="0"></meter></label><label>제동 <output id="wheel-brake-value">0%</output><meter id="wheel-brake" min="0" max="1" value="0"></meter></label></div>
      <fieldset id="wheel-bindings" hidden><legend>패들·버튼 지정 <small>선택 사항</small></legend><p>‘지정’을 누른 뒤 휠의 버튼을 한 번 누르세요.</p>${WHEEL_ACTIONS.map(action=>`<div class="wheel-binding"><span>${LABELS[action]}</span><button type="button" id="wheel-bind-${action}">지정</button><button type="button" id="wheel-clear-${action}" aria-label="${LABELS[action]} 지정 해제">해제</button></div>`).join('')}<small>패들로 직접 변속하려면 레이스의 변속 방식을 ‘수동’으로 선택하세요.</small></fieldset>
      <div class="wheel-tuning"><label for="wheel-deadzone">중앙 데드존 <output id="wheel-deadzone-value"></output></label><input id="wheel-deadzone" type="range" min="0" max="15" step="1" value="2"><label for="wheel-sensitivity">조향 감도 <output id="wheel-sensitivity-value"></output></label><input id="wheel-sensitivity" type="range" min="50" max="200" step="5" value="100"><label class="wheel-enable"><input id="wheel-enabled" type="checkbox" checked> 보정한 휠로 주행하기</label></div>
      <details class="wheel-help"><summary>장치가 보이지 않거나 입력이 이상한가요?</summary><p>Chrome·Edge에서 휠 버튼을 한 번 누르세요. 제조사 드라이버와 PC 모드를 확인하고 필요하면 페이지를 새로고침하세요. 브라우저에 표시되는 장치만 사용할 수 있습니다.</p><p>페달을 별도 USB 장치로 연결했다면 ‘페달 장치’에서 선택하세요. 통합 페달 축도 보정할 수 있지만, 가속과 제동을 동시에 사용하려면 드라이버에서 페달을 분리하세요. 클러치·포스피드백은 지원하지 않습니다.</p><pre id="wheel-raw" aria-label="조향·페달 원시 입력"></pre></details>
      <div class="wheel-bottom"><button type="button" id="wheel-keyboard">키보드로 사용</button><button type="button" id="wheel-save" class="wheel-primary" disabled>설정 저장</button></div>`;
    document.body.appendChild(this.element);
    this.element.addEventListener('keydown',event=>event.stopPropagation());
    this.node('wheel-close').addEventListener('click',()=>this.element.close());
    this.element.addEventListener('close',()=>{this.wheel.configuring=false;this.wheel.suspend();cancelAnimationFrame(this.frame);this.learning=undefined;});
    for(const id of ['wheel-device','wheel-pedals'])this.node(id).addEventListener('change',()=>{
      if(id==='wheel-device')this.node<HTMLSelectElement>('wheel-pedals').value=this.node<HTMLSelectElement>('wheel-device').value;
      this.draft=undefined;this.step=-1;this.learning=undefined;this.showStep();this.message('장치 선택이 바뀌었습니다. 입력을 다시 보정하세요.');
    });
    this.node('wheel-calibrate').addEventListener('click',()=>{this.learning=undefined;this.step=0;this.showStep();this.message('');});
    this.node('wheel-next').addEventListener('click',()=>this.capture());
    for(const action of WHEEL_ACTIONS){
      this.node('wheel-bind-'+action).addEventListener('click',()=>{
        const device=this.selected('wheel-device');if(!this.draft||!device)return;
        this.learning={action,held:this.buttons(device),until:performance.now()+10000};this.message(`${LABELS[action]}에 사용할 버튼을 눌러주세요.`);
      });
      this.node('wheel-clear-'+action).addEventListener('click',()=>{if(this.draft){this.draft.buttons[action]=null;this.learning=undefined;this.showBindings();}});
    }
    for(const id of ['wheel-deadzone','wheel-sensitivity'])this.node(id).addEventListener('input',()=>this.showTuning());
    this.node('wheel-save').addEventListener('click',()=>{
      if(!this.draft)return;
      const profile={...this.draft,enabled:this.node<HTMLInputElement>('wheel-enabled').checked,deadzone:Number(this.node<HTMLInputElement>('wheel-deadzone').value)/100,sensitivity:Number(this.node<HTMLInputElement>('wheel-sensitivity').value)/100};
      try{if(this.wheel.save(profile))this.element.close();else this.message('현재 세션에 적용했습니다. 브라우저 저장소를 사용할 수 없어 다음 접속에는 다시 설정해야 합니다.');}catch(error){this.message((error as Error).message);}
    });
    this.node('wheel-keyboard').addEventListener('click',()=>{if(this.wheel.profile)this.wheel.save({...this.wheel.profile,enabled:false});this.element.close();});
  }
  private node<T extends HTMLElement=HTMLElement>(id:string){return this.element.querySelector<T>('#'+id)!;}
  private selected(id:string){const index=Number(this.node<HTMLSelectElement>(id).value);return this.wheel.devices.find(p=>p.index===index);}
  private message(text:string){this.node('wheel-message').textContent=text;}
  private buttons(pad:Gamepad){return new Set(pad.buttons.flatMap((b,i)=>b.pressed||b.value>.55?[i]:[]));}
  open(){
    if(this.element.open){this.node('wheel-close').focus();return;}
    this.wheel.configuring=true;this.wheel.suspend();this.wheel.poll();this.deviceStamp=undefined;this.step=-1;this.draft=this.wheel.profile?JSON.parse(JSON.stringify(this.wheel.profile)):undefined;
    this.node<HTMLInputElement>('wheel-deadzone').value=String(Math.round((this.draft?.deadzone??.02)*100));this.node<HTMLInputElement>('wheel-sensitivity').value=String(Math.round((this.draft?.sensitivity??1)*100));this.node<HTMLInputElement>('wheel-enabled').checked=this.draft?.enabled??true;
    this.message('');this.refreshDevices();this.showStep();this.showTuning();this.element.showModal();this.lastPaint=-Infinity;this.tick(performance.now());
  }
  private refreshDevices(){
    const stamp=this.wheel.devices.map(p=>`${p.index}/${p.id}/${p.axes.length}/${p.buttons.length}`).join('|');if(stamp===this.deviceStamp)return;
    const changed=this.deviceStamp!==undefined;this.deviceStamp=stamp;
    if(this.draft&&this.wheel.devices.length&&(!findWheelDevice(this.wheel.devices,this.draft.deviceId,this.draft.deviceIndex)||!findWheelDevice(this.wheel.devices,this.draft.pedalDeviceId,this.draft.pedalIndex)))this.draft=undefined;
    for(const [id,saved,hint] of [['wheel-device',this.draft?.deviceId,this.draft?.deviceIndex],['wheel-pedals',this.draft?.pedalDeviceId,this.draft?.pedalIndex]] as const){
      const select=this.node<HTMLSelectElement>(id),previous=select.value,options=this.wheel.devices.map(p=>{const option=document.createElement('option');option.value=String(p.index);option.textContent=`${p.id} · 장치 ${p.index+1}`;return option;});
      select.replaceChildren(...options);select.disabled=!options.length;
      const match=saved?findWheelDevice(this.wheel.devices,saved,hint):undefined,old=this.wheel.devices.find(p=>String(p.index)===previous);
      select.value=String((match??old??this.wheel.devices[0])?.index??'');
    }
    if(changed){this.learning=undefined;if(this.step>=0){this.step=-1;this.draft=undefined;this.message('연결 장치가 바뀌었습니다. 보정을 다시 시작하세요.');}this.showStep();}
  }
  private showTuning(){for(const id of ['deadzone','sensitivity'])this.node('wheel-'+id+'-value').textContent=this.node<HTMLInputElement>('wheel-'+id).value+'%';}
  private showBindings(){for(const action of WHEEL_ACTIONS)this.node('wheel-bind-'+action).textContent=this.draft?.buttons[action]!==null&&this.draft?.buttons[action]!==undefined?`버튼 ${this.draft.buttons[action]!+1}`:'지정';}
  private showStep(){
    const step=STEPS[this.step];this.node('wheel-step-count').textContent=step?`${this.step+1} / ${STEPS.length} · 입력 보정`:'입력 보정';
    this.node('wheel-step-title').textContent=step?.[0]??(this.draft?'보정된 입력을 확인하세요':'장치를 선택해 주세요');
    this.node('wheel-step-description').textContent=step?.[1]??(this.draft?'페달과 휠을 움직여 아래 표시를 확인하고 패들·버튼을 지정하세요.':'보정 시작을 누른 뒤 화면 안내에 따라 휠과 페달을 움직이세요.');
    this.node('wheel-next').hidden=!step;this.node('wheel-calibrate').textContent=this.draft?'다시 보정':'보정 시작';
    this.node('wheel-bindings').hidden=!this.draft;this.node<HTMLButtonElement>('wheel-save').disabled=!this.draft||!validWheelProfile(this.draft)||!!step;this.showBindings();
  }
  private capture(){
    const wheel=this.selected('wheel-device'),pedals=this.selected('wheel-pedals');if(!wheel||!pedals){this.message('장치를 연결하고 버튼을 한 번 눌러주세요.');return;}
    const axes=Array.from(wheel.axes),pedalAxes=Array.from(pedals.axes);
    if(this.step===0)this.center=axes;
    if(this.step===1){const axis=changedAxis(this.center,axes);if(axis<0){this.message('조향 움직임이 충분하지 않습니다. 왼쪽으로 더 돌려 유지하세요.');return;}this.steering={axis,center:this.center[axis],left:axes[axis],right:this.center[axis]};}
    if(this.step===2){const s=this.steering!;if(!Number.isFinite(axes[s.axis])||(s.left-s.center)*(axes[s.axis]-s.center)>=0||Math.abs(axes[s.axis]-s.center)<.15){this.message('반대 방향으로 충분히 돌린 상태에서 기록하세요.');return;}s.right=axes[s.axis];}
    const buttonValues=pedals.buttons.map(b=>b.value);
    if(this.step===3){this.throttleRest=pedalAxes;this.throttleButtons=buttonValues;}
    if(this.step===4){const binding=changedPedal(this.throttleRest,pedalAxes,this.throttleButtons,buttonValues,wheel.index===pedals.index?this.steering!.axis:-1);if(!binding){this.message('가속 페달 입력을 찾지 못했습니다. 페달 장치 선택과 드라이버 설정을 확인하세요.');return;}this.throttle=binding;}
    if(this.step===5){this.brakeRest=pedalAxes;this.brakeButtons=buttonValues;}
    if(this.step===6){
      const brake=changedPedal(this.brakeRest,pedalAxes,this.brakeButtons,buttonValues,wheel.index===pedals.index?this.steering!.axis:-1);if(!brake){this.message('브레이크 입력을 찾지 못했습니다. 브레이크만 끝까지 밟아주세요.');return;}
      const throttle={...this.throttle!};
      if(throttle.source===brake.source&&throttle.index===brake.index&&Math.abs(throttle.rest-brake.rest)<=.15){const rest=(throttle.rest+brake.rest)/2;throttle.rest=brake.rest=rest;}
      const buttons=this.draft?.deviceId===wheel.id?{...this.draft.buttons}:Object.fromEntries(WHEEL_ACTIONS.map(action=>[action,null])) as WheelProfile['buttons'];
      for(const action of WHEEL_ACTIONS)if(wheel.index===pedals.index&&[throttle,brake].some(p=>p.source==='button'&&buttons[action]===p.index))buttons[action]=null;
      const draft:WheelProfile={version:1,deviceId:wheel.id,pedalDeviceId:pedals.id,deviceIndex:wheel.index,pedalIndex:pedals.index,enabled:true,steering:{...this.steering!},throttle,brake,buttons,deadzone:.02,sensitivity:1};
      if(!validWheelProfile(draft)){this.message('가속과 브레이크가 같은 입력으로 기록됐습니다. 올바른 페달을 각각 밟고 다시 보정하세요.');return;}
      this.draft=draft;
    }
    this.step++;this.message(this.step===7?'보정 완료 · 페달을 놓고 버튼을 지정한 뒤 저장하세요.':'');this.showStep();
  }
  private tick=(now:number)=>{
    if(!this.element.open)return;this.wheel.poll();this.refreshDevices();const wheel=this.selected('wheel-device'),pedals=this.selected('wheel-pedals');
    if(this.learning&&wheel){
      const held=this.buttons(wheel),button=[...held].find(index=>!this.learning!.held.has(index));
      if(button!==undefined&&this.draft){const action=this.learning.action,duplicate=WHEEL_ACTIONS.find(a=>a!==action&&this.draft!.buttons[a]===button);
        const pedalButton=wheel.index===pedals?.index&&[this.draft.throttle,this.draft.brake].some(p=>p.source==='button'&&p.index===button);
        if(pedalButton)this.message('이 버튼은 페달 입력에 사용 중입니다. 다른 버튼을 선택하세요.');
        else if(duplicate)this.message(`이 버튼은 ‘${LABELS[duplicate]}’에 사용 중입니다. 기존 지정을 해제하거나 다른 버튼을 선택하세요.`);
        else{this.draft.buttons[action]=button;this.message(`${LABELS[action]} · 버튼 ${button+1} 지정 완료`);this.showBindings();}this.learning=undefined;
      }else if(now>this.learning.until){this.message('버튼 지정 시간이 지났습니다. ‘지정’을 눌러 다시 시도하세요.');this.learning=undefined;}else this.learning.held=held;
    }
    if(now-this.lastPaint>80){
      this.lastPaint=now;this.node('wheel-detection').textContent=!this.wheel.supported?this.wheel.status:wheel?`연결됨 · 축 ${wheel.axes.length}개 / 버튼 ${wheel.buttons.length}개`:'연결된 장치가 없습니다. 휠 버튼을 한 번 눌러주세요.';
      this.node<HTMLButtonElement>('wheel-calibrate').disabled=!wheel||!pedals;
      this.node<HTMLButtonElement>('wheel-next').disabled=!wheel||!pedals;
      this.node<HTMLButtonElement>('wheel-save').disabled=!wheel||!pedals||!this.draft||!validWheelProfile(this.draft)||!!STEPS[this.step];
      if(wheel&&pedals&&this.draft){
        const p=this.draft,steer=steeringValue(wheel.axes[p.steering.axis]??p.steering.center,{...p,deadzone:Number(this.node<HTMLInputElement>('wheel-deadzone').value)/100,sensitivity:Number(this.node<HTMLInputElement>('wheel-sensitivity').value)/100});
        for(const [name,value] of [['steer',steer],['throttle',pedalValue(pedalRaw(pedals,p.throttle)??p.throttle.rest,p.throttle)],['brake',pedalValue(pedalRaw(pedals,p.brake)??p.brake.rest,p.brake)]] as const){
          this.node<HTMLMeterElement>('wheel-'+name).value=value;this.node('wheel-'+name+'-value').textContent=(name==='steer'?(value>.01?'좌 ':value<-.01?'우 ':''):'')+Math.round(Math.abs(value)*100)+'%';
        }
      }
      this.node('wheel-raw').textContent=wheel?`휠: ${Array.from(wheel.axes).slice(0,16).map((v,i)=>`${i+1}: ${v.toFixed(2)}`).join(' · ')}\n페달: ${Array.from(pedals?.axes??[]).slice(0,16).map((v,i)=>`${i+1}: ${v.toFixed(2)}`).join(' · ')}`:'';
    }
    this.frame=requestAnimationFrame(this.tick);
  };
}
let setup:WheelSetup|undefined;
export function openWheelSetup(){(setup??=new WheelSetup()).open();}
