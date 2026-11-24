/** Visual identity is derived from the saved contract; it never changes car performance. */
export const CAR_LIVERIES={
 academy:{name:'DRIVER ACADEMY',primary:0xe3eaf0,secondary:0x173744,accent:0xf5b64b,pattern:'training'},
 atlas:{name:'ATLAS RACING',primary:0xff967d,secondary:0x30232b,accent:0xffe4bd,pattern:'bands'},
 vector:{name:'VECTOR MOTORSPORT',primary:0x65d6c3,secondary:0x102d43,accent:0xf1fbff,pattern:'chevron'},
 helix:{name:'HELIX PERFORMANCE',primary:0xbda0ff,secondary:0x222033,accent:0xd0f67a,pattern:'twin'}
} as const;
export type LiveryTeam=keyof typeof CAR_LIVERIES;
export interface CarIdentity {team:LiveryTeam;number:number}
export function carIdentity(team:unknown,number:unknown):CarIdentity|undefined{
 if(typeof team!=='string'||!Object.hasOwn(CAR_LIVERIES,team)||typeof number!=='number'||!Number.isInteger(number)||number<2||number>99)return undefined;
 return {team:team as LiveryTeam,number};
}
export interface OpponentIdentity {id:string;appearance:CarIdentity}
