import * as THREE from 'three';

export function freezeStaticWorld(root:THREE.Object3D){
  root.updateMatrixWorld(true);root.traverse(object=>{
    if(object instanceof THREE.InstancedMesh){if(!object.boundingSphere)object.computeBoundingSphere();}
    else if(object instanceof THREE.Mesh&&!object.geometry.boundingSphere)object.geometry.computeBoundingSphere();
    object.matrixAutoUpdate=false;object.matrixWorldAutoUpdate=false;
  });
}

/** Share vertex buffers, but give each local index batch an actual local bound. */
export function createTrackChunks(geometry:THREE.BufferGeometry,material:THREE.Material,length:number,name:string){
  const group=new THREE.Group();group.name=name;
  const count=Math.ceil(length/100),buckets=Array.from({length:count},()=>[] as number[]),source=geometry.index!,progress=geometry.getAttribute('progress'),uv=geometry.getAttribute('uv'),position=geometry.getAttribute('position');
  for(let i=0;i<source.count;i+=3){
    const a=source.getX(i),b=source.getX(i+1),c=source.getX(i+2),t=progress?(progress.getX(a)+progress.getX(b)+progress.getX(c))/3:(uv.getY(a)+uv.getY(b)+uv.getY(c))*4/(3*length);
    buckets[Math.min(count-1,Math.max(0,Math.floor(t*count)))].push(a,b,c);
  }
  const point=new THREE.Vector3();
  for(let i=0;i<count;i++)if(buckets[i].length){
    const local=new THREE.BufferGeometry();for(const name of Object.keys(geometry.attributes))local.setAttribute(name,geometry.getAttribute(name));local.setIndex(buckets[i]);
    const box=new THREE.Box3();for(const index of buckets[i])box.expandByPoint(point.fromBufferAttribute(position,index));local.boundingBox=box;local.boundingSphere=box.getBoundingSphere(new THREE.Sphere());
    const mesh=new THREE.Mesh(local,material);mesh.name=`${name}-${i}`;mesh.receiveShadow=true;group.add(mesh);
  }
  return group;
}
