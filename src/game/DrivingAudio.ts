import type {Vehicle} from './Vehicle';
import {windLevel,type DrivingFeedbackFrame} from './DrivingFeedback';
import {EngineSoundState,ENGINE_TIMBRES,soundTelemetry} from './EngineSound';
export {soundTelemetry} from './EngineSound';
interface Voice {
  car:Vehicle;state:EngineSoundState;low:OscillatorNode;high:OscillatorNode;
  lowGain:GainNode;highGain:GainNode;turbo:OscillatorNode;turboGain:GainNode;
  body:OscillatorNode;bodyGain:GainNode;bodyFilter:BiquadFilterNode;bodyShelf:BiquadFilterNode;
  pulse:OscillatorNode;pulseDepth:GainNode;previousLoad:number;previousCut:number;thump:number;
  texture:GainNode;filter:BiquadFilterNode;shelf:BiquadFilterNode;gain:GainNode;pan:StereoPannerNode;
}
export class DrivingAudio {
  private context?:AudioContext;private master?:GainNode;private voices:Voice[]=[];
  private brake?:GainNode;private tire?:GainNode;private road?:GainNode;private wind?:GainNode;private kerb?:GainNode;
  private volume=.65;private muted=false;private active=false;private lastUpdate=0;
  constructor(){try{const saved=localStorage.getItem('apex-audio-volume');if(saved!==null&&Number.isFinite(Number(saved)))this.volume=Math.max(0,Math.min(1,Number(saved)));}catch{}}
  get level(){return this.volume;}
  get isMuted(){return this.muted;}
  setVolume(value:number){this.volume=Math.max(0,Math.min(1,value));try{localStorage.setItem('apex-audio-volume',String(this.volume));}catch{}this.applyGain();}
  toggleMute(){this.muted=!this.muted;this.applyGain();}
  // Create and resume synchronously inside the original user gesture.
  unlock(cars:Vehicle[]){
    try{
      if(!this.context){
        const context=new AudioContext();this.context=context;this.lastUpdate=context.currentTime;
        const master=context.createGain(),compressor=context.createDynamicsCompressor();
        compressor.threshold.value=-14;compressor.knee.value=16;compressor.ratio.value=3;
        master.gain.value=0;master.connect(compressor);compressor.connect(context.destination);this.master=master;
        const buffer=context.createBuffer(1,context.sampleRate*2,context.sampleRate),data=buffer.getChannelData(0);
        // Seeded texture avoids regenerating an unbounded collection of sources.
        let seed=157;for(let i=0;i<data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)|0;data[i]=seed/2147483648;}
        const noise=(frequency:number,q:number,destination:AudioNode)=>{
          const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();
          source.buffer=buffer;source.loop=true;filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=q;gain.gain.value=0;
          source.connect(filter);filter.connect(gain);gain.connect(destination);source.start();return gain;
        };
        const waves=ENGINE_TIMBRES.map(profile=>({
          low:context.createPeriodicWave(new Float32Array(profile.low.length),Float32Array.from(profile.low)),
          high:context.createPeriodicWave(new Float32Array(profile.high.length),Float32Array.from(profile.high))
        }));
        // Low exhaust orders keep their audible 60–200Hz body on smaller
        // speakers, while avoiding an inaudible sub-bass-only sine tone.
        const bodyWave=context.createPeriodicWave(new Float32Array(5),new Float32Array([0,1,.45,.2,.08]));
        cars.forEach((car,index)=>{
          const low=context.createOscillator(),high=context.createOscillator(),lowGain=context.createGain(),highGain=context.createGain();
          const gain=context.createGain(),pan=context.createStereoPanner(),filter=context.createBiquadFilter();
          // Player: Ferrari reference. Rivals cycle Honda/Mercedes/Renault/Ferrari.
          const wave=waves[index%waves.length];low.setPeriodicWave(wave.low);high.setPeriodicWave(wave.high);
          lowGain.gain.value=1;highGain.gain.value=0;gain.gain.value=0;filter.type='lowpass';filter.frequency.value=3600;filter.Q.value=.5;
          const shelf=context.createBiquadFilter();shelf.type='highshelf';shelf.frequency.value=2500;shelf.gain.value=-5;
          low.connect(lowGain);high.connect(highGain);lowGain.connect(filter);highGain.connect(filter);
          const turbo=context.createOscillator(),turboGain=context.createGain();turbo.type='sine';turboGain.gain.value=0;turbo.connect(turboGain);turboGain.connect(filter);
          const body=context.createOscillator(),bodyGain=context.createGain(),bodyFilter=context.createBiquadFilter();
          body.setPeriodicWave(bodyWave);bodyGain.gain.value=0;bodyFilter.type='lowpass';bodyFilter.frequency.value=220;bodyFilter.Q.value=.5;
          body.connect(bodyFilter);bodyFilter.connect(bodyGain);bodyGain.connect(filter);
          const pulse=context.createOscillator(),pulseDepth=context.createGain();pulse.type='sine';pulseDepth.gain.value=0;
          pulse.connect(pulseDepth);pulseDepth.connect(bodyGain.gain);
          const bodyShelf=context.createBiquadFilter();bodyShelf.type='lowshelf';bodyShelf.frequency.value=180;bodyShelf.gain.value=2.5;
          const texture=noise(1500,.55,filter);filter.connect(shelf);shelf.connect(bodyShelf);bodyShelf.connect(gain);gain.connect(pan);pan.connect(master);
          low.start();high.start();turbo.start();body.start();pulse.start();
          this.voices.push({car,state:new EngineSoundState(),low,high,lowGain,highGain,turbo,turboGain,body,bodyGain,bodyFilter,bodyShelf,pulse,pulseDepth,previousLoad:0,previousCut:1,thump:0,texture,filter,shelf,gain,pan});
        });
        this.brake=noise(2300,3,master);this.tire=noise(1100,.8,master);this.road=noise(320,.5,master);this.wind=noise(900,.45,master);this.kerb=noise(430,.8,master);
      }
      void this.context.resume().catch(()=>{});this.applyGain();
    }catch{
      if(this.context)void this.context.close().catch(()=>{});
      this.context=undefined;this.master=undefined;this.voices=[];
      this.brake=undefined;this.tire=undefined;this.road=undefined;this.wind=undefined;this.kerb=undefined;
    }
  }
  private applyGain(){if(this.context&&this.master)this.master.gain.setTargetAtTime(this.active&&!this.muted?this.volume:0,this.context.currentTime,.025);}
  update(player:Vehicle,active:boolean,feedback?:DrivingFeedbackFrame){
    if(active!==this.active){this.active=active;this.lastUpdate=this.context?.currentTime??0;this.applyGain();}
    const context=this.context;if(!context||!active)return;
    const now=context.currentTime,dt=Math.max(1/240,Math.min(.1,now-this.lastUpdate||1/60));this.lastUpdate=now;
    for(const voice of this.voices){
      const car=voice.car,self=car===player,sample=self&&feedback?feedback.engine:voice.state.advance(car,dt);
      const dx=car.position.x-player.position.x,dz=car.position.z-player.position.z,distance=Math.hypot(dx,dz);
      const attenuation=self?1:.4/(1+(distance/13)**2);
      // The measured reference has ~100Hz periodic spacing at high RPM;
      // upper harmonics, rather than two unrelated notes, carry its engine timbre.
      voice.low.frequency.setTargetAtTime(sample.rpm/120,now,.015);voice.high.frequency.setTargetAtTime(sample.rpm/120,now,.015);
      const mix=Math.max(0,Math.min(1,(sample.rpm-7500)/4300))*(.4+.6*sample.load);
      voice.lowGain.gain.setTargetAtTime(Math.sqrt(1-mix),now,.04);voice.highGain.gain.setTargetAtTime(Math.sqrt(mix),now,.04);
      voice.filter.frequency.setTargetAtTime(2100+sample.load*1800+(sample.rpm-3800)*.06,now,.05);
      voice.turbo.frequency.setTargetAtTime(1700+sample.rpm*.3,now,.06);voice.turboGain.gain.setTargetAtTime(sample.load*.006,now,.04);
      voice.texture.gain.setTargetAtTime(.015+sample.load*.055+sample.blip*.03,now,.03);
      const engagement=voice.previousCut<.9&&sample.cut>=.9;
      voice.thump=Math.max(voice.thump*Math.exp(-dt*14),Math.max(0,sample.load-voice.previousLoad)*.20,engagement?.18:0);
      voice.previousLoad=sample.load;voice.previousCut=sample.cut;
      const bodyLevel=(.14+sample.load*.30+voice.thump)*(self?1:.55);
      voice.body.frequency.setTargetAtTime(Math.max(32,Math.min(72,sample.rpm/180)),now,.025);
      voice.bodyGain.gain.setTargetAtTime(bodyLevel,now,.015);
      voice.pulse.frequency.setTargetAtTime(16+sample.rpm*.0009,now,.04);
      voice.pulseDepth.gain.setTargetAtTime(bodyLevel*.09,now,.02);
      voice.gain.gain.setTargetAtTime(sample.engine*sample.cut*attenuation,now,.012);
      voice.pan.pan.setTargetAtTime(self?0:Math.max(-1,Math.min(1,(-dx*Math.cos(player.heading)+dz*Math.sin(player.heading))/Math.max(8,distance))),now,.06);
    }
    const sample=soundTelemetry(player);
    this.wind!.gain.setTargetAtTime(feedback?.wind??windLevel(player.speed),now,.14);
    this.kerb!.gain.setTargetAtTime((feedback?.kerb??0)*Math.min(1,player.speed/25)*.045,now,.025);
    this.brake!.gain.setTargetAtTime(sample.brake,now,.04);this.tire!.gain.setTargetAtTime(sample.tire,now,.04);this.road!.gain.setTargetAtTime(sample.road,now,.07);
  }
  silence(){this.active=false;this.applyGain();}
}
