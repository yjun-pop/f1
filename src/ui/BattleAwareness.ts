export interface ProximityPose {position:{x:number;y?:number;z:number};heading:number;speed:number;lateralSpeed?:number}
export interface ProximityCar {id:string;car:ProximityPose}
export interface NearbyCar {id:string;forward:number;lateral:number;angle:number;close:boolean;approaching:boolean}
/** Read current physical poses each render frame, with no timers or held alerts. */
export function proximityCues(player:ProximityPose,cars:readonly ProximityCar[]){
  const sin=Math.sin(player.heading),cos=Math.cos(player.heading),nearby:NearbyCar[]=[];
  let left='',right='';
  for(const {id,car} of cars){
    const dx=car.position.x-player.position.x,dz=car.position.z-player.position.z;
    if(dx*dx+dz*dz>50*50||Math.abs((car.position.y??0)-(player.position.y??0))>3.5)continue;
    const forward=dx*sin+dz*cos,lateral=dx*cos-dz*sin;
    if(forward < -40||forward>35||Math.abs(lateral)>12)continue;
    const angle=car.heading-player.heading,closing=car.speed*Math.cos(angle)-(car.lateralSpeed??0)*Math.sin(angle)-player.speed;
    const ttc=forward<0?(-forward-5)/Math.max(.01,closing):(forward-5)/Math.max(.01,-closing);
    const approaching=ttc>0&&ttc<3&&(forward<0?closing>1:closing < -1);
    const close=Math.abs(forward)<6&&Math.abs(lateral)<4;
    nearby.push({id,forward,lateral,angle,close,approaching});
    if(Math.abs(lateral)<.75||Math.abs(lateral)>10||Math.abs(forward)>=9&&!approaching)continue;
    const label=close?'근접':Math.abs(forward)<9?'나란히':'접근';
    if(lateral<0){if(left!=='근접'&&(left!=='나란히'||close))left=label;}
    else if(right!=='근접'&&(right!=='나란히'||close))right=label;
  }
  return {left,right,cars:nearby};
}
