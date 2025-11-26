import React, { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import { TrackData } from '../types';

interface WaveformProps {
  track: TrackData;
  isPlaying: boolean;
  currentTime: number; // External source of truth for time
  color: string;
  onReady?: (duration: number) => void;
  onSeek?: (time: number) => void;
}

const Waveform: React.FC<WaveformProps> = ({ 
  track, 
  isPlaying, 
  currentTime, 
  color, 
  onReady, 
  onSeek 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurfer = useRef<WaveSurfer | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isMouseDown, setIsMouseDown] = useState(false);

  // Initialize WaveSurfer
  useEffect(() => {
    if (!containerRef.current || !track.url) return;

    wavesurfer.current = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#333',
      progressColor: color,
      cursorColor: '#fff',
      barWidth: 2,
      barGap: 3,
      barRadius: 3,
      height: 80,
      normalize: true,
      url: track.url,
      interact: true, 
    });

    wavesurfer.current.on('ready', (duration) => {
      if (onReady) onReady(duration);
    });

    wavesurfer.current.on('interaction', (newTime) => {
        if(onSeek) onSeek(newTime);
    });
    
    // Mute wavesurfer because Tone.js handles the actual audio
    wavesurfer.current.setVolume(0);

    return () => {
      wavesurfer.current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.url]); // Re-init if URL changes

  // Sync Playback State (Visual Only)
  useEffect(() => {
    if (!wavesurfer.current) return;
    
    // Check if drift is significant (> 0.1s)
    const currentWaveTime = wavesurfer.current.getCurrentTime();
    if (Math.abs(currentWaveTime - currentTime) > 0.1) {
        wavesurfer.current.setTime(currentTime);
    }

    if (isPlaying && !wavesurfer.current.isPlaying()) {
        wavesurfer.current.play();
    } else if (!isPlaying && wavesurfer.current.isPlaying()) {
        wavesurfer.current.pause();
    }
  }, [isPlaying, currentTime]);

  return (
    <div 
        className="w-full relative group rounded-xl transition-all duration-200"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => { setIsHovered(false); setIsMouseDown(false); }}
        onMouseDown={() => setIsMouseDown(true)}
        onMouseUp={() => setIsMouseDown(false)}
        style={{
            boxShadow: (isHovered || isMouseDown) ? `0 0 25px ${color}30` : 'none',
            transform: isMouseDown ? 'scale(0.995)' : 'scale(1)',
            border: (isHovered || isMouseDown) ? `1px solid ${color}30` : '1px solid transparent',
            backgroundColor: (isHovered || isMouseDown) ? `${color}05` : 'transparent'
        }}
    >
      <div ref={containerRef} className="w-full" />
      <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 rounded text-xs text-white backdrop-blur-sm pointer-events-none border border-white/5">
        {track.name}
      </div>
    </div>
  );
};

export default Waveform;