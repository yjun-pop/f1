import {MONZA_POINTS,MONZA_LENGTH,MONZA_SECTIONS,MONZA_ORIGIN} from './MonzaLayout';
import {SILVERSTONE_COORDINATES,SPA_COORDINATES} from './CircuitLayouts';
import {MONACO_COORDINATES,SUZUKA_COORDINATES,INTERLAGOS_COORDINATES,SINGAPORE_COORDINATES,MONTREAL_COORDINATES} from './AdditionalCircuitLayouts';
export type CircuitId='monza'|'silverstone'|'spa'|'monaco'|'suzuka'|'interlagos'|'singapore'|'montreal';
type Coordinate=readonly [number,number];
interface CircuitSection {number:number;name:string;coordinate:readonly number[];braking?:boolean}
interface Gate {section:number;offset:number}
export interface CircuitDefinition {
  id:CircuitId;name:string;label:string;country:string;length:number;cornerCount:number;
  description:string;tagline:string;origin:readonly number[];points:readonly (readonly number[])[];
  sections:readonly CircuitSection[];formationEnd:number;referenceLap:number;woodlandDensity:number;pitProgress:number;
  drs?:readonly {id:string;detection:Gate;start:Gate;end:Gate}[];
  aiControlMargins?:readonly {from:Gate;to:Gate;margin:number}[];
  environment?:'city'|'park';night?:boolean;
  tunnel?:{from:number;to:number};
  overpass?:{progress:number;lowerProgress:number;span:number;height:number};
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
  description:'긴 직선과 11개 코너, 몬자 퀵 레이스.',tagline:'TEMPLE OF SPEED',origin:MONZA_ORIGIN,points:MONZA_POINTS,
  sections:MONZA_SECTIONS.map(s=>({...s,braking:[1,4,6,7,8,11].includes(s.number)})),formationEnd:1300,referenceLap:88,woodlandDensity:26,pitProgress:.035
};
export const SILVERSTONE:CircuitDefinition={
  id:'silverstone',name:'SILVERSTONE',label:'실버스톤',country:'GREAT BRITAIN',length:5891,cornerCount:18,
  description:'18개 코너와 고속 연속 S자, 실버스톤 퀵 레이스.',tagline:'HOME OF BRITISH RACING',
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
  description:'긴 케멜 직선과 라 소스 헤어핀, 스파 퀵 레이스.',tagline:'ARDENNES CHALLENGE',
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
export const MONACO:CircuitDefinition={
  id:'monaco',name:'MONACO',label:'모나코',country:'MONACO',length:3337,cornerCount:19,
  description:'모나코 19코너 · 퀵 레이스.',tagline:'HARBOUR GRAND PRIX',
  ...geographicLayout(MONACO_COORDINATES,116,0.5),formationEnd:700,referenceLap:73,woodlandDensity:0,pitProgress:0,environment:'city',
  sections:sections(MONACO_COORDINATES,[[1,"SAINTE DEVOTE",128,true],[2,"BEAU RIVAGE",145,false],[3,"MASSENET",6,true],[4,"CASINO",10,false],[5,"MIRABEAU HAUT",18,true],[6,"FAIRMONT HAIRPIN",22,true],[7,"MIRABEAU BAS",30,true],[8,"PORTIER",38,true],[9,"TUNNEL",48,false],[10,"NOUVELLE CHICANE",55,true],[11,"NOUVELLE EXIT",60,false],[12,"TABAC",67,true],[13,"LOUIS CHIRON",77,false],[14,"PISCINE ENTRY",84,false],[15,"PISCINE",87,true],[16,"PISCINE EXIT",92,false],[17,"LA RASCASSE",101,true],[18,"ANTONY NOGHES",110,true],[19,"FINAL TURN",113,false]]),
  drs:[{"id":"HARBOUR STRAIGHT","detection":{"section":17,"offset":35},"start":{"section":19,"offset":35},"end":{"section":1,"offset":-100}}],
  tunnel:{from:8,to:10},
};
export const SUZUKA:CircuitDefinition={
  id:'suzuka',name:'SUZUKA',label:'스즈카',country:'JAPAN',length:5807,cornerCount:18,
  description:'스즈카 18코너 · 퀵 레이스.',tagline:'FIGURE EIGHT',
  ...geographicLayout(SUZUKA_COORDINATES,0,0),formationEnd:1100,referenceLap:102,woodlandDensity:16,pitProgress:0,environment:'park',
  sections:sections(SUZUKA_COORDINATES,[[1,"FIRST CURVE",6,true],[2,"FIRST CURVE EXIT",12,false],[3,"S CURVES",23,false],[4,"S CURVES",30,false],[5,"S CURVES",38,false],[6,"S CURVES",45,false],[7,"DUNLOP",54,false],[8,"DEGNER 1",63,true],[9,"DEGNER 2",67,true],[10,"HAIRPIN APPROACH",75,false],[11,"HAIRPIN",82,true],[12,"200R",96,false],[13,"SPOON 1",111,true],[14,"SPOON 2",119,false],[15,"130R",145,false],[16,"CASIO TRIANGLE",155,true],[17,"CASIO EXIT",158,false],[18,"FINAL CURVE",166,false]]),
  drs:[{"id":"MAIN STRAIGHT","detection":{"section":16,"offset":30},"start":{"section":18,"offset":50},"end":{"section":1,"offset":-160}}],
  overpass:{progress:.80784,lowerProgress:.39984,span:150,height:6.5},
  // Degner's rapid turn-in needs transient yaw/braking reserve in a pack.
  aiControlMargins:[{from:gate(8,-170),to:gate(9,110),margin:.86}],
};
export const INTERLAGOS:CircuitDefinition={
  id:'interlagos',name:'INTERLAGOS',label:'인터라고스',country:'BRAZIL',length:4309,cornerCount:15,
  description:'인터라고스 15코너 · 퀵 레이스.',tagline:'SENNA S',
  ...geographicLayout(INTERLAGOS_COORDINATES,0,0),formationEnd:1000,referenceLap:76,woodlandDensity:11,pitProgress:0,environment:'park',
  sections:sections(INTERLAGOS_COORDINATES,[[1,"S DO SENNA",6,true],[2,"S DO SENNA EXIT",12,false],[3,"CURVA DO SOL",24,false],[4,"DESCIDA DO LAGO",39,true],[5,"LAGO EXIT",50,false],[6,"FERRADURA",63,true],[7,"LARANJINHA",78,false],[8,"S CURVE",85,true],[9,"PINHEIRINHO",95,true],[10,"BICO DE PATO",110,true],[11,"MERGULHO",120,false],[12,"JUNCAO",135,true],[13,"SUBIDA DOS BOXES",150,false],[14,"ARQUIBANCADAS",161,false],[15,"FINAL CURVE",169,false]]),
  drs:[{"id":"RETA OPOSTA","detection":{"section":2,"offset":30},"start":{"section":3,"offset":30},"end":{"section":4,"offset":-140}},{"id":"PIT STRAIGHT","detection":{"section":13,"offset":25},"start":{"section":14,"offset":15},"end":{"section":1,"offset":-140}}],
};
export const SINGAPORE:CircuitDefinition={
  id:'singapore',name:'SINGAPORE',label:'마리나 베이',country:'SINGAPORE',length:4940,cornerCount:19,
  description:'마리나 베이 19코너 · 퀵 레이스.',tagline:'RACE UNDER THE LIGHTS',
  ...geographicLayout(SINGAPORE_COORDINATES,0,0),formationEnd:1100,referenceLap:94,woodlandDensity:0,pitProgress:0,environment:'city',night:true,
  sections:sections(SINGAPORE_COORDINATES,[[1,"SHEARES 1",4,true],[2,"SHEARES 2",9,false],[3,"SHEARES 3",13,true],[4,"REPUBLIC",15,false],[5,"RAFFLES",24,true],[6,"RAFFLES BOULEVARD",29,false],[7,"MEMORIAL",40,true],[8,"STAMFORD",46,true],[9,"PADANG",54,true],[10,"SINGAPORE SLING",60,false],[11,"VICTORIA",68,true],[12,"ANDERSON BRIDGE",75,false],[13,"ESPLANADE",80,true],[14,"BAYFRONT",87,true],[15,"MARINA STRAIGHT",91,false],[16,"BAY CHICANE",100,true],[17,"BAY CHICANE EXIT",105,false],[18,"FINAL COMPLEX",110,true],[19,"FINAL TURN",114,false]]),
  drs:[{"id":"RAFFLES","detection":{"section":3,"offset":10},"start":{"section":4,"offset":35},"end":{"section":5,"offset":-120}},{"id":"MARINA","detection":{"section":12,"offset":30},"start":{"section":13,"offset":40},"end":{"section":14,"offset":-100}},{"id":"PIT STRAIGHT","detection":{"section":18,"offset":10},"start":{"section":19,"offset":35},"end":{"section":1,"offset":-110}}],
  aiControlMargins:[{from:gate(14,-160),to:gate(15,110),margin:.84}],
};
export const MONTREAL:CircuitDefinition={
  id:'montreal',name:'MONTREAL',label:'질 빌뇌브',country:'CANADA',length:4361,cornerCount:14,
  description:'질 빌뇌브 14코너 · 퀵 레이스.',tagline:'WALL OF CHAMPIONS',
  ...geographicLayout(MONTREAL_COORDINATES,0,0),formationEnd:850,referenceLap:76,woodlandDensity:18,pitProgress:0,environment:'park',
  sections:sections(MONTREAL_COORDINATES,[[1,"SENNA S",8,true],[2,"SENNA S EXIT",15,false],[3,"FIRST CHICANE",24,true],[4,"FIRST CHICANE EXIT",28,false],[5,"CURVE 5",35,false],[6,"SECOND CHICANE",40,true],[7,"SECOND CHICANE EXIT",44,false],[8,"THIRD CHICANE",62,true],[9,"THIRD CHICANE EXIT",66,false],[10,"L EPINGLE",79,true],[11,"HAIRPIN EXIT",85,false],[12,"CASINO STRAIGHT",92,false],[13,"CHAMPIONS CHICANE",97,true],[14,"WALL OF CHAMPIONS",100,false]]),
  drs:[{"id":"BACK STRAIGHT","detection":{"section":5,"offset":15},"start":{"section":7,"offset":30},"end":{"section":8,"offset":-120}},{"id":"CASINO","detection":{"section":10,"offset":10},"start":{"section":11,"offset":25},"end":{"section":13,"offset":-140}},{"id":"PIT STRAIGHT","detection":{"section":10,"offset":10},"start":{"section":14,"offset":25},"end":{"section":1,"offset":-120}}],
};
export const CIRCUITS:readonly CircuitDefinition[]=[MONZA,SILVERSTONE,SPA,MONACO,SUZUKA,INTERLAGOS,SINGAPORE,MONTREAL];
export function circuitById(value:unknown):CircuitDefinition{return CIRCUITS.find(c=>c.id===value)??MONZA;}
/** URL takes precedence, allowing a circuit to be bookmarked or shared. */
export function selectedCircuit(search:string,saved:unknown):CircuitDefinition {
  const id=new URLSearchParams(search).get('circuit');return circuitById(id??saved);
}
export function circuitURL(href:string,id:CircuitId,autoStart=false){const url=new URL(href);url.searchParams.set('circuit',id);if(autoStart)url.searchParams.set('race','start');else url.searchParams.delete('race');return url.href;}
