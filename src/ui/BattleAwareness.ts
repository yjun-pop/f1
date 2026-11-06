export interface ProximityPose {position:{x:number;y?:number;z:number};heading:number;speed:number;lateralSpeed?:number}
export interface ProximityCar {id:string;car:ProximityPose}
export interface NearbyCar {id:string;forward:number;lateral:number;bearing:number;close:boolean;approaching:boolean}
/** Read current physical poses each render frame, with no timers or held alerts. */
export function proximityCues(player:ProximityPose,cars:readonly ProximityCar[]){
  const sin=Math.sin(player.heading),cos=Math.cos(player.heading),nearby:NearbyCar[]=[];
  for(const {id,car} of cars){
    const dx=car.position.x-player.position.x,dz=car.position.z-player.position.z;
    if(dx*dx+dz*dz>50*50||Math.abs((car.position.y??0)-(player.position.y??0))>3.5)continue;
    // The Three.js camera looks along +vehicle-forward. Its screen-right
    // axis is forward × up = (-cos, 0, sin), not the physics lateral axis.
    const forward=dx*sin+dz*cos,lateral=dz*sin-dx*cos;
    if(forward < -40||forward>35||Math.abs(lateral)>12)continue;
    const angle=car.heading-player.heading,closing=car.speed*Math.cos(angle)-(car.lateralSpeed??0)*Math.sin(angle)-player.speed;
    const ttc=forward<0?(-forward-5)/Math.max(.01,closing):(forward-5)/Math.max(.01,-closing);
    const approaching=ttc>0&&ttc<3&&(forward<0?closing>1:closing < -1);
    const close=Math.abs(forward)<6&&Math.abs(lateral)<4;
    if(Math.abs(forward)>12&&!approaching&&!close)continue;
    const bearing=Math.atan2(lateral,forward);
    // Rear-centred 270-degree fan; leave the forward +/-45 degrees clear.
    if(Math.abs(bearing)<Math.PI/4)continue;
    nearby.push({id,forward,lateral,bearing,close,approaching});
  }
  return {cars:nearby};
}
