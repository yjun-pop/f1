export const DEFAULT_FIELD_SIZE=12;
/** Separate cars/controllers with different risk, line, pace and reaction preferences. */
export const DRIVER_PROFILES=[
  {name:'NOVA',personality:'공격형',caution:.25,launch:.99,color:0x31bca6,pace:1.46,aggression:.92,reaction:.025,lineBias:-.35},
  {name:'VECTOR',personality:'전략형',caution:.65,launch:1.01,color:0x2564d3,pace:1.38,aggression:.45,reaction:.03,lineBias:.55},
  {name:'SOLAR',personality:'균형형',caution:.5,launch:1,color:0xeab442,pace:1.42,aggression:.72,reaction:.027,lineBias:-.7},
  {name:'POLAR',personality:'신중형',caution:.9,launch:.98,color:0xc6cdd1,pace:1.36,aggression:.25,reaction:.035,lineBias:.3},
  {name:'ORBIT',personality:'추월형',caution:.35,launch:1.02,color:0x9768d1,pace:1.45,aggression:.83,reaction:.025,lineBias:.8},
  {name:'TITAN',personality:'제동 승부형',caution:.4,launch:1.01,color:0xc04436,pace:1.44,aggression:.88,reaction:.033,lineBias:-.9},
  {name:'AURORA',personality:'기회 대기형',caution:.8,launch:.99,color:0xe28bb6,pace:1.37,aggression:.38,reaction:.041,lineBias:.65},
  {name:'RAPTOR',personality:'압박형',caution:.32,launch:1,color:0xe0802e,pace:1.45,aggression:.95,reaction:.029,lineBias:-.55},
  {name:'COMET',personality:'탈출 가속형',caution:.48,launch:1.02,color:0x4daccb,pace:1.43,aggression:.78,reaction:.037,lineBias:1},
  {name:'SPECTRA',personality:'바깥쪽 공략형',caution:.6,launch:.98,color:0x82a950,pace:1.40,aggression:.62,reaction:.043,lineBias:-1},
  {name:'PULSE',personality:'에너지 관리형',caution:.55,launch:1,color:0xd5c5a8,pace:1.41,aggression:.67,reaction:.039,lineBias:.45}
] as const;
