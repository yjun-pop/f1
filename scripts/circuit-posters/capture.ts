import * as THREE from 'three';
import {Track} from '../../src/game/Track';
import {circuitById,type CircuitId} from '../../src/game/Circuits';
import {WorldLighting} from '../../src/game/WorldLighting';
import {environmentFor} from '../../src/game/CircuitEnvironment';
const INTRO_SECTIONS:Record<CircuitId,readonly number[]>={
  monza:[1,6,8,11],silverstone:[18,10,12,15],spa:[3,5,10,18],
  monaco:[6,8,10,15],suzuka:[18,3,11,15],interlagos:[1,4,10,12],
  singapore:[5,12,14,16],montreal:[1,6,10,14]
};
function shotFor(track:Track,index:number){
    const focus=new THREE.Vector3(),forward=new THREE.Vector3(),normal=new THREE.Vector3();
    const number=INTRO_SECTIONS[track.circuit.id][index];
    const section=track.sections.find(s=>s.number===number)!;
    focus.copy(track.roadPoint(section.progress));focus.y+=2;
    // Compose landmark shots around their actual built context. A road-only
    // anchor can leave the hotel/terraces behind the camera after safe siting.
    const id=track.circuit.id,pit=track.group.getObjectByName('pit-building');
    if(pit&&(id==='silverstone'&&number===18||id==='montreal'&&number===14)){
      focus.lerp(pit.position,.75);focus.y+=7;
    }
    if(id==='monaco'&&number===8&&track.tunnel){
      focus.copy(track.roadPoint(track.tunnel.start+125/track.length));focus.y+=12;
    }
    const sites=track.group.userData.venueArchitecture?.sites as {name:string;frame:{p:THREE.Vector3}}[]|undefined;
    const site=sites?.find(s=>id==='spa'&&number===3&&s.name==='spa-raidillon-terraces'||id==='singapore'&&number===12&&s.name==='singapore-fullerton-colonnade');
    if(site){focus.lerp(site.frame.p,.6);focus.y+=id==='singapore'?9:4;}
    if(id==='suzuka'&&number===18){
      const wheel=track.group.getObjectByName('suzuka-ferris-wheel')?.userData.geographicAnchor?.placed as THREE.Vector3|undefined;
      if(wheel){focus.lerp(wheel,.55);focus.y+=16;}
    }
    // This basis stays fixed for the whole shot, including sharp chicanes.
    forward.copy(track.tangent(section.progress));normal.copy(track.roadNormal(section.progress));
    return {focus,forward,normal,name:section.name};
  }

const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1600,900);renderer.setPixelRatio(1);renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;document.body.append(renderer.domElement);
let previous:THREE.Scene|undefined,lighting:WorldLighting|undefined;
(window as any).captureCircuit=(id:CircuitId)=>{
 if(previous){previous.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});lighting?.dispose();renderer.renderLists.dispose();}
 const scene=new THREE.Scene(),environment=environmentFor(id);lighting=new WorldLighting(scene,renderer,'medium',!!circuitById(id).night,environment);const track=new Track(scene,circuitById(id));previous=scene;
 renderer.toneMappingExposure=environment.exposure;const camera=new THREE.PerspectiveCamera(57,1600/900,.5,1500),shot=shotFor(track,0);
 camera.position.copy(shot.focus).addScaledVector(shot.forward,-85).addScaledVector(shot.normal,45);camera.position.y+=environment.city?62:42;camera.lookAt(shot.focus);track.updatePresentation(camera.position,'medium');lighting.sun.target.position.copy(shot.focus);lighting.sun.position.copy(shot.focus).add(lighting.sunOffset);renderer.shadowMap.needsUpdate=true;renderer.render(scene,camera);
 return renderer.domElement.toDataURL('image/webp',.8);
};
