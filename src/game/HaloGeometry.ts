import * as THREE from 'three';

/** A broad, flattened safety beam with rounded shoulders, rather than a pipe. */
export function createHaloGeometry(points:readonly (readonly number[])[],halfDepth:number,halfHeight:number,segments=48){
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(p[0],p[1],p[2]))),positions:number[]=[],uv:number[]=[],indices:number[]=[],sides=12;
  for(let row=0;row<=segments;row++){
    const t=row/segments,p=curve.getPoint(t),tangent=curve.getTangent(t),across=new THREE.Vector3(-tangent.z,0,tangent.x).normalize(),up=across.clone().cross(tangent).normalize();
    for(let side=0;side<=sides;side++){
      const angle=side/sides*Math.PI*2,c=Math.cos(angle),s=Math.sin(angle),q=p.clone().addScaledVector(across,Math.sign(c)*Math.abs(c)**.65*halfDepth).addScaledVector(up,Math.sign(s)*Math.abs(s)**.65*halfHeight);
      positions.push(q.x,q.y,q.z);uv.push(t*3,side/sides);
      if(row<segments&&side<sides){const k=row*(sides+1)+side;indices.push(k,k+sides+1,k+1,k+1,k+sides+1,k+sides+2);}
    }
  }
  for(const row of [0,segments])for(let side=1;side<sides-1;side++){
    const k=row*(sides+1);if(row===0)indices.push(k,k+side,k+side+1);else indices.push(k,k+side+1,k+side);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

/** Short tapered structural blade, attached below the arch with no aerial. */
export function createHaloSupport(top:THREE.Vector3,bottom:THREE.Vector3){
  const vertices:number[]=[],indices:number[]=[];
  for(const [p,width] of [[top,.028],[bottom,.044]] as const)for(const [x,z] of [[-1,-1],[1,-1],[1,1],[-1,1]])vertices.push(p.x+x*width/2,p.y,p.z+z*.028);
  for(const [a,b,c,d] of [[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]])indices.push(a,b,c,a,c,d);
  const uv:number[]=[];for(let i=0;i<vertices.length;i+=3)uv.push(vertices[i]*3,vertices[i+1]*3);
  const indexed=new THREE.BufferGeometry();indexed.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));indexed.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));indexed.setIndex(indices);const geometry=indexed.toNonIndexed();indexed.dispose();geometry.computeVertexNormals();return geometry;
}
