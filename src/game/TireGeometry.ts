import * as THREE from 'three';
export const TIRE_RADIUS=.455;
/** One continuous slick carcass, with a flat tread and rounded shoulders. */
export function createTireGeometry(width:number){
  const half=width/2;
  const profile=[
    [.285,-.92],[.33,-1],[.388,-1],[.423,-.94],[.444,-.82],[.453,-.64],[TIRE_RADIUS,-.42],
    [TIRE_RADIUS,0],[TIRE_RADIUS,.42],[.453,.64],[.444,.82],[.423,.94],[.388,1],[.33,1],[.285,.92]
  ];
  const geometry=new THREE.LatheGeometry(profile.map(([radius,axial])=>new THREE.Vector2(radius,axial*half)),64);
  geometry.rotateZ(-Math.PI/2);return geometry;
}
/** Lettering follows the rubber surface; no flat disc or raised trim ring. */
export function createTireLetteringGeometry(tire:THREE.BufferGeometry,width:number,side:number){
  const points=tire.getAttribute('position'),normals=tire.getAttribute('normal'),indices=tire.index!;
  const positions:number[]=[],normalValues:number[]=[],uvs:number[]=[];
  for(let i=0;i<indices.count;i+=3){
    const triangle=[indices.getX(i),indices.getX(i+1),indices.getX(i+2)];
    if(!triangle.every(index=>points.getX(index)*side>width*.35))continue;
    for(const index of triangle){
      const x=points.getX(index),y=points.getY(index),z=points.getZ(index),nx=normals.getX(index),ny=normals.getY(index),nz=normals.getZ(index);
      positions.push(x+nx*.00035,y+ny*.00035,z+nz*.00035);normalValues.push(nx,ny,nz);uvs.push(.5-side*z/(2*TIRE_RADIUS),.5+y/(2*TIRE_RADIUS));
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normalValues,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));return geometry;
}
