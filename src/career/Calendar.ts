import type {CareerSave} from './Career';

// Fictional career calendar. First three indices retain the saved original venues.
export const SEASON=[
 {circuit:'monza',name:'이탈리아 · 몬자',month:3,day:9},
 {circuit:'silverstone',name:'영국 · 실버스톤',month:4,day:6},
 {circuit:'spa',name:'벨기에 · 스파',month:4,day:20},
 {circuit:'monaco',name:'모나코',month:5,day:11},
 {circuit:'montreal',name:'캐나다 · 몬트리올',month:6,day:8},
 {circuit:'suzuka',name:'일본 · 스즈카',month:6,day:22},
 {circuit:'silverstone',name:'영국 · 실버스톤',month:7,day:13},
 {circuit:'spa',name:'벨기에 · 스파',month:8,day:10},
 {circuit:'monza',name:'이탈리아 · 몬자',month:9,day:7},
 {circuit:'singapore',name:'싱가포르',month:9,day:21},
 {circuit:'interlagos',name:'브라질 · 인터라고스',month:10,day:12},
 {circuit:'suzuka',name:'일본 · 스즈카',month:11,day:9}
] as const;
export interface CareerCalendar {month:number;day:number;meetings:number[];legacyContract?:boolean}
const days=[31,28,31,30,31,30,31,31,30,31,30,31];
export const dayOfYear=(date:{month:number;day:number})=>days.slice(0,date.month-1).reduce((s,n)=>s+n,0)+date.day;
const fromDay=(day:number)=>{let month=1;while(day>days[month-1])day-=days[month++-1];return {month,day};};
export const dateLabel=(date:{month:number;day:number})=>`${date.month}월 ${date.day}일`;
export function calendarFor(save:CareerSave):CareerCalendar {
 if(save.calendar)return structuredClone(save.calendar);
 // Existing contract terms and paid rewards survive the longer calendar.
 const date=save.round?fromDay(dayOfYear(SEASON[save.round-1])+1):{month:1,day:save.phase==='season'?15:1};
 return {...date,meetings:[],...(save.phase==='season'?{legacyContract:true}:{})};
}
export function validCalendar(save:CareerSave){
 const c=save.calendar;
 if(c===undefined)return save.round<=3;
 if(!c||!Number.isInteger(c.month)||c.month<1||c.month>12||!Number.isInteger(c.day)||c.day<1||c.day>days[c.month-1]||!Array.isArray(c.meetings)||c.meetings.length>11||new Set(c.meetings).size!==c.meetings.length||!c.meetings.every(m=>Number.isInteger(m)&&m>=1&&m<=11&&m<=c.month)||c.legacyContract!==undefined&&typeof c.legacyContract!=='boolean')return false;
 if(save.phase!=='season')return c.month===1&&save.round===0;
 const day=dayOfYear(c),last=save.round?dayOfYear(SEASON[save.round-1])+1:15;
 return day>=last&&(!SEASON[save.round]||day<=dayOfYear(SEASON[save.round]));
}
export function raceReady(save:CareerSave){const e=SEASON[save.round];return save.phase==='season'&&!!e&&dayOfYear(calendarFor(save))===dayOfYear(e);}
export function nextAppointment(save:CareerSave){
 const c=calendarFor(save),day=dayOfYear(c),race=SEASON[save.round];
 if(save.round===0&&day<dayOfYear({month:2,day:10}))return {kind:'test' as const,name:'프리시즌 테스트',month:2,day:10};
 if(race)return {kind:'race' as const,...race};
 if(day<dayOfYear({month:12,day:1}))return {kind:'summary' as const,name:'시즌 결산',month:12,day:1};
 return null;
}
export function advanceCalendar(save:CareerSave):CareerSave {
 const next=nextAppointment(save);
 if(save.phase!=='season'||save.debrief||!next||raceReady(save))throw Error('먼저 예정된 경기를 완료하세요.');
 return {...structuredClone(save),calendar:{...calendarFor(save),month:next.month,day:next.day},saveId:crypto.randomUUID()};
}
export function meetingAvailable(save:CareerSave){const c=calendarFor(save);return save.phase==='season'&&!save.debrief&&save.round<SEASON.length&&c.month<12&&!c.meetings.includes(c.month)&&!raceReady(save);}
export function sponsorMeeting(save:CareerSave):CareerSave {
 if(!meetingAvailable(save))throw Error('이번 달에는 미팅을 진행할 수 없습니다.');
 const c=calendarFor(save),next=nextAppointment(save),date=fromDay(Math.min(dayOfYear(c)+7,next?dayOfYear(next):365));
 return {...structuredClone(save),money:save.money+1500,calendar:{...c,...date,meetings:[...c.meetings,c.month]},saveId:crypto.randomUUID()};
}
