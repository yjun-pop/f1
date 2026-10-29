import {MONZA_POINTS,MONZA_LENGTH,MONZA_SECTIONS,MONZA_ORIGIN} from './MonzaLayout';
import {SILVERSTONE_COORDINATES,SPA_COORDINATES} from './CircuitLayouts';
export type CircuitId='monza'|'silverstone'|'spa';
type Coordinate=readonly [number,number];
interface CircuitSection {number:number;name:string;coordinate:readonly number[];braking?:boolean}
interface Gate {section:number;offset:number}
export interface CircuitDefinition {
  id:CircuitId;name:string;label:string;country:string;length:number;cornerCount:number;
  description:string;tagline:string;origin:readonly number[];points:readonly (readonly number[])[];
  sections:readonly CircuitSection[];formationEnd:number;referenceLap:number;woodlandDensity:number;pitProgress:number;
  drs?:readonly {id:string;detection:Gate;start:Gate;end:Gate}[];
  aiControlMargins?:readonly {from:Gate;to:Gate;margin:number}[];
}
function geographicLayout(coordinates:readonly Coordinate[],startIndex:number,startFraction=0){
  const a=coordinates[startIndex],b=coordinates[(startIndex+1)%coordinates.length];
  const origin=[a[0]+(b[0]-a[0])*startFraction,a[1]+(b[1]-a[1])*startFraction] as const;
  const ordered=startFraction>0?[origin,...coordinates.slice(startIndex+1),...coordinates.slice(0,startIndex+1)]:[...coordinates.slice(startIndex),...coordinates.slice(0,startIndex)];
  return {origin,points:ordered.map(([lon,lat])=>[(lon-origin[0])*111320*Math.cos(origin[1]*Math.PI/180),-(lat-origin[1])*111320])};
}
function sections(coordinates:readonly Coordinate[],anchors:readonly (readonly [number,string,number,boolean?])[]):CircuitSection[]{
  return anchors.map(([number,name,index,braking])=>({number,name,coordinate:coordinates[index],braking:!!braking}));
}
const gate=(section:number,offset:number):Gate=>({section,offset});
export const MONZA:CircuitDefinition={
  id:'monza',name:'MONZA',label:'몬자',country:'ITALY',length:MONZA_LENGTH,cornerCount:11,
  description:'긴 직선과 11개 코너, 몬자 3랩 스프린트.',tagline:'TEMPLE OF SPEED',origin:MONZA_ORIGIN,points:MONZA_POINTS,
  sections:MONZA_SECTIONS.map(s=>({...s,braking:[1,4,6,7,8,11].includes(s.number)})),formationEnd:1300,referenceLap:88,woodlandDensity:26,pitProgress:.035
};
export const SILVERSTONE:CircuitDefinition={
  id:'silverstone',name:'SILVERSTONE',label:'실버스톤',country:'GREAT BRITAIN',length:5891,cornerCount:18,
  description:'18개 코너와 고속 연속 S자, 실버스톤 3랩 스프린트.',tagline:'HOME OF BRITISH RACING',
  ...geographicLayout(SILVERSTONE_COORDINATES,70,.5),formationEnd:600,referenceLap:103,woodlandDensity:9,pitProgress:0,
  sections:sections(SILVERSTONE_COORDINATES,[
    [1,'ABBEY',75],[2,'FARM',80],[3,'VILLAGE',87,true],[4,'THE LOOP',93,true],[5,'AINTREE',104],
    [6,'BROOKLANDS',111,true],[7,'LUFFIELD',119],[8,'WOODCOTE',128],[9,'COPSE',5,true],
    [10,'MAGGOTTS',16],[11,'MAGGOTTS',21],[12,'BECKETTS',24,true],[13,'BECKETTS',27],[14,'CHAPEL',30],
    [15,'STOWE',42,true],[16,'VALE',55,true],[17,'VALE',58],[18,'CLUB',65]
  ]),
  drs:[{id:'WELLINGTON',detection:gate(3,-45),start:gate(5,100),end:gate(6,-150)},
    {id:'HANGAR',detection:gate(10,-70),start:gate(14,80),end:gate(15,-150)}]
};
export const SPA:CircuitDefinition={
  id:'spa',name:'SPA',label:'스파',country:'BELGIUM',length:7004,cornerCount:19,
  description:'긴 케멜 직선과 라 소스 헤어핀, 스파 3랩 스프린트.',tagline:'ARDENNES CHALLENGE',
  ...geographicLayout(SPA_COORDINATES,0),formationEnd:1300,referenceLap:114,woodlandDensity:30,pitProgress:0,
  // The flat geographic recreation has a rapid steering reversal here. Leave
  // transient tire/yaw reserve beyond the steady-state curvature envelope.
  aiControlMargins:[{from:gate(2,-160),to:gate(4,150),margin:.82}],
  sections:sections(SPA_COORDINATES,[
    [1,'LA SOURCE',3,true],[2,'EAU ROUGE',13],[3,'RAIDILLON',17],[4,'RAIDILLON',21],
    [5,'LES COMBES',33,true],[6,'LES COMBES',39],[7,'MALMEDY',43],[8,'BRUXELLES',51,true],
    [9,'NO NAME',59],[10,'POUHON',69,true],[11,'POUHON',76],[12,'FAGNES',85,true],[13,'FAGNES',94],
    [14,'STAVELOT',101],[15,'PAUL FRERE',110],[16,'BLANCHIMONT',123],[17,'BLANCHIMONT',132],
    [18,'BUS STOP',143,true],[19,'BUS STOP',148]
  ]),
  drs:[{id:'KEMMEL',detection:gate(2,-100),start:gate(4,110),end:gate(5,-160)},
    {id:'START FINISH',detection:gate(18,-160),start:gate(19,110),end:gate(1,-110)}]
};
export const CIRCUITS:readonly CircuitDefinition[]=[MONZA,SILVERSTONE,SPA];
export function circuitById(value:unknown):CircuitDefinition{return CIRCUITS.find(c=>c.id===value)??MONZA;}
/** URL takes precedence, allowing a circuit to be bookmarked or shared. */
export function selectedCircuit(search:string,saved:unknown):CircuitDefinition {
  const id=new URLSearchParams(search).get('circuit');return circuitById(id??saved);
}
export function circuitURL(href:string,id:CircuitId){const url=new URL(href);url.searchParams.set('circuit',id);return url.href;}
