export interface CollisionBody {position:{x:number;y:number;z:number};heading:number;speed:number;lateralSpeed?:number;yawRate?:number}
const TIMES=[.08,.16,.28,.4];
function pose(body:CollisionBody,t:number){
  const h=body.heading,w=body.yawRate??0,a=h+w*t,v=body.speed,l=body.lateralSpeed??0;
  const x=Math.abs(w)<.0001?(Math.sin(h)*v+Math.cos(h)*l)*t:(v*(Math.cos(h)-Math.cos(a))+l*(Math.sin(a)-Math.sin(h)))/w;
  const z=Math.abs(w)<.0001?(Math.cos(h)*v-Math.sin(h)*l)*t:(v*(Math.sin(a)-Math.sin(h))+l*(Math.cos(a)-Math.cos(h)))/w;
  return {x:body.position.x+x,z:body.position.z+z,sin:Math.sin(a),cos:Math.cos(a)};
}
function separation(a:ReturnType<typeof pose>,b:ReturnType<typeof pose>){
  let closest=Infinity;
  for(const x of [-1.45,0,1.45])for(const y of [-1.45,0,1.45]){
    const dx=a.x+a.sin*x-b.x-b.sin*y,dz=a.z+a.cos*x-b.z-b.cos*y;
    closest=Math.min(closest,dx*dx+dz*dz);
  }
  return closest;
}
/** Short, body-space safety check complements long track-progress plans.
 * Two lanes can converge at a tight chicane despite an apparent 8m track gap. */
export function contactWithin(own:CollisionBody,other:CollisionBody){
  if(Math.abs(own.position.y-other.position.y)>3.5)return null;
  const dx=other.position.x-own.position.x,dz=other.position.z-own.position.z;
  if(dx*dx+dz*dz>25*25)return null;
  const current=separation(pose(own,0),pose(other,0));
  for(const t of TIMES){const distance=separation(pose(own,t),pose(other,t));
    if(distance<2.35**2&&(distance<current-.02||current<2.15**2))return t;
  }
  return null;
}
