export type StrategyMode='balanced'|'prepare'|'attack'|'defend'|'harvest'|'manage'|'finish';
interface Neighbour {id:object;gap:number;closing:number}
export interface StrategyObservation {
  elapsed:number;distance:number;speed:number;boost:number;gripUsage:number;lateralSpeed:number;
  window:boolean;brakingSoon:boolean;settling:boolean;pressure?:boolean;deploying?:boolean;drsAvailable?:boolean;ahead?:Neighbour;behind?:Neighbour;
}
export interface StrategyPlan {mode:StrategyMode;reserve:number;allowAttack:boolean;deploy:boolean;preferExit:boolean;driveScale:number}
/** Private race management per driver. It can only spend the car's actual
 * battery or reduce a driving demand; it cannot add grip, power or progress. */
export class RaceStrategy {
  mode:StrategyMode='balanced';tyreLoad=0;attacks=0;successfulAttacks=0;
  private previousTime?:number;private holdUntil=0;private target?:object;private recoveryUntil=0;
  private opportunities=new Map<number,{wins:number;losses:number}>();
  plan:StrategyPlan={mode:'balanced',reserve:30,allowAttack:true,deploy:true,preferExit:false,driveScale:1};
  constructor(private character:{aggression:number;caution:number;phase:number;personality:string}){}
  get status(){return {balanced:'페이스 유지',prepare:'공격 준비',attack:'추월 승부',defend:'ERS 방어',harvest:'에너지 회복',manage:'접지 부하 관리',finish:'마지막 스퍼트'}[this.mode];}
  get learnedOpportunities(){return this.opportunities.size;}
  reset(){this.mode='balanced';this.tyreLoad=this.attacks=this.successfulAttacks=0;this.previousTime=undefined;this.holdUntil=this.recoveryUntil=0;this.target=undefined;this.opportunities.clear();this.plan={mode:this.mode,reserve:30,allowAttack:true,deploy:true,preferExit:false,driveScale:1};}
  private sector(distance:number){return Math.floor(((distance%1+1)%1)*12);}
  recordPass(success:boolean,distance:number){
    const sector=this.sector(distance),memory=this.opportunities.get(sector)??{wins:0,losses:0};
    if(success){memory.wins++;this.successfulAttacks++;}else memory.losses++;
    this.opportunities.set(sector,memory);
  }
  onContact(time:number,distance:number){this.recordPass(false,distance);this.recoveryUntil=time+4+this.character.caution*2;this.target=undefined;this.holdUntil=0;}
  update(o:StrategyObservation):StrategyPlan{
    const dt=this.previousTime===undefined?0:Math.max(0,Math.min(.1,o.elapsed-this.previousTime));this.previousTime=o.elapsed;
    const slip=Math.abs(Math.atan2(o.lateralSpeed,Math.max(8,o.speed)));
    const load=Math.max(0,Math.min(1,(o.gripUsage-.94)*2.4+Math.max(0,slip-.055)*7));
    this.tyreLoad+=(load-this.tyreLoad)*(1-Math.exp(-dt*(load>this.tyreLoad?1.5:.4)));
    const c=this.character,manager=c.personality==='에너지 관리형',patient=c.personality==='기회 대기형'||c.caution>.75;
    const memory=this.opportunities.get(this.sector(o.distance)),learnedRisk=Math.max(0,Math.min(8,(memory?.losses??0)*3-(memory?.wins??0)));
    const reserve=18+(1-c.aggression)*20+(manager?10:0)+learnedRisk;
    const floor=Math.max(8,reserve-(patient?0:10));
    const final=o.distance>2.65&&o.distance<3,nearAhead=o.ahead&&o.ahead.gap>12&&o.ahead.gap<85;
    const defence=o.behind&&o.behind.gap>15&&o.behind.gap<42&&o.behind.closing>.5;
    const recovering=o.settling||o.elapsed<this.recoveryUntil||this.tyreLoad>.72;
    const committed=this.mode==='attack'&&this.target===o.ahead?.id&&o.elapsed<this.holdUntil;
    let mode:StrategyMode='balanced';
    if(recovering)mode='manage';
    else if(final&&o.boost>5)mode='finish';
    else if(this.mode==='harvest'&&o.boost<reserve+18&&!defence||o.boost<Math.max(12,floor-3))mode='harvest';
    else if(defence&&o.boost>floor&&o.window)mode='defend';
    else if(nearAhead){
      if(o.window&&!o.brakingSoon&&o.boost>floor&&(committed||o.ahead!.closing>-(patient?.2:1))){
        mode='attack';
        if(!committed){this.attacks++;this.target=o.ahead!.id;this.holdUntil=o.elapsed+3+c.aggression*2;}
      }else mode=o.boost<reserve?'harvest':'prepare';
    }
    if(mode!=='attack'){this.target=undefined;this.holdUntil=0;}
    this.mode=mode;
    // Banking energy must not strand a faster car in a train. A clear pass
    // using an existing speed advantage needs no extra ERS or engine power.
    const momentumPass=o.window&&!o.brakingSoon&&!!o.ahead&&(o.ahead.closing>2||!!o.drsAvailable&&o.ahead.closing>-.5);
    const allowAttack=!recovering&&(mode!=='harvest'&&o.boost>(final?5:floor)||momentumPass);
    const cruiseReserve=(o.pressure?22:reserve+(manager?22:10))-(o.deploying?8:0);
    const deploy=!o.brakingSoon&&o.window&&(mode==='attack'||mode==='defend'||mode==='finish'||mode==='balanced'&&o.boost>cruiseReserve);
    this.plan={mode,reserve:final?5:reserve,allowAttack,deploy,preferExit:patient||o.boost<reserve+8||this.tyreLoad>.45||learnedRisk>0,driveScale:recovering?1-this.tyreLoad*.08:1};
    return this.plan;
  }
}
