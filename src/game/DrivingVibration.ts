/** Continuous road/engine vibration: 3x at first gear, rising linearly to 6x
 * at eighth. Event impulses and the user's strength setting stay independent. */
export function drivingVibrationGain(gear:number){
  const selected=Number.isFinite(gear)?Math.max(1,Math.min(8,gear)):1;
  return 3*(1+(selected-1)/7);
}
