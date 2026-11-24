import {DRIVER_PROFILES} from '../game/RaceRoster';
import {carIdentity,type OpponentIdentity} from '../game/CarLivery';
import type {CareerSave} from './Career';
export interface SeasonPartner {year:number;team:string;id:string;number:number}
const seats={atlas:{id:'ai:nova',number:14},vector:{id:'ai:solar',number:22},helix:{id:'ai:orbit',number:63}} as const;
export function makeSeasonPartner(year:number,team:string,playerNumber:number):SeasonPartner|undefined{
 if(!Object.hasOwn(seats,team))return undefined;const seat=seats[team as keyof typeof seats];
 return {year,team,id:seat.id,number:seat.number===playerNumber?seat.number+1:seat.number};
}
export function validSeasonPartner(save:CareerSave){
 const p=save.seasonPartner;if(p===undefined)return true;
 return !!p&&save.phase==='season'&&p.year===save.year&&p.team===save.team&&DRIVER_PROFILES.slice(0,5).some(d=>'ai:'+d.name.toLowerCase()===p.id)&&Number.isInteger(p.number)&&p.number>=2&&p.number<=99&&p.number!==save.driver.number;
}
export function teammateFor(save:CareerSave){
 if(save.phase!=='season'||!save.team)return undefined;
 const seat=save.seasonPartner??makeSeasonPartner(save.year,save.team,save.driver.number);
 const driver=seat&&DRIVER_PROFILES.find(d=>'ai:'+d.name.toLowerCase()===seat.id);
 return seat&&driver?{...seat,name:driver.name}:undefined;
}
export function teammateAppearance(save:CareerSave):OpponentIdentity|undefined{
 const mate=teammateFor(save),appearance=mate&&carIdentity(mate.team,mate.number);
 return mate&&appearance?{id:mate.id,appearance}:undefined;
}
/** Both totals use the same recorded rounds, never an estimated AI result. */
export function teammateComparison(save:CareerSave){
 const mate=teammateFor(save);if(!mate)return undefined;
 const races=(save.championship??[]).filter(r=>r.year===save.year&&r.round<save.round).sort((a,b)=>a.round-b.round);
 const paired=races.flatMap(r=>{const player=r.entries.find(e=>e.id==='PLAYER'),partner=r.entries.find(e=>e.id===mate.id);return player&&partner?[{round:r.round,player,partner}]:[];});
 const playerPoints=paired.length?paired.reduce((n,r)=>n+r.player.points,0):null,partnerPoints=paired.length?paired.reduce((n,r)=>n+r.partner.points,0):null;
 return {mate,games:paired.length,playerPoints,partnerPoints,gap:playerPoints===null||partnerPoints===null?null:playerPoints-partnerPoints,recent:paired.slice(-3).reverse(),latest:paired.at(-1)};
}
