/** Standing start: successive positions are staggered by 8m, with 16m
 * between cars in the same column. Distances stay negative until the line. */
export function gridSlot(position:number){
  if(!Number.isInteger(position)||position<1)throw new RangeError('Invalid grid position');
  return {meters:-8*position,lane:position%2?-3:3};
}
