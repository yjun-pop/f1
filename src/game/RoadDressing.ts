import * as THREE from 'three';
import type {Track} from './Track';
import {terrainMaps} from './SurfaceTextures';
import {createTrackChunks} from './TrackChunks';

/** Curved rubber deposits and gravel beds follow the visual track boundary. */
export function createRoadDressing(track:Track){
  const group=new THREE.Group();group.name='road-dressing';
  const rubberPositions:number[]=[],rubberUV:number[]=[],rubberIndices:number[]=[],rubberColors:number[]=[],rubberProgress:number[]=[],gravelPositions:number[]=[],gravelUV:number[]=[],gravelIndices:number[]=[],gravelProgress:number[]=[],gravelColors:number[]=[];
  const sections=track.sections.filter(s=>s.braking??[1,4,6,7,8,11].includes(s.number));
  for(const section of sections){
    const t=section.progress,a=track.tangent(t-20/track.length),b=track.tangent(t+20/track.length),turn=Math.sign(a.z*b.x-a.x*b.z)||1;
    for(const wheel of [-1,1]){
      const base=rubberPositions.length/3;
      for(let i=0;i<=80;i++){
        const metres=-130+i*2.3,progress=t+metres/track.length,p=track.roadPoint(progress),n=track.roadNormal(progress);
        const cornerBlend=Math.exp(-((metres/55)**2)),lane=-turn*(1.7+cornerBlend*1.4)+wheel*.78,width=(.19+cornerBlend*.17)*(.94+.06*Math.sin(i*.31+section.number));
        const fade=THREE.MathUtils.smoothstep(i,0,18)*(1-THREE.MathUtils.smoothstep(i,58,80));
        for(const side of [-1,1]){rubberPositions.push(p.x+n.x*(lane+side*width),.044,p.z+n.z*(lane+side*width));rubberUV.push((side+1)/2,i/6);rubberColors.push(1,1,1,fade);rubberProgress.push(progress);}
        if(i<80){const k=base+i*2;rubberIndices.push(k,k+1,k+2,k+1,k+3,k+2);}
      }
    }
    const base=gravelPositions.length/3;
    for(let i=0;i<=64;i++){
      const progress=t+(i-32)*2/track.length,p=track.roadPoint(progress),n=track.roadNormal(progress),edge=Math.sin(i/64*Math.PI)**.55;
      for(const outer of [false,true]){const offset=11.08+(outer?4.7*edge:0),shade=.91+.06*Math.sin(p.x*.039+p.z*.027);gravelPositions.push(p.x+n.x*turn*offset,-.074,p.z+n.z*turn*offset);gravelUV.push((outer?4.7*edge:0)/2,i);gravelProgress.push(progress);gravelColors.push(shade,shade,shade);}
      if(i<64){const k=base+i*2;gravelIndices.push(k,k+1,k+2,k+1,k+3,k+2);}
    }
  }
  const mesh=(positions:number[],uv:number[],indices:number[],material:THREE.Material)=>{const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();const mesh=new THREE.Mesh(geometry,material);mesh.receiveShadow=true;return mesh;};
  const size=64,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=(y*size+x)*4,edge=Math.sin(x/(size-1)*Math.PI)**1.8,grain=.5+.5*Math.sin(x*3.7+y*1.3)*Math.sin(y*2.1);data[i]=data[i+1]=data[i+2]=18;data[i+3]=edge*(.45+grain*.55)*255;}
  const texture=new THREE.DataTexture(data,size,size);texture.wrapT=THREE.RepeatWrapping;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;
  const marks=mesh(rubberPositions,rubberUV,rubberIndices,new THREE.MeshBasicMaterial({map:texture,vertexColors:true,transparent:true,opacity:.27,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1}));marks.geometry.setAttribute('color',new THREE.Float32BufferAttribute(rubberColors,4));marks.geometry.setAttribute('progress',new THREE.Float32BufferAttribute(rubberProgress,1));
  const gravel=mesh(gravelPositions,gravelUV,gravelIndices,new THREE.MeshStandardMaterial({...terrainMaps('gravel'),color:0xf5efe2,vertexColors:true,roughness:1,side:THREE.DoubleSide}));gravel.geometry.setAttribute('progress',new THREE.Float32BufferAttribute(gravelProgress,1));gravel.geometry.setAttribute('color',new THREE.Float32BufferAttribute(gravelColors,3));
  for(const [source,name] of [[marks,'curved-rubber'],[gravel,'gravel-runoff']] as const){track.surfaceGeometries.set(name,source.geometry);group.add(createTrackChunks(source.geometry,source.material,track.length,name,400));}return group;
}
