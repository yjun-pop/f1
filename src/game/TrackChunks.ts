import * as THREE from 'three';

function chunkMesh(source:THREE.BufferGeometry,indices:number[],material:THREE.Material,name:string){
  const geometry=new THREE.BufferGeometry();for(const key of Object.keys(source.attributes))geometry.setAttribute(key,source.getAttribute(key));geometry.setIndex(indices);
  const box=new THREE.Box3(),point=new THREE.Vector3(),position=source.getAttribute('position');
  for(const index of new Set(indices))box.expandByPoint(point.fromBufferAttribute(position,index));
  geometry.boundingBox=box;geometry.boundingSphere=box.getBoundingSphere(new THREE.Sphere());
  const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.receiveShadow=true;return mesh;
}

export function freezeStaticWorld(root:THREE.Object3D){
  root.updateMatrixWorld(true);root.traverse(object=>{
    if(object instanceof THREE.InstancedMesh){if(!object.boundingSphere)object.computeBoundingSphere();}
    else if(object instanceof THREE.Mesh&&!object.geometry.boundingSphere)object.geometry.computeBoundingSphere();
    object.matrixAutoUpdate=false;object.matrixWorldAutoUpdate=false;
  });
}

/** Share vertex buffers, but give each local index batch an actual local bound. */
export function createTrackChunks(geometry:THREE.BufferGeometry,material:THREE.Material,length:number,name:string,chunkLength=100){
  const group=new THREE.Group();group.name=name;
  const count=Math.ceil(length/chunkLength),buckets=Array.from({length:count},()=>[] as number[]),source=geometry.index!,progress=geometry.getAttribute('progress'),uv=geometry.getAttribute('uv');
  for(let i=0;i<source.count;i+=3){
    const a=source.getX(i),b=source.getX(i+1),c=source.getX(i+2);let t:number;
    if(progress){const anchor=progress.getX(a),next=progress.getX(b),last=progress.getX(c);t=((anchor+next-Math.round(next-anchor)+last-Math.round(last-anchor))/3%1+1)%1;}
    else t=(uv.getY(a)+uv.getY(b)+uv.getY(c))*4/(3*length);
    buckets[Math.min(count-1,Math.max(0,Math.floor(t*count)))].push(a,b,c);
  }
  for(let i=0;i<count;i++)if(buckets[i].length){
    group.add(chunkMesh(geometry,buckets[i],material,`${name}-${i}`));
  }
  return group;
}

/** Cull distant terrain tiles without duplicating any source vertex buffers. */
export function createSpatialChunks(geometry:THREE.BufferGeometry,material:THREE.Material,cellSize:number,name:string){
  const group=new THREE.Group();group.name=name;const buckets=new Map<string,number[]>(),position=geometry.getAttribute('position'),index=geometry.index!;
  for(let i=0;i<index.count;i+=3){
    const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2),x=(position.getX(a)+position.getX(b)+position.getX(c))/3,z=(position.getZ(a)+position.getZ(b)+position.getZ(c))/3,key=`${Math.floor(x/cellSize)}/${Math.floor(z/cellSize)}`;
    const bucket=buckets.get(key)??[];bucket.push(a,b,c);buckets.set(key,bucket);
  }
  for(const [key,indices] of buckets)group.add(chunkMesh(geometry,indices,material,`${name}-${key}`));return group;
}
