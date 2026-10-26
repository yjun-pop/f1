import {Vehicle} from './Vehicle';

/** Continuous telemetry, also shared by the audio regression tests. */
export function soundTelemetry(car:Pick<Vehicle,'speed'|'throttle'|'brake'|'lateralSpeed'|'gripUsage'|'offRoad'>){
  const speed=Math.max(0,car.speed),gear=Math.min(8,1+Math.floor(speed/12));
  const rpm=1400+Math.min(1,(speed-(gear-1)*12)/14)*10000+car.throttle*700;
  const moving=Math.min(1,speed/18);
  return {rpm,engine:.035+car.throttle*.075+moving*.025,
    brake:car.brake*moving*.035,
    tire:Math.min(1,Math.max(0,(car.gripUsage-.72)*1.5)+Math.abs(car.lateralSpeed)/9)*moving*.065,
    road:moving*(car.offRoad?.065:.009)};
}
interface Voice {car:Vehicle;engine:OscillatorNode;harmonic:OscillatorNode;gain:GainNode;pan:StereoPannerNode}
export class DrivingAudio {
  private context?:AudioContext;private master?:GainNode;private voices:Voice[]=[];
  private brake?:GainNode;private tire?:GainNode;private road?:GainNode;
  private volume=.65;private muted=false;private active=false;
  constructor(){try{const saved=localStorage.getItem('apex-audio-volume');if(saved!==null&&Number.isFinite(Number(saved)))this.volume=Math.max(0,Math.min(1,Number(saved)));}catch{}}
  get level(){return this.volume;}
  get isMuted(){return this.muted;}
  setVolume(value:number){this.volume=Math.max(0,Math.min(1,value));try{localStorage.setItem('apex-audio-volume',String(this.volume));}catch{}this.applyGain();}
  toggleMute(){this.muted=!this.muted;this.applyGain();}
  // Called synchronously from a real user gesture, never from animation autoplay.
  unlock(cars:Vehicle[]){
    try{
      if(!this.context){
        const context=new AudioContext();this.context=context;
        const master=context.createGain(),compressor=context.createDynamicsCompressor();
        master.gain.value=0;master.connect(compressor);compressor.connect(context.destination);this.master=master;
        for(const car of cars){
          const engine=context.createOscillator(),harmonic=context.createOscillator(),gain=context.createGain(),pan=context.createStereoPanner(),filter=context.createBiquadFilter();
          engine.type='sawtooth';harmonic.type='triangle';filter.type='lowpass';filter.frequency.value=1700;gain.gain.value=0;
          engine.connect(filter);harmonic.connect(filter);filter.connect(gain);gain.connect(pan);pan.connect(master);engine.start();harmonic.start();
          this.voices.push({car,engine,harmonic,gain,pan});
        }
        const buffer=context.createBuffer(1,context.sampleRate*2,context.sampleRate),data=buffer.getChannelData(0);
        for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
        const noise=(frequency:number,q:number)=>{const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();source.buffer=buffer;source.loop=true;filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=q;gain.gain.value=0;source.connect(filter);filter.connect(gain);gain.connect(master);source.start();return gain;};
        this.brake=noise(2300,3);this.tire=noise(1100,.8);this.road=noise(320,.5);
      }
      void this.context.resume().catch(()=>{});this.applyGain();
    }catch{
      // Discard a partial graph too: unsupported audio must never break driving.
      if(this.context)void this.context.close().catch(()=>{});
      this.context=undefined;this.master=undefined;this.voices=[];
      this.brake=undefined;this.tire=undefined;this.road=undefined;
    }
  }
  private applyGain(){if(this.context&&this.master)this.master.gain.setTargetAtTime(this.active&&!this.muted?this.volume:0,this.context.currentTime,.025);}
  update(player:Vehicle,active:boolean){
    if(active!==this.active){this.active=active;this.applyGain();}
    const context=this.context;if(!context||!active)return;
    const now=context.currentTime;
    for(const voice of this.voices){
      const car=voice.car,sample=soundTelemetry(car),self=car===player;
      const dx=car.position.x-player.position.x,dz=car.position.z-player.position.z,distance=Math.hypot(dx,dz);
      const attenuation=self?1:.48/(1+(distance/13)**2);
      voice.engine.frequency.setTargetAtTime(sample.rpm/60*2,now,.045);
      voice.harmonic.frequency.setTargetAtTime(sample.rpm/60*4,now,.045);
      voice.gain.gain.setTargetAtTime(sample.engine*attenuation,now,.035);
      voice.pan.pan.setTargetAtTime(self?0:Math.max(-1,Math.min(1,(-dx*Math.cos(player.heading)+dz*Math.sin(player.heading))/Math.max(8,distance))),now,.06);
    }
    const sample=soundTelemetry(player);
    this.brake!.gain.setTargetAtTime(sample.brake,now,.04);this.tire!.gain.setTargetAtTime(sample.tire,now,.04);this.road!.gain.setTargetAtTime(sample.road,now,.07);
  }
  silence(){this.active=false;this.applyGain();}
}
