
import * as Tone from 'tone';
import { AudioSettings } from '../types';

// Helper to check if context is running
export const ensureAudioContext = async () => {
    if (Tone.context.state !== 'running') {
        await Tone.start();
    }
};

// Safe Object URL Helper
export const safeCreateObjectURL = (blob: Blob | MediaSource | null): string => {
    if (!blob) return '';
    try {
        return URL.createObjectURL(blob);
    } catch (e) {
        console.error("Failed to create Object URL", e);
        return '';
    }
}

// WAV Encoder Helper
const audioBufferToBlob = (buffer: AudioBuffer): Blob => {
  const length = buffer.length * buffer.numberOfChannels * 2 + 44;
  const outBuffer = new ArrayBuffer(length);
  const view = new DataView(outBuffer);
  const channels = [];
  let i;
  let sample;
  let offset = 0;
  let pos = 0;

  function setUint16(data: number) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data: number) {
    view.setUint32(pos, data, true);
    pos += 4;
  }

  // write WAVE header
  setUint32(0x46464952);                         // "RIFF"
  setUint32(length - 8);                         // file length - 8
  setUint32(0x45564157);                         // "WAVE"

  setUint32(0x20746d66);                         // "fmt " chunk
  setUint32(16);                                 // length = 16
  setUint16(1);                                  // PCM (uncompressed)
  setUint16(buffer.numberOfChannels);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * buffer.numberOfChannels); // avg. bytes/sec
  setUint16(buffer.numberOfChannels * 2);        // block-align
  setUint16(16);                                 // 16-bit (hardcoded in this ex)

  setUint32(0x61746164);                         // "data" - chunk
  setUint32(length - pos - 4);                   // chunk length

  // write interleaved data
  for(i = 0; i < buffer.numberOfChannels; i++)
    channels.push(buffer.getChannelData(i));

  while(pos < length) {
    for(i = 0; i < buffer.numberOfChannels; i++) {             // interleave channels
      sample = Math.max(-1, Math.min(1, channels[i][offset] || 0)); // clamp
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767)|0; // scale to 16-bit signed int
      view.setInt16(pos, sample, true);          // write 16-bit sample
      pos += 2;
    }
    offset++;
  }

  return new Blob([outBuffer], {type: "audio/wav"});
};

class ToneEngine {
    private instPlayer: Tone.Player;
    private vocalPlayer: Tone.Player;
    
    // Channel Strips
    private instChannel: Tone.Channel;
    private vocalChannel: Tone.Channel;

    // Effects
    private vocalReverb: Tone.Reverb;
    private vocalDelay: Tone.FeedbackDelay;
    private vocalPitchShift: Tone.PitchShift;
    private vocalEq: Tone.EQ3;
    private vocalDeEsser: Tone.MultibandCompressor;

    private instEq: Tone.EQ3;
    private instBassBoost: Tone.Filter; // Extra Bass

    // Master
    private limiter: Tone.Limiter;
    private recorder: Tone.Recorder;

    // Mic
    private mic: Tone.UserMedia;
    private micRecorder: Tone.Recorder;

    // State tracking
    private vocalOffset: number = 0; // In seconds
    
    constructor() {
        // --- Master Chain ---
        this.limiter = new Tone.Limiter(-1).toDestination();
        this.recorder = new Tone.Recorder();
        Tone.getDestination().connect(this.recorder);

        // --- Vocal Chain Setup ---
        this.vocalReverb = new Tone.Reverb({ decay: 2.5, preDelay: 0.1 });
        this.vocalReverb.generate();
        this.vocalReverb.wet.value = 0;

        this.vocalDelay = new Tone.FeedbackDelay("8n", 0.5);
        this.vocalDelay.wet.value = 0;

        this.vocalPitchShift = new Tone.PitchShift({ pitch: 0, windowSize: 0.1, delayTime: 0, feedback: 0 });
        
        this.vocalEq = new Tone.EQ3(0, 0, 0);

        // De-Esser logic using Multiband Compressor
        this.vocalDeEsser = new Tone.MultibandCompressor({
            lowFrequency: 200,
            highFrequency: 4000, 
            high: {
                ratio: 6, 
                threshold: -24,
                attack: 0.005,
                release: 0.05
            },
            mid: { ratio: 1, threshold: 0 },
            low: { ratio: 1, threshold: 0 }
        });

        this.vocalChannel = new Tone.Channel({ volume: -5, pan: 0 }).connect(this.limiter);
        
        // Connect Vocal Chain
        this.vocalEq.connect(this.vocalDeEsser);
        this.vocalDeEsser.connect(this.vocalPitchShift);
        this.vocalPitchShift.connect(this.vocalReverb);
        this.vocalReverb.connect(this.vocalDelay);
        this.vocalDelay.connect(this.vocalChannel);


        // --- Instrumental Chain Setup ---
        this.instEq = new Tone.EQ3(0, 0, 0);
        this.instBassBoost = new Tone.Filter(200, "lowshelf");
        this.instBassBoost.gain.value = 0;

        this.instChannel = new Tone.Channel({ volume: -5, pan: 0 }).connect(this.limiter);

        this.instBassBoost.connect(this.instEq);
        this.instEq.connect(this.instChannel);

        // --- Players ---
        this.instPlayer = new Tone.Player();
        this.instPlayer.connect(this.instBassBoost);

        this.vocalPlayer = new Tone.Player();
        this.vocalPlayer.connect(this.vocalEq);

        // --- Mic Setup ---
        this.mic = new Tone.UserMedia();
        this.micRecorder = new Tone.Recorder();
        // Connect Mic to Recorder, but NOT to output (avoid feedback)
        this.mic.connect(this.micRecorder);
    }

    async loadTrack(url: string, type: 'instrumental' | 'vocal'): Promise<void> {
        await ensureAudioContext();
        const player = type === 'instrumental' ? this.instPlayer : this.vocalPlayer;
        // Tone.Player load handles standard file types well
        await player.load(url);
    }

    play(currentTime: number) {
        const now = Tone.now() + 0.1;
        
        if (this.instPlayer.loaded) {
            this.instPlayer.start(now, currentTime);
        }

        if (this.vocalPlayer.loaded) {
            const vocalSeekTime = currentTime - this.vocalOffset;
            if (vocalSeekTime >= 0) {
                 this.vocalPlayer.start(now, vocalSeekTime);
            } else {
                this.vocalPlayer.start(now + Math.abs(vocalSeekTime), 0);
            }
        }
    }

    pause() {
        if (this.instPlayer.state === 'started') this.instPlayer.stop();
        if (this.vocalPlayer.state === 'started') this.vocalPlayer.stop();
    }

    stop() {
        this.pause();
        this.instPlayer.stop();
        this.vocalPlayer.stop();
    }

    seek(time: number) {
        if (this.instPlayer.loaded && this.instPlayer.state === 'started') {
            this.instPlayer.seek(time);
        }
        
        if (this.vocalPlayer.loaded && this.vocalPlayer.state === 'started') {
             const vocalSeekTime = time - this.vocalOffset;
             if (vocalSeekTime >= 0) {
                 this.vocalPlayer.seek(vocalSeekTime);
             }
        }
    }
    
    setVocalOffset(seconds: number) {
        this.vocalOffset = seconds;
        if (this.instPlayer.state === 'started') {
            const currentInstTime = (this.instPlayer as any).toSeconds(Tone.Transport.position);
            this.stop();
            this.play(currentInstTime);
        }
    }

    updateSettings(type: 'instrumental' | 'vocal', settings: AudioSettings) {
        const now = Tone.now(); 

        if (type === 'vocal') {
            this.vocalChannel.volume.cancelScheduledValues(now);
            this.vocalChannel.pan.cancelScheduledValues(now);
            this.vocalReverb.wet.cancelScheduledValues(now);
            this.vocalDelay.wet.cancelScheduledValues(now);
            
            // Dynamics processing
            this.vocalDeEsser.high.threshold.cancelScheduledValues(now);
            this.vocalDeEsser.high.ratio.cancelScheduledValues(now);
            
            if (settings.enableDynamics) {
                this.vocalDeEsser.highFrequency.value = settings.deEsserFreq;
                this.vocalDeEsser.high.threshold.rampTo(settings.deEsserThresh, 0.1, now);
                this.vocalDeEsser.high.ratio.rampTo(6, 0.1, now); // Normal ratio
            } else {
                // Bypass logic: Set threshold to 0 and ratio to 1
                this.vocalDeEsser.high.threshold.rampTo(0, 0.1, now);
                this.vocalDeEsser.high.ratio.rampTo(1, 0.1, now);
            }

            this.vocalChannel.volume.rampTo(settings.volume, 0.1, now);
            this.vocalChannel.pan.rampTo(settings.pan, 0.1, now);
            
            this.vocalPlayer.playbackRate = settings.speed;

            this.vocalEq.high.value = settings.eqHigh; 
            this.vocalEq.mid.value = settings.eqMid;
            this.vocalEq.low.value = settings.eqLow;

            this.vocalReverb.wet.rampTo(settings.reverb, 0.1, now);
            this.vocalDelay.wet.rampTo(settings.delay, 0.1, now);
            this.vocalPitchShift.pitch = settings.pitch;

        } else {
            this.instChannel.volume.cancelScheduledValues(now);
            this.instChannel.pan.cancelScheduledValues(now);
            this.instBassBoost.gain.cancelScheduledValues(now);

            this.instChannel.volume.rampTo(settings.volume, 0.1, now);
            this.instChannel.pan.rampTo(settings.pan, 0.1, now);
            
            this.instPlayer.playbackRate = settings.speed;

            this.instEq.high.value = settings.eqHigh; 
            this.instEq.mid.value = settings.eqMid;
            this.instEq.low.value = settings.eqLow;
            
            this.instBassBoost.gain.rampTo(settings.bassBoost, 0.1, now);
        }
    }
    
    // --- Live Recording ---
    async startMicRecording() {
        await ensureAudioContext();
        await this.mic.open();
        this.micRecorder.start();
    }
    
    async stopMicRecording(): Promise<Blob> {
        const blob = await this.micRecorder.stop();
        this.mic.close();
        return blob;
    }

    // --- Export Helpers ---
    async startRecording() {
        this.recorder.start();
    }

    async stopRecording() {
        return await this.recorder.stop();
    }
    
    // Get the main output as a MediaStream for video recording
    getMixStream(): MediaStream {
        const dest = Tone.context.createMediaStreamDestination();
        Tone.getDestination().connect(dest);
        return dest.stream;
    }

    getCurrentTime(): number {
        if(this.instPlayer.loaded && this.instPlayer.state === 'started') {
             return (this.instPlayer as any).toSeconds(Tone.now()); 
        }
        return 0;
    }
    
    getMaxDuration(): number {
        const instDur = this.instPlayer.loaded ? this.instPlayer.buffer.duration : 0;
        const vocDur = this.vocalPlayer.loaded ? this.vocalPlayer.buffer.duration : 0;
        return Math.max(instDur, vocDur);
    }

    /**
     * Optimized Stem Extraction
     * Use native decodeAudioData via ArrayBuffer to prevent "Unable to decode" errors
     * from Blob URLs in strict browser environments.
     */
    async extractStems(file: File): Promise<{vocal: Blob, music: Blob}> {
        await ensureAudioContext();
        
        let nativeBuffer: AudioBuffer;
        
        try {
            const arrayBuffer = await file.arrayBuffer();
            nativeBuffer = await Tone.context.decodeAudioData(arrayBuffer);
        } catch(e) {
            console.error("Decode Error:", e);
            throw new Error("Unable to decode audio data. Please ensure the file is a valid audio format.");
        }
        
        const duration = nativeBuffer.duration;

        try {
            // 2. Music Extraction (Karaoke Mode)
            const musicBuffer = await Tone.Offline(async () => {
                const player = new Tone.Player(nativeBuffer);
                
                const freq = 120;
                const bassFilter = new Tone.Filter(freq, "lowpass", -48);
                const bassGain = new Tone.Gain(1.0);
                
                player.connect(bassFilter);
                bassFilter.connect(bassGain);
                bassGain.toDestination(); 

                const highPass = new Tone.Filter(freq, "highpass", -48);
                player.connect(highPass);

                const split = new Tone.Split(2);
                highPass.connect(split);

                const leftGain = new Tone.Gain(1);
                const rightInvert = new Tone.Gain(-1);
                
                split.connect(leftGain, 0, 0);
                split.connect(rightInvert, 1, 0);
                
                const monoSide = new Tone.Mono();
                leftGain.connect(monoSide);
                rightInvert.connect(monoSide);
                
                const sideGain = new Tone.Gain(1.0);
                monoSide.connect(sideGain);
                sideGain.toDestination();

                player.start(0);
            }, duration);

            // 3. Vocal Extraction
            const vocalBuffer = await Tone.Offline(async () => {
                const player = new Tone.Player(nativeBuffer);
                
                const split = new Tone.Split(2);
                player.connect(split);
                
                const summer = new Tone.Gain(0.5); 
                split.connect(summer, 0, 0); 
                split.connect(summer, 1, 0); 
                
                const highPass = new Tone.Filter(200, "highpass", -48); 
                const lowPass = new Tone.Filter(4000, "lowpass", -48);
                
                const gate = new Tone.Gate({
                    threshold: -32,
                    smoothing: 0.1
                });
                
                const compressor = new Tone.Compressor({
                    threshold: -24,
                    ratio: 3,
                    attack: 0.003,
                    release: 0.25
                });

                const makeupGain = new Tone.Gain(2.0); 

                summer.connect(highPass);
                highPass.connect(lowPass);
                lowPass.connect(gate);
                gate.connect(compressor);
                compressor.connect(makeupGain);
                makeupGain.toDestination();
                
                player.start(0);
            }, duration);

            return {
                vocal: audioBufferToBlob(vocalBuffer.get()),
                music: audioBufferToBlob(musicBuffer.get())
            };

        } catch (e) {
            console.error("Extraction Engine Error:", e);
            throw e;
        }
    }
}

export const engine = new ToneEngine();
