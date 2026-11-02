import type {CircuitId} from './Circuits';

export type GeoPoint=readonly [longitude:number,latitude:number];
export interface EnvironmentProfile {
  region:string;ground:number;foliage:number;trunk:number;trees:'deciduous'|'conifer'|'tropical';
  density:number;horizon:number;zenith:number;fog:number;sun:number;ambient:number;exposure:number;
  hillHeight:number;hillDirection:number;city?:'riviera'|'paulista'|'marina';
  landmarks:readonly {id:string;at:GeoPoint;kind:'wheel'|'dome'|'hotel'|'hangar'|'banking'|'bridge';height:number;angle?:number}[];
}

/** Geographic anchors are approximate WGS84 locations. Models are original,
 * lightweight interpretations of the surroundings, not surveyed buildings.
 * Regional references and geographic limitations: docs/CIRCUIT_ENVIRONMENTS.md. */
export const CIRCUIT_ENVIRONMENTS:Record<CircuitId,EnvironmentProfile>={
  monza:{region:'Parco di Monza · Lombardy',ground:0xb2c393,foliage:0x769451,trunk:0x635748,trees:'deciduous',density:36,horizon:0xb6ccdc,zenith:0x4f82b4,fog:0xb6ccdc,sun:0xfff3d8,ambient:0x697352,exposure:.98,hillHeight:0,hillDirection:0,
    landmarks:[{id:'monza-old-banking',at:[9.2868,45.6240],kind:'banking',height:6.5}]},
  silverstone:{region:'Northamptonshire · former RAF airfield',ground:0xc5c69b,foliage:0x84946b,trunk:0x6d6658,trees:'deciduous',density:7,horizon:0xcbd2db,zenith:0x879db6,fog:0xcbd2db,sun:0xf2f5ff,ambient:0x757766,exposure:.96,hillHeight:0,hillDirection:0,
    landmarks:[{id:'silverstone-airfield-hangars',at:[-1.0210,52.0782],kind:'hangar',height:13}]},
  spa:{region:'Ardennes · Wallonia',ground:0x8fa47c,foliage:0x527751,trunk:0x635447,trees:'conifer',density:40,horizon:0xb4c4c9,zenith:0x608599,fog:0xb4c4c9,sun:0xf2f4e6,ambient:0x475849,exposure:.94,hillHeight:135,hillDirection:-.6,
    landmarks:[{id:'spa-ardennes-lodge',at:[5.9693,50.4460],kind:'hotel',height:17}]},
  monaco:{region:'Port Hercule · Côte d’Azur',ground:0xb1b694,foliage:0x62805d,trunk:0x88745b,trees:'tropical',density:0,horizon:0xbedcde,zenith:0x467fb3,fog:0xbedcde,sun:0xffebc6,ambient:0x84836c,exposure:1.03,hillHeight:155,hillDirection:-2.1,city:'riviera',
    landmarks:[{id:'monaco-harbour-hotel',at:[7.4271,43.7390],kind:'hotel',height:30}]},
  suzuka:{region:'Suzuka · Mie · amusement park',ground:0xaec28e,foliage:0x638d57,trunk:0x685844,trees:'deciduous',density:22,horizon:0xc6d9df,zenith:0x6a9fb9,fog:0xc6d9df,sun:0xfff1db,ambient:0x5f7852,exposure:.98,hillHeight:55,hillDirection:-2.5,
    landmarks:[{id:'suzuka-ferris-wheel',at:[136.5381,34.8460],kind:'wheel',height:50}]},
  interlagos:{region:'Interlagos · São Paulo',ground:0xb9b98a,foliage:0x70934e,trunk:0x7b624d,trees:'tropical',density:12,horizon:0xc5c8c6,zenith:0x7a9faa,fog:0xc5c8c6,sun:0xffe3bc,ambient:0x827b5e,exposure:1.02,hillHeight:65,hillDirection:1.4,city:'paulista',
    landmarks:[{id:'interlagos-city-tower',at:[-46.6910,-23.6990],kind:'hotel',height:60}]},
  singapore:{region:'Marina Bay · Singapore',ground:0x5a6571,foliage:0x365e53,trunk:0x5b5149,trees:'tropical',density:0,horizon:0x1e304c,zenith:0x030914,fog:0x16283d,sun:0xc5daff,ambient:0x34495c,exposure:.98,hillHeight:0,hillDirection:0,city:'marina',
    landmarks:[{id:'singapore-flyer',at:[103.86397,1.28935],kind:'wheel',height:150},{id:'marina-bay-sands',at:[103.8608,1.2834],kind:'hotel',height:185}]},
  montreal:{region:'Île Notre-Dame · Saint Lawrence River',ground:0x9eb892,foliage:0x6b9a67,trunk:0x6d6053,trees:'deciduous',density:26,horizon:0xc1d9df,zenith:0x6899b6,fog:0xc1d9df,sun:0xf5f6e4,ambient:0x5e7562,exposure:.98,hillHeight:0,hillDirection:0,
    landmarks:[{id:'montreal-biosphere',at:[-73.5312,45.5141],kind:'dome',height:60},{id:'jacques-cartier-bridge',at:[-73.5290,45.5192],kind:'bridge',height:58}]}
};

export function environmentFor(id:CircuitId){return CIRCUIT_ENVIRONMENTS[id];}

/** Only background terrain rises. The road and driving physics are unchanged. */
export function regionalHeight(x:number,z:number,profile:EnvironmentProfile){
  if(!profile.hillHeight)return 0;
  const axis=x*Math.sin(profile.hillDirection)+z*Math.cos(profile.hillDirection);
  const waves=.5+.23*Math.sin(x*.0017+z*.0011)+.15*Math.cos(z*.0031-x*.0014)+.12*Math.sin(axis*.005);
  const ridge=profile.city==='riviera'?smoothStep(axis,250,1400):profile.trees==='deciduous'?smoothStep(axis,200,1400):1;
  return Math.max(0,waves)*profile.hillHeight*ridge;
}

function smoothStep(x:number,a:number,b:number){const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);}
