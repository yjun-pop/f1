import * as THREE from 'three';
import type {Track} from './Track';
import type {GeoPoint} from './CircuitEnvironment';

export interface WaterArea {name:string;points:THREE.Vector2[];bounds:THREE.Box2;holes?:THREE.Vector2[][]}
/** Simplified shore outlines in geographic space, clipped away from the road
 * when meshed. They replace arbitrary water rectangles beside the spline. */
export function regionalWaters(track:Track):WaterArea[]{
  const outlines:{name:string;points:GeoPoint[]}[]=track.circuit.id==='monaco'?[
    {name:'mediterranean-port-hercule',points:[[7.419,43.7308],[7.4223,43.7331],[7.4248,43.7333],[7.4232,43.7349],[7.4245,43.7369],[7.4275,43.738],[7.4295,43.7374],[7.4294,43.740],[7.445,43.740],[7.445,43.72],[7.414,43.72]]}
  ]:track.circuit.id==='singapore'?[
    {name:'marina-bay-water',points:[[103.850,1.279],[103.855,1.278],[103.861,1.283],[103.863,1.291],[103.858,1.291],[103.856,1.286],[103.852,1.285]]}
  ]:track.circuit.id==='montreal'?[
    {name:'saint-lawrence-north-channel',points:[[-73.548,45.507],[-73.536,45.518],[-73.530,45.515],[-73.535,45.505],[-73.535,45.493],[-73.547,45.487]]},
    {name:'saint-lawrence-seaway',points:[[-73.525,45.488],[-73.501,45.511],[-73.490,45.506],[-73.515,45.480]]},
    {name:'olympic-rowing-basin',points:[[-73.537,45.497],[-73.523,45.511],[-73.5218,45.5104],[-73.5358,45.4964]]}
  ]:[];
  // The old coarse shore polygon spilled through the inland side of the
  // Fairmont underpass. Keep the known landward corridor dry; do not invent a
  // lagoon between the coastal road and the hairpin neighbourhood.
  let inland:THREE.Vector2[]|undefined;
  if(track.circuit.id==='monaco'){
    const section=track.circuit.sections.find(s=>s.number===8)!,source=track.geographicPoint([section.coordinate[0],section.coordinate[1]]),count=Math.ceil(track.length/4);let closest=0,best=Infinity;
    for(let i=0;i<count;i++){const d=track.point(i/count).distanceToSquared(source);if(d<best){best=d;closest=i/count;}}
    const edge:THREE.Vector2[]=[],back:THREE.Vector2[]=[];
    for(let metres=20;metres<=360;metres+=10){const t=closest+metres/track.length,p=track.roadPoint(t),n=track.roadNormal(t);edge.push(new THREE.Vector2(p.x+n.x*12,p.z+n.z*12));back.push(new THREE.Vector2(p.x+n.x*210,p.z+n.z*210));}
    inland=[...edge,...back.reverse()];
  }
  return outlines.map(area=>{const points=area.points.map(p=>{const v=track.geographicPoint(p);return new THREE.Vector2(v.x,v.z);});return {name:area.name,points,bounds:new THREE.Box2().setFromPoints(points),holes:inland?[inland]:undefined};});
}
function insidePolygon(x:number,z:number,p:readonly THREE.Vector2[]){
  let inside=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i].y>z)!==(p[j].y>z)&&x<(p[j].x-p[i].x)*(z-p[i].y)/(p[j].y-p[i].y)+p[i].x)inside=!inside;return inside;
}
export function containsWater(x:number,z:number,areas:readonly WaterArea[]){
  return areas.some(area=>x>=area.bounds.min.x&&x<=area.bounds.max.x&&z>=area.bounds.min.y&&z<=area.bounds.max.y&&insidePolygon(x,z,area.points)&&!area.holes?.some(p=>insidePolygon(x,z,p)));
}
