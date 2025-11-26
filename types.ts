
export type TrackType = 'instrumental' | 'vocal';

export interface TrackData {
  id: string;
  name: string;
  url: string;
  type: TrackType;
  duration: number;
}

export interface AudioSettings {
  volume: number; // -60 to 0 dB
  pan: number; // -1 to 1
  eqHigh: number; // -10 to 10 (Treble)
  eqMid: number; // -10 to 10
  eqLow: number; // -10 to 10
  bassBoost: number; // 0 to 10 (Extra Bass)
  reverb: number; // 0 to 1 (wet/dry)
  delay: number; // 0 to 1 (wet/dry)
  pitch: number; // -12 to 12 semitones
  speed: number; // 0.5 to 2.0 (playback rate)
  deEsserThresh: number; // -60 to 0 dB
  deEsserFreq: number; // 2000Hz to 10000Hz
  enableDynamics: boolean; // Toggle for Compressor/DeEsser
}

export interface ProjectState {
  tracks: {
    instrumental: TrackData | null;
    vocal: TrackData | null;
  };
  settings: {
    instrumental: AudioSettings;
    vocal: AudioSettings;
  };
  master: {
    volume: number;
    limiter: boolean;
  };
  isPlaying: boolean;
  currentTime: number;
}

// Music Player Types
export interface MusicTrack {
    id: string;
    title: string;
    artist: string;
    cover: string; // URL
    audioUrl: string; // URL
    language: 'Hindi' | 'Malayalam' | 'Tamil' | 'Telugu' | 'English';
    category: 'Pop' | 'Mappila' | 'Album' | 'HipHop' | 'Melody' | 'Movie Songs';
    isTrending: boolean;
    isNew: boolean;
}

export type PlayMode = 'normal' | 'repeat' | 'shuffle';
