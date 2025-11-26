
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Upload, Play, Pause, Music, Mic, Layers, Settings, ChevronRight, Share2, Disc, Wand2, Download, Zap, Loader2, FastForward, Rewind, AlignHorizontalDistributeCenter, RotateCcw, Youtube, FileAudio, FileVideo, CheckCircle2, Heart, Shuffle, Repeat, SkipBack, SkipForward, X, ChevronDown, Search, Globe, RefreshCw, Volume2, AlertCircle, ExternalLink, Image as ImageIcon, Video, StopCircle, Save, FolderOpen, FileJson } from 'lucide-react';
import * as Tone from 'tone';

import { TrackData, ProjectState, AudioSettings, MusicTrack, PlayMode } from './types';
import { COLORS, DEFAULT_SETTINGS, APP_NAME, FOOTER_TEXT } from './constants';
import Waveform from './components/Waveform';
import { Knob, Slider, Toggle } from './components/Controls';
import ThumbnailGen from './components/ThumbnailGen';
import { engine, ensureAudioContext, safeCreateObjectURL } from './services/ToneEngine';

const App: React.FC = () => {
  // --- State ---
  const [view, setView] = useState<'mixer' | 'thumbnail' | 'tools' | 'music'>('mixer');
  const [activeFxTab, setActiveFxTab] = useState<'vocal' | 'instrumental'>('vocal');
  const [tracks, setTracks] = useState<ProjectState['tracks']>({ instrumental: null, vocal: null });
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Tools Page State
  const [toolTab, setToolTab] = useState<'extractor' | 'youtube'>('extractor');

  // Sync State
  const [vocalShift, setVocalShift] = useState(0); // Seconds

  // Export State
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportType, setExportType] = useState<'audio' | 'video'>('video');
  const [projectThumbnail, setProjectThumbnail] = useState<string | null>(null);

  // Recording State
  const [isRecording, setIsRecording] = useState(false);

  // Settings State
  const [instSettings, setInstSettings] = useState<AudioSettings>({ ...DEFAULT_SETTINGS });
  const [vocalSettings, setVocalSettings] = useState<AudioSettings>({ ...DEFAULT_SETTINGS });
  
  // Stem Extraction State
  const [extractionFile, setExtractionFile] = useState<File | null>(null);
  const [extractionThumbnail, setExtractionThumbnail] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedBlobs, setExtractedBlobs] = useState<{vocal: Blob | null, music: Blob | null}>({vocal: null, music: null});
  const [downloadUrls, setDownloadUrls] = useState<{vocal: string | null, music: string | null}>({vocal: null, music: null});

  // YouTube Downloader State
  const [ytUrl, setYtUrl] = useState('');
  const [ytFormat, setYtFormat] = useState<'mp3' | 'mp4'>('mp4');
  const [ytMetadata, setYtMetadata] = useState<{title: string, thumbnail: string} | null>(null);
  const [isYtProcessing, setIsYtProcessing] = useState(false);
  const [isYtPreviewing, setIsYtPreviewing] = useState(false);
  const [ytComplete, setYtComplete] = useState(false);
  const [ytDownloadLink, setYtDownloadLink] = useState<string | null>(null);
  const [ytError, setYtError] = useState<string | null>(null);

  // --- MUSIC PLAYER STATE ---
  const audioPlayer = useRef<HTMLAudioElement>(new Audio());
  const [musicQueue, setMusicQueue] = useState<MusicTrack[]>([]);
  const [currentMusicIndex, setCurrentMusicIndex] = useState<number>(-1);
  const [musicIsPlaying, setMusicIsPlaying] = useState(false);
  const [musicMode, setMusicMode] = useState<PlayMode>('normal');
  const [showFullPlayer, setShowFullPlayer] = useState(false);
  const [musicSearch, setMusicSearch] = useState('');
  const [activeLang, setActiveLang] = useState<string>('All');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [isLoadingMusic, setIsLoadingMusic] = useState(false);
  
  // Music Progress State
  const [musicCurrentTime, setMusicCurrentTime] = useState(0);
  const [musicDuration, setMusicDuration] = useState(0);

  // Project Load Input Ref
  const projectLoadInputRef = useRef<HTMLInputElement>(null);

  // --- Music Player Logic ---
  const currentTrack = useMemo(() => currentMusicIndex >= 0 ? musicQueue[currentMusicIndex] : null, [currentMusicIndex, musicQueue]);
  
  // Helper for time formatting
  const formatTime = (seconds: number) => {
      if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "0:00";
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Safe Play Helper to prevent Promise Interruption Errors
  const safeAudioPlay = async () => {
      const audio = audioPlayer.current;
      if (!audio.src) return;
      try {
          const playPromise = audio.play();
          if (playPromise !== undefined) {
              await playPromise;
              setMusicIsPlaying(true);
          }
      } catch (err) {
          console.warn("Playback interrupted or failed:", err);
          setMusicIsPlaying(false);
      }
  };

  // --- iTunes API Integration ---
  const fetchMusic = async () => {
      setIsLoadingMusic(true);
      try {
          // Build Query
          let term = '';
          
          if (musicSearch) {
               term = musicSearch + ' ';
          }
          
          // Smart Category Logic
          if (activeCategory === 'Movie Songs') {
              if (activeLang === 'Malayalam') term += 'Malayalam movie songs ';
              else if (activeLang === 'Hindi') term += 'Bollywood songs ';
              else if (activeLang === 'Tamil') term += 'Tamil movie songs ';
              else if (activeLang === 'Telugu') term += 'Telugu movie songs ';
              else term += 'Film soundtracks ';
          } else if (activeCategory === 'Mappila Songs') {
              term += 'Mappila songs ';
          } else if (activeCategory === 'Malayalam Album') {
              term += 'Malayalam album songs ';
          } else if (activeCategory !== 'All') {
              term += `${activeCategory} `;
          }

          // Add Language if not already covered by specific category logic
          if (activeLang !== 'All' && activeCategory !== 'Movie Songs') {
              term += `${activeLang} `;
          }
          
          if (!term.trim()) {
              term = 'Top hits india ';
          }

          term = term.trim();

          // iTunes Search API
          const response = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=50`);
          if (!response.ok) throw new Error("iTunes API Error");
          const data = await response.json();

          if (data.results) {
              const mappedTracks: MusicTrack[] = data.results.map((item: any) => ({
                  id: item.trackId.toString(),
                  title: item.trackName,
                  artist: item.artistName,
                  language: activeLang as any,
                  category: activeCategory as any,
                  isTrending: Math.random() > 0.8,
                  isNew: new Date(item.releaseDate).getFullYear() >= 2024,
                  cover: item.artworkUrl100.replace('100x100', '600x600'), // Get High Res
                  audioUrl: item.previewUrl
              }));
              
              // Remove duplicates
              const uniqueTracks = mappedTracks.filter((track, index, self) => 
                index === self.findIndex((t) => t.id === track.id)
              );

              setMusicQueue(uniqueTracks);
          }
      } catch (error) {
          console.error("Failed to fetch music", error);
      } finally {
          setIsLoadingMusic(false);
      }
  };

  // Fetch on mount and filter change
  useEffect(() => {
      if (view === 'music' && musicQueue.length === 0) { // Only auto fetch if queue is empty
          const timer = setTimeout(() => {
              fetchMusic();
          }, 500);
          return () => clearTimeout(timer);
      } else if (view === 'music' && musicQueue.length > 0 && musicSearch) {
           // Allow search refresh
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLang, activeCategory, view]);


  // Initialize Music Player Events
  useEffect(() => {
      const audio = audioPlayer.current;
      
      const handleEnded = () => {
          setMusicIsPlaying(false);
          handleMusicNext();
      };
      
      const handleTimeUpdate = () => {
          setMusicCurrentTime(audio.currentTime);
      };
      
      const handleLoadedMetadata = () => {
          if (audio.duration && !isNaN(audio.duration) && audio.duration !== Infinity) {
              setMusicDuration(audio.duration);
          } else {
              setMusicDuration(30); // Fallback for previews
          }
      };

      const handlePause = () => setMusicIsPlaying(false);
      const handlePlay = () => setMusicIsPlaying(true);
      
      audio.addEventListener('ended', handleEnded);
      audio.addEventListener('timeupdate', handleTimeUpdate);
      audio.addEventListener('loadedmetadata', handleLoadedMetadata);
      audio.addEventListener('pause', handlePause);
      audio.addEventListener('play', handlePlay);
      
      return () => {
          audio.removeEventListener('ended', handleEnded);
          audio.removeEventListener('timeupdate', handleTimeUpdate);
          audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
          audio.removeEventListener('pause', handlePause);
          audio.removeEventListener('play', handlePlay);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [musicMode, currentMusicIndex, musicQueue]); // Re-bind if queue logic changes

  const playMusic = async (track: MusicTrack, queue: MusicTrack[]) => {
      // If switching from Mixer to Music, stop mixer
      if(isPlaying) togglePlay();

      const audio = audioPlayer.current;

      // If clicking current track, just toggle
      if (currentTrack?.id === track.id) {
          toggleMusicPlay();
          return;
      }
      
      // New Track
      const index = queue.findIndex(t => t.id === track.id);
      setCurrentMusicIndex(index);
      
      setMusicCurrentTime(0);
      setMusicDuration(0); // Reset duration until metadata loads
      
      audio.src = track.audioUrl;
      audio.load();
      setShowFullPlayer(true);
      
      await safeAudioPlay();
  };

  const toggleMusicPlay = async () => {
      const audio = audioPlayer.current;
      if (audio.paused) {
          if(!audio.src && musicQueue.length > 0) {
              // Start first song if nothing loaded
              playMusic(musicQueue[0], musicQueue);
          } else {
              await safeAudioPlay();
          }
      } else {
          audio.pause();
          setMusicIsPlaying(false);
      }
  };

  const handleMusicSeek = (time: number) => {
      const audio = audioPlayer.current;
      if (isFinite(time)) {
        audio.currentTime = time;
        setMusicCurrentTime(time);
      }
  };

  const playTrackAtIndex = async (index: number) => {
      if (index < 0 || index >= musicQueue.length) return;
      
      const track = musicQueue[index];
      setCurrentMusicIndex(index);
      
      const audio = audioPlayer.current;
      audio.src = track.audioUrl;
      setMusicCurrentTime(0);
      audio.load();
      await safeAudioPlay();
  };

  const handleMusicNext = () => {
      if (musicQueue.length === 0) return;
      
      let nextIndex;
      if (musicMode === 'shuffle') {
          nextIndex = Math.floor(Math.random() * musicQueue.length);
      } else if (musicMode === 'repeat') {
          const audio = audioPlayer.current;
          audio.currentTime = 0;
          safeAudioPlay();
          return;
      } else {
          nextIndex = (currentMusicIndex + 1) % musicQueue.length;
      }
      playTrackAtIndex(nextIndex);
  };

  const handleMusicPrev = () => {
      if (musicQueue.length === 0) return;
      // If played more than 3 sec, restart song
      if (audioPlayer.current.currentTime > 3) {
          audioPlayer.current.currentTime = 0;
          return;
      }

      const prevIndex = (currentMusicIndex - 1 + musicQueue.length) % musicQueue.length;
      playTrackAtIndex(prevIndex);
  };

  const handleLocalMusicUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      const newTracks: MusicTrack[] = Array.from(files).map((item, i) => {
          const file = item as File;
          return {
            id: `local-${Date.now()}-${i}`,
            title: file.name.replace(/\.[^/.]+$/, ""),
            artist: 'Local Import',
            language: 'English',
            category: 'Pop',
            isTrending: false,
            isNew: true,
            cover: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=600&auto=format&fit=crop&q=60', // Nice dark abstract
            audioUrl: safeCreateObjectURL(file)
          };
      });

      setMusicQueue(prev => [...newTracks, ...prev]);
      
      // Auto-play the first imported track
      if (newTracks.length > 0) {
          playMusic(newTracks[0], [...newTracks, ...musicQueue]);
      }
  };

  // --- Mixer Audio Handlers ---
  
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'instrumental' | 'vocal') => {
    // If music is playing, stop it
    if(musicIsPlaying) {
        audioPlayer.current.pause();
        setMusicIsPlaying(false);
    }

    const file = e.target.files?.[0];
    if (!file) return;

    const objectUrl = safeCreateObjectURL(file);
    if (!objectUrl) return;
    
    // UI Update
    setTracks(prev => ({
      ...prev,
      [type]: {
        id: Math.random().toString(36),
        name: file.name,
        url: objectUrl,
        type,
        duration: 0 
      }
    }));

    try {
        // Engine Update
        await engine.loadTrack(objectUrl, type);
        
        // Update global max duration
        setTimeout(() => {
            setDuration(engine.getMaxDuration());
        }, 500);
    } catch (err) {
        console.error("Error loading track:", err);
        alert("Unable to decode audio data. Please ensure the file is a valid audio format (MP3, WAV, etc). Text files or unsupported formats will fail.");
    }
  };
  
  const handleExtractionUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if(!file) return;
      
      setExtractionFile(file);
      setExtractionThumbnail(null);
      setExtractedBlobs({vocal: null, music: null});

      // Attempt to get thumbnail if it's a video
      if(file.type.startsWith('video/')) {
          const video = document.createElement('video');
          video.preload = 'metadata';
          video.src = URL.createObjectURL(file);
          video.muted = true;
          video.playsInline = true;
          video.currentTime = 1; // Seek 1s in

          video.onloadeddata = () => {
              const canvas = document.createElement('canvas');
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              const ctx = canvas.getContext('2d');
              ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
              setExtractionThumbnail(canvas.toDataURL('image/jpeg'));
              URL.revokeObjectURL(video.src);
          };
      }
  };

  const togglePlay = async () => {
    await ensureAudioContext();
    
    // Stop Music Player if running
    if (musicIsPlaying) {
        audioPlayer.current.pause();
        setMusicIsPlaying(false);
    }

    if (isRecording) {
        // Stop recording workflow
        await handleRecordToggle();
        return;
    }

    if (isPlaying) {
      engine.pause();
      setIsPlaying(false);
    } else {
      // Loop if at end
      if (currentTime >= duration) {
          engine.seek(0);
          setCurrentTime(0);
      }
      engine.play(currentTime);
      setIsPlaying(true);
    }
  };
  
  const handleRecordToggle = async () => {
      await ensureAudioContext();
      if (isRecording) {
          // Stop
          engine.stop();
          const blob = await engine.stopMicRecording();
          setIsRecording(false);
          setIsPlaying(false);
          
          const objectUrl = safeCreateObjectURL(blob);
          
          setTracks(prev => ({
              ...prev,
              vocal: {
                  id: Math.random().toString(36),
                  name: `Recorded Vocal ${new Date().toLocaleTimeString()}`,
                  url: objectUrl,
                  type: 'vocal',
                  duration: 0
              }
          }));
          
          await engine.loadTrack(objectUrl, 'vocal');
          setTimeout(() => setDuration(engine.getMaxDuration()), 500);

      } else {
          // Start
          if (musicIsPlaying) {
            audioPlayer.current.pause();
            setMusicIsPlaying(false);
          }
          
          try {
              await engine.startMicRecording();
              engine.play(currentTime); // Play instrumental
              setIsRecording(true);
              setIsPlaying(true);
          } catch(e) {
              console.error(e);
              alert("Could not access microphone. Please check permissions.");
          }
      }
  }

  const handleSeek = (time: number) => {
      engine.seek(time);
      setCurrentTime(time);
  };
  
  const handleVocalSync = (shift: number) => {
      setVocalShift(shift);
      engine.setVocalOffset(shift);
  };

  const handleSaveProject = () => {
    const projectData = {
        version: "1.0",
        timestamp: Date.now(),
        settings: {
            instrumental: instSettings,
            vocal: vocalSettings
        },
        metadata: {
            instrumentalName: tracks.instrumental?.name,
            vocalName: tracks.vocal?.name,
        },
        sync: {
            vocalShift
        }
    };

    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ALI-Project-${new Date().toLocaleDateString().replace(/\//g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
  };

  const handleLoadProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if(!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const json = JSON.parse(event.target?.result as string);
            if(json.settings) {
                setInstSettings(json.settings.instrumental);
                setVocalSettings(json.settings.vocal);
                if (json.sync) {
                    setVocalShift(json.sync.vocalShift || 0);
                    engine.setVocalOffset(json.sync.vocalShift || 0);
                }
                alert(`Project Settings Loaded!\n\nTracks: ${json.metadata?.instrumentalName || 'N/A'} & ${json.metadata?.vocalName || 'N/A'}\n\nPlease re-upload the audio files manually as they cannot be saved in the project file.`);
            }
        } catch(e) {
            alert("Failed to load project file. Invalid JSON.");
        }
    };
    reader.readAsText(file);
    // Reset value so same file can be selected again
    if(e.target) e.target.value = '';
  };

  // --- Export Logic ---

  const prepareForExport = async () => {
    if (duration === 0) {
        alert("Please load tracks first.");
        return false;
    }
    
    // Stop everything
    if(isPlaying) engine.stop();
    if(isRecording) await handleRecordToggle();
    
    engine.seek(0);
    setCurrentTime(0);
    setIsPlaying(false);
    return true;
  };

  const handleAudioExport = async () => {
      if (!(await prepareForExport())) return;

      setIsExporting(true);
      setExportProgress(0);
      setExportType('audio');

      // Start Recording
      await engine.startRecording();
      engine.play(0);

      // Simple Timer Progress
      const exportDurationMs = duration * 1000;
      const startTime = Date.now();

      const interval = setInterval(async () => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min((elapsed / exportDurationMs) * 100, 99);
          setExportProgress(progress);

          if (elapsed >= exportDurationMs + 500) {
               clearInterval(interval);
               engine.stop();
               const blob = await engine.stopRecording();
               
               if(blob.size > 0) {
                   const url = URL.createObjectURL(blob);
                   const a = document.createElement('a');
                   a.style.display = 'none';
                   a.href = url;
                   a.download = `ALI-MIX-${Date.now()}.wav`;
                   document.body.appendChild(a);
                   a.click();
                   setTimeout(() => {
                       document.body.removeChild(a);
                       URL.revokeObjectURL(url);
                   }, 1000);
               } else {
                   alert("Export failed: Audio data empty.");
               }
               
               setIsExporting(false);
          }
      }, 100);
  };

  const handleVideoExport = async () => {
      if (!(await prepareForExport())) return;
      
      setIsExporting(true);
      setExportProgress(0);
      setExportType('video');
      
      // 1. Prepare Audio Stream
      const audioDest = engine.getMixStream();

      // 2. Prepare Video Stream (Canvas)
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1080;
      const ctx = canvas.getContext('2d');
      
      if(!ctx) {
          setIsExporting(false);
          return;
      }

      // Load Image
      const img = new Image();
      // Use project thumbnail or default fallback
      img.src = projectThumbnail || "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=1080&auto=format&fit=crop&q=80";
      
      await new Promise<void>((resolve) => {
          if (img.complete) resolve();
          else img.onload = () => resolve();
          // Timeout fallback
          setTimeout(resolve, 3000); 
      });

      // Animation Loop for Canvas (Simple Pulse)
      const stream = canvas.captureStream(30);
      const combinedStream = new MediaStream([...stream.getVideoTracks(), ...audioDest.getAudioTracks()]);
      
      let recorder: MediaRecorder;
      try {
          recorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm; codecs=vp9' });
      } catch (e) {
          try {
            recorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm' });
          } catch (e2) {
             recorder = new MediaRecorder(combinedStream);
          }
      }

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
          if(e.data && e.data.size > 0) chunks.push(e.data);
      };
      
      recorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/webm' });
          if(blob.size === 0) {
              alert("Export Failed: No data generated. Please ensure the tab remains active during rendering.");
              setIsExporting(false);
              return;
          }
          
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          a.download = `ALI-MIX-${Date.now()}.webm`;
          document.body.appendChild(a);
          a.click();
          
          setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }, 1000);
          
          setIsExporting(false);
          setIsPlaying(false);
      };

      // Start Recording process
      recorder.start(); 
      engine.play(0);
      
      // Rendering Loop
      const startTime = Date.now();
      const exportDurationMs = duration * 1000;
      let renderId = 0;

      const render = () => {
          if(!ctx) return;
          const elapsed = Date.now() - startTime;
          
          // Draw BG
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          
          // Draw Overlay Pulse
          const beat = Math.sin(elapsed / 200) * 0.05 + 1;
          const centerX = canvas.width / 2;
          const centerY = canvas.height / 2;
          
          ctx.beginPath();
          ctx.strokeStyle = `rgba(255, 94, 0, ${Math.abs(Math.sin(elapsed/500)) * 0.5})`;
          ctx.lineWidth = 20;
          ctx.arc(centerX, centerY, 300 * beat, 0, Math.PI*2);
          ctx.stroke();

          // Text
          ctx.fillStyle = "white";
          ctx.font = "bold 40px Arial";
          ctx.textAlign = "center";
          ctx.fillText("ALI'S SOUNDS MIXING", centerX, canvas.height - 50);

          renderId = requestAnimationFrame(render);
      };
      render();

      // Timer to stop
      const interval = setInterval(() => {
          const elapsed = Date.now() - startTime;
          const progress = Math.min((elapsed / exportDurationMs) * 100, 99);
          setExportProgress(progress);
          
          if (elapsed >= exportDurationMs + 500) { // Buffer
              clearInterval(interval);
              cancelAnimationFrame(renderId);
              recorder.stop();
              engine.stop();
          }
      }, 100);
  };
  
  const handleReset = () => {
    if(window.confirm("Reset entire project? This will clear all tracks.")) {
        engine.stop();
        setTracks({ instrumental: null, vocal: null });
        setInstSettings({ ...DEFAULT_SETTINGS });
        setVocalSettings({ ...DEFAULT_SETTINGS });
        setIsPlaying(false);
        setCurrentTime(0);
        setDuration(0);
        setVocalShift(0);
        setProjectThumbnail(null);
        engine.setVocalOffset(0);
    }
  };
  
  const handleStemExtraction = async () => {
      if (!extractionFile) return;
      setIsExtracting(true);
      setExtractedBlobs({ vocal: null, music: null });
      
      try {
          // Use optimized unified extraction
          const { vocal, music } = await engine.extractStems(extractionFile);
          setExtractedBlobs({ vocal, music });
      } catch (e: any) {
          console.error(e);
          alert(`Extraction failed: ${e.message || "Unknown error"}. Please ensure the file is a valid audio/video format.`);
      } finally {
          setIsExtracting(false);
      }
  };

  // --- Youtube Downloader Logic ---
  
  // Extract Video ID Helper
  const getYoutubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const handleYoutubePreview = async () => {
      if (!ytUrl) return;
      setIsYtPreviewing(true);
      setYtError(null);
      setYtMetadata(null);
      setYtComplete(false);
      setYtDownloadLink(null);

      const videoId = getYoutubeId(ytUrl);
      if (!videoId) {
          setYtError("Invalid YouTube URL");
          setIsYtPreviewing(false);
          return;
      }

      try {
          // Use Noembed for reliable metadata fetching (CORS friendly)
          const res = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);
          const data = await res.json();
          
          if(data.title) {
              setYtMetadata({
                  title: data.title,
                  thumbnail: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`
              });
          } else {
              setYtError("Could not fetch video details. Check URL.");
          }
      } catch (e) {
          console.error("Preview error", e);
          setYtError("Network error while fetching preview.");
      } finally {
          setIsYtPreviewing(false);
      }
  };

  const handleYoutubeProcess = async () => {
      if (!ytUrl) return;
      setIsYtProcessing(true);
      setYtComplete(false);
      setYtError(null);
      setYtDownloadLink(null);

      const baseInstances = [
          'https://api.wuk.sh/api/json',
          'https://cobalt.kwiatekmiki.pl/api/json',
          'https://api.douraj.com/api/json',
          'https://cobalt.q13.me/api/json',
          'https://api.tik.fail/api/json',
          'https://dl.khub.ky/api/json'
      ];

      const instances = baseInstances.sort(() => Math.random() - 0.5);

      let success = false;
      let lastError = "";

      for (const instance of instances) {
          if (success) break;
          
          try {
              const payload: any = {
                  url: ytUrl,
                  filenamePattern: 'basic',
                  disableMetadata: true
              };
              
              if (ytFormat === 'mp3') {
                  payload.isAudioOnly = true;
                  payload.aFormat = 'mp3';
              } else {
                  payload.vQuality = '720';
              }
              
              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 15000); 

              const response = await fetch(instance, {
                  method: 'POST',
                  mode: 'cors',
                  headers: {
                      'Accept': 'application/json',
                      'Content-Type': 'application/json'
                  },
                  body: JSON.stringify(payload),
                  signal: controller.signal
              });
              
              clearTimeout(timeoutId);

              if (!response.ok) continue;
              
              const data = await response.json();

              if (data?.status === 'error' || data?.error) {
                  lastError = data?.text || "Server Error";
                  continue; 
              }

              let link = data?.url;
              if (!link && data?.picker && data.picker.length > 0) {
                  link = data.picker[0].url;
              }
              if (!link && data?.audio) {
                  link = data.audio;
              }

              if (link) {
                  setYtDownloadLink(link);
                  setYtComplete(true);
                  success = true;
              }
          } catch (e) {
             // console.warn("Mirror failed", instance);
          }
      }

      if (!success) {
           setYtError("Unable to connect to download servers. Please check the URL or try again.");
      }
      
      setIsYtProcessing(false);
  };

  // --- Effects Handlers ---

  useEffect(() => {
    if(tracks.instrumental) engine.updateSettings('instrumental', instSettings);
  }, [instSettings, tracks.instrumental]);

  useEffect(() => {
    if(tracks.vocal) engine.updateSettings('vocal', vocalSettings);
  }, [vocalSettings, tracks.vocal]);


  // --- Playback Sync Loop ---
  useEffect(() => {
    let interval: any;
    if (isPlaying && !isExporting) { // Don't interfere with export timing
        const start = Date.now() - (currentTime * 1000);
        interval = setInterval(() => {
             const now = Date.now();
             const newTime = (now - start) / 1000;
             
             // Allow recording to extend past the instrumental duration
             if (isRecording) {
                 // Dynamic duration extension
                 if (newTime > duration) setDuration(newTime);
                 setCurrentTime(newTime);
             } else if (newTime >= duration && duration > 0) {
                 // Auto stop if not recording
                 setIsPlaying(false);
                 setCurrentTime(duration);
                 engine.pause();
             } else {
                 setCurrentTime(newTime);
             }
        }, 50);
    }
    return () => clearInterval(interval);
  }, [isPlaying, duration, isExporting, isRecording]);

  // --- Manage Download URLs for Extractor ---
  useEffect(() => {
      const urls: {vocal: string | null, music: string | null} = { vocal: null, music: null };
      
      if (extractedBlobs.vocal) urls.vocal = safeCreateObjectURL(extractedBlobs.vocal);
      if (extractedBlobs.music) urls.music = safeCreateObjectURL(extractedBlobs.music);
      
      setDownloadUrls(urls);

      // Cleanup
      return () => {
          if (urls.vocal) URL.revokeObjectURL(urls.vocal);
          if (urls.music) URL.revokeObjectURL(urls.music);
      };
  }, [extractedBlobs]);


  // --- Render Helpers ---

  const renderEffectRack = () => (
    <div className="h-full overflow-y-auto pr-2 custom-scrollbar flex flex-col">
       {/* Tab Navigation */}
      <div className="flex p-1 bg-[#111] rounded-lg mb-6 border border-[#222]">
        <button 
            onClick={() => setActiveFxTab('vocal')}
            className={`flex-1 py-2 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${activeFxTab === 'vocal' ? 'bg-[#222] text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
        >
            <Mic size={12} className={activeFxTab === 'vocal' ? 'text-pink-500' : ''} />
            Vocal FX
        </button>
        <button 
            onClick={() => setActiveFxTab('instrumental')}
            className={`flex-1 py-2 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${activeFxTab === 'instrumental' ? 'bg-[#222] text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}
        >
            <Music size={12} className={activeFxTab === 'instrumental' ? 'text-cyan-500' : ''} />
            Inst FX
        </button>
      </div>

      {activeFxTab === 'vocal' ? (
      <div className="space-y-8 animate-in fade-in duration-300">
        
        {/* Pitch & Speed - NEW */}
        <div className="bg-[#111] p-4 rounded-xl border border-[#222]">
            <h3 className="text-[10px] font-bold text-gray-500 uppercase mb-4 flex items-center gap-2">
                <Zap size={12} className="text-yellow-500" /> Pitch & Speed
            </h3>
            <div className="grid grid-cols-2 gap-6">
                 <Knob 
                    label="Pitch Fix" 
                    value={vocalSettings.pitch} min={-12} max={12} step={1}
                    onChange={(v) => setVocalSettings({...vocalSettings, pitch: v})}
                    color={COLORS.secondaryBlue}
                    unit="st"
                 />
                 <Knob 
                    label="Voc Speed" 
                    value={vocalSettings.speed} min={0.5} max={1.5} step={0.1}
                    onChange={(v) => setVocalSettings({...vocalSettings, speed: v})}
                    color={COLORS.accentPink}
                    unit="x"
                 />
            </div>
        </div>

        {/* Dynamics */}
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-[10px] font-bold text-gray-500 uppercase">Active EQ & Dynamics</h3>
                <div className="scale-75 origin-right">
                    <Toggle 
                        label={vocalSettings.enableDynamics ? "ON" : "OFF"} 
                        checked={vocalSettings.enableDynamics}
                        onChange={(v) => setVocalSettings({...vocalSettings, enableDynamics: v})}
                        color={COLORS.accentOrange}
                    />
                </div>
            </div>
            
            {/* EQ Visualization */}
            <div className="bg-[#0A0A0A] p-4 rounded-xl flex justify-between border border-[#222] shadow-inner mb-4">
                <div className="flex flex-col items-center gap-2">
                    <input 
                        type="range"
                        {...({ orient: "vertical" } as any)}
                        className="h-24 w-1 appearance-none bg-zinc-800 rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:shadow-[0_0_10px_cyan]"
                        min="-10" max="10" 
                        value={vocalSettings.eqHigh} 
                        onChange={(e) => setVocalSettings({...vocalSettings, eqHigh: parseFloat(e.target.value)})}
                    />
                    <span className="text-[9px] text-gray-400 font-bold">TREBLE</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                    <input 
                        type="range"
                        {...({ orient: "vertical" } as any)}
                         className="h-24 w-1 appearance-none bg-zinc-800 rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-orange-400 [&::-webkit-slider-thumb]:shadow-[0_0_10px_orange]"
                        min="-10" max="10" 
                        value={vocalSettings.eqMid} 
                        onChange={(e) => setVocalSettings({...vocalSettings, eqMid: parseFloat(e.target.value)})}
                    />
                    <span className="text-[9px] text-gray-400 font-bold">MID</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                    <input 
                        type="range"
                        {...({ orient: "vertical" } as any)}
                         className="h-24 w-1 appearance-none bg-zinc-800 rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-pink-500 [&::-webkit-slider-thumb]:shadow-[0_0_10px_magenta]"
                        min="-10" max="10" 
                        value={vocalSettings.eqLow} 
                        onChange={(e) => setVocalSettings({...vocalSettings, eqLow: parseFloat(e.target.value)})}
                    />
                    <span className="text-[9px] text-gray-400 font-bold">BASS</span>
                </div>
            </div>

            {/* De-Esser Controls */}
            <div className={`bg-[#151515] p-3 rounded-xl border border-zinc-800 transition-opacity ${vocalSettings.enableDynamics ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                <h4 className="text-[9px] font-bold text-gray-500 uppercase mb-3 text-center">De-Esser (Sibilance)</h4>
                <div className="flex items-center gap-4">
                    <div className="flex-1">
                        <Slider 
                             label="Frequency" 
                             value={vocalSettings.deEsserFreq} min={2000} max={10000} step={100}
                             onChange={(v) => setVocalSettings({...vocalSettings, deEsserFreq: v})} 
                             color={COLORS.secondaryBlue}
                        />
                    </div>
                    <div className="scale-90">
                        <Knob 
                            label="Threshold" 
                            value={vocalSettings.deEsserThresh} min={-60} max={0} 
                            onChange={(v) => setVocalSettings({...vocalSettings, deEsserThresh: v})} 
                            color={COLORS.accentOrange}
                            unit="dB"
                        />
                    </div>
                </div>
            </div>
        </div>

        {/* Spatial */}
        <div className="space-y-4">
            <h3 className="text-[10px] font-bold text-gray-500 uppercase">Space / Atmosphere</h3>
            <Slider 
                label="Reverb Size" 
                value={vocalSettings.reverb} min={0} max={1} 
                onChange={(v) => setVocalSettings({...vocalSettings, reverb: v})} 
                color={COLORS.secondaryPurple}
            />
            <Slider 
                label="Delay / Echo" 
                value={vocalSettings.delay} min={0} max={1} 
                onChange={(v) => setVocalSettings({...vocalSettings, delay: v})} 
                color={COLORS.secondaryBlue}
            />
        </div>
      </div>
      ) : (
        // --- INSTRUMENTAL FX PANEL ---
        <div className="space-y-8 animate-in fade-in duration-300">
             <div className="bg-[#111] p-4 rounded-xl border border-[#222]">
                <h3 className="text-[10px] font-bold text-gray-500 uppercase mb-4 flex items-center gap-2">
                    <Layers size={12} className="text-cyan-500" /> Channel Strip
                </h3>
                 <div className="space-y-4">
                    <Slider 
                        label="Master Gain" 
                        value={instSettings.volume} min={-60} max={0} 
                        onChange={(v) => setInstSettings({...instSettings, volume: v})}
                        color={COLORS.secondaryBlue} 
                    />
                    <Slider 
                        label="Pan L/R" 
                        value={instSettings.pan} min={-1} max={1} step={0.05}
                        onChange={(v) => setInstSettings({...instSettings, pan: v})}
                        color={COLORS.text} 
                    />
                 </div>
             </div>

             <div className="space-y-4">
                <h3 className="text-[10px] font-bold text-gray-500 uppercase">Instrumental EQ</h3>
                
                {/* Instrumental EQ Visualization */}
                <div className="bg-[#0A0A0A] p-4 rounded-xl flex justify-between border border-[#222] shadow-inner mb-4">
                    <div className="flex flex-col items-center gap-2">
                        <input 
                            type="range"
                            {...({ orient: "vertical" } as any)}
                            className="h-24 w-1 appearance-none bg-zinc-800 rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:shadow-[0_0_10px_cyan]"
                            min="-10" max="10" 
                            value={instSettings.eqHigh} 
                            onChange={(e) => setInstSettings({...instSettings, eqHigh: parseFloat(e.target.value)})}
                        />
                        <span className="text-[9px] text-gray-400 font-bold">TREBLE</span>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                        <input 
                            type="range"
                            {...({ orient: "vertical" } as any)}
                            className="h-24 w-1 appearance-none bg-zinc-800 rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-orange-400 [&::-webkit-slider-thumb]:shadow-[0_0_10px_orange]"
                            min="-10" max="10" 
                            value={instSettings.eqMid} 
                            onChange={(e) => setInstSettings({...instSettings, eqMid: parseFloat(e.target.value)})}
                        />
                        <span className="text-[9px] text-gray-400 font-bold">MID</span>
                    </div>
                    <div className="flex flex-col items-center gap-2">
                        <input 
                            type="range"
                            {...({ orient: "vertical" } as any)}
                            className="h-24 w-1 appearance-none bg-zinc-800 rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-500 [&::-webkit-slider-thumb]:shadow-[0_0_10px_purple]"
                            min="-10" max="10" 
                            value={instSettings.eqLow} 
                            onChange={(e) => setInstSettings({...instSettings, eqLow: parseFloat(e.target.value)})}
                        />
                        <span className="text-[9px] text-gray-400 font-bold">BASS</span>
                    </div>
                </div>
            </div>
            
            <div className="bg-[#111] p-4 rounded-xl border border-[#222]">
                 <h3 className="text-[10px] font-bold text-gray-500 uppercase mb-4">Playback</h3>
                 <div className="grid grid-cols-2 gap-6">
                     <Knob 
                        label="Bass Boost" 
                        value={instSettings.bassBoost} min={0} max={20} step={1}
                        onChange={(v) => setInstSettings({...instSettings, bassBoost: v})}
                        color={COLORS.secondaryBlue}
                     />
                     <Knob 
                        label="Speed" 
                        value={instSettings.speed} min={0.5} max={1.5} step={0.01}
                        onChange={(v) => setInstSettings({...instSettings, speed: v})}
                        color={COLORS.accentOrange}
                        unit="x"
                     />
                 </div>
            </div>
        </div>
      )}
    </div>
  );

  const renderToolsPage = () => (
      <div className="h-full flex flex-col max-w-6xl mx-auto p-6">
          {/* Tool Tabs */}
          <div className="flex justify-center mb-8">
              <div className="flex p-1 bg-[#111] rounded-full border border-[#333]">
                   <button 
                        onClick={() => setToolTab('extractor')}
                        className={`px-6 py-2 rounded-full text-sm font-bold transition-all flex items-center gap-2 ${toolTab === 'extractor' ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}
                   >
                       <Wand2 size={16} /> AI Stem Extractor
                   </button>
                   <button 
                        onClick={() => setToolTab('youtube')}
                        className={`px-6 py-2 rounded-full text-sm font-bold transition-all flex items-center gap-2 ${toolTab === 'youtube' ? 'bg-gradient-to-r from-red-500 to-orange-500 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}
                   >
                       <Youtube size={16} /> YouTube Downloader
                   </button>
              </div>
          </div>

          <div className="flex-1 bg-[#121212] rounded-3xl border border-[#222] overflow-hidden shadow-2xl relative">
              {toolTab === 'extractor' ? (
                  <div className="h-full flex flex-col items-center justify-center p-8 text-center animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <Wand2 size={48} className="text-cyan-400 mb-6 drop-shadow-[0_0_15px_rgba(34,211,238,0.6)]" />
                        <h2 className="text-3xl font-bold mb-2 text-white">Vocal & Karaoke Isolator</h2>
                        <p className="text-gray-400 mb-8 max-w-md">Upload any audio or video to separate vocals from the music using advanced AI phase cancellation.</p>
                        
                        {!extractionFile ? (
                            <label className="w-full max-w-lg h-48 border-2 border-dashed border-zinc-700 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-cyan-500 hover:bg-zinc-900/50 transition duration-300 group">
                                <div className="p-4 bg-zinc-800 rounded-full mb-4 group-hover:scale-110 transition">
                                    <Upload className="text-zinc-400 group-hover:text-cyan-400" size={24} />
                                </div>
                                <span className="text-lg font-bold text-white">Upload Media File</span>
                                <span className="text-sm text-zinc-500 mt-2">MP3, WAV, MP4, MOV supported</span>
                                <input type="file" accept="audio/*,video/*" onChange={handleExtractionUpload} className="hidden" />
                            </label>
                        ) : (
                            <div className="w-full max-w-lg bg-[#111] p-6 rounded-2xl border border-[#333]">
                                <div className="flex items-center gap-3 mb-6 bg-zinc-900/50 p-3 rounded-xl border border-zinc-800">
                                    {extractionThumbnail ? (
                                        <img src={extractionThumbnail} alt="Thumbnail" className="w-16 h-16 object-cover rounded-lg border border-zinc-700 shadow-md" />
                                    ) : (
                                        <div className="w-16 h-16 bg-zinc-800 rounded-lg flex items-center justify-center">
                                            <Music className="text-zinc-500" />
                                        </div>
                                    )}
                                    <div className="text-left flex-1 min-w-0">
                                        <span className="font-bold text-sm text-white block truncate">{extractionFile.name}</span>
                                        <span className="text-xs text-zinc-500">{(extractionFile.size / 1024 / 1024).toFixed(2)} MB</span>
                                    </div>
                                    <button onClick={() => {setExtractionFile(null); setExtractedBlobs({vocal: null, music: null})}} className="text-xs text-red-400 hover:text-red-300 font-bold px-3 py-1 bg-red-500/10 rounded-full border border-red-500/20">
                                        RESET
                                    </button>
                                </div>
                                
                                {(!extractedBlobs.vocal || !extractedBlobs.music) ? (
                                    <button 
                                            onClick={handleStemExtraction}
                                            disabled={isExtracting}
                                            className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl font-bold text-white shadow-lg hover:shadow-cyan-500/25 transition disabled:opacity-50 flex items-center justify-center gap-2"
                                        >
                                            {isExtracting ? (
                                                <>
                                                    <Loader2 className="animate-spin" size={18} />
                                                    Separating Stems...
                                                </>
                                            ) : (
                                                <>
                                                    <Wand2 size={18} /> Extract Vocals & Music
                                                </>
                                            )}
                                        </button>
                                ) : (
                                    <div className="grid grid-cols-2 gap-4">
                                        <a 
                                            href={downloadUrls.vocal || '#'}
                                            download={`vocal-${extractionFile.name}.wav`}
                                            className={`p-4 bg-zinc-800 rounded-xl hover:bg-zinc-700 transition flex flex-col items-center gap-2 border border-zinc-700 ${!downloadUrls.vocal && 'opacity-50 pointer-events-none'}`}
                                        >
                                            <Mic className="text-pink-500" />
                                            <span className="text-sm font-bold">Download Vocals</span>
                                        </a>
                                        <a 
                                            href={downloadUrls.music || '#'}
                                            download={`karaoke-${extractionFile.name}.wav`}
                                            className={`p-4 bg-zinc-800 rounded-xl hover:bg-zinc-700 transition flex flex-col items-center gap-2 border border-zinc-700 ${!downloadUrls.music && 'opacity-50 pointer-events-none'}`}
                                        >
                                            <Music className="text-cyan-500" />
                                            <span className="text-sm font-bold">Download Karaoke</span>
                                        </a>
                                    </div>
                                )}
                            </div>
                        )}
                  </div>
              ) : (
                  <div className="h-full flex flex-col items-center justify-center p-8 text-center animate-in fade-in slide-in-from-bottom-4 duration-300">
                      <Youtube size={48} className="text-red-500 mb-6 drop-shadow-[0_0_15px_rgba(255,0,0,0.6)]" />
                      <h2 className="text-3xl font-bold mb-2 text-white">YouTube Downloader</h2>
                      <p className="text-gray-400 mb-8 max-w-md">Download Audio (MP3) or Video (MP4) from YouTube. Includes server-side FFmpeg conversion.</p>
                      
                      <div className="w-full max-w-lg bg-[#111] p-6 rounded-2xl border border-[#333] space-y-6">
                          
                          {/* 1. URL Input */}
                          <div className="relative group">
                              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                  <Youtube className="h-5 w-5 text-gray-400 group-focus-within:text-red-500 transition" />
                              </div>
                              <input 
                                  type="text" 
                                  className="block w-full pl-10 pr-3 py-4 border border-zinc-700 rounded-xl leading-5 bg-zinc-900 text-gray-100 placeholder-gray-500 focus:outline-none focus:bg-black focus:ring-2 focus:ring-red-500 focus:border-red-500 sm:text-sm transition-all" 
                                  placeholder="Paste YouTube URL here..." 
                                  value={ytUrl}
                                  onChange={(e) => { 
                                      setYtUrl(e.target.value); 
                                      setYtMetadata(null); 
                                      setYtComplete(false); 
                                      setYtError(null); 
                                  }}
                              />
                          </div>

                          {/* 2. Preview Button (Like Python Script) */}
                          {!ytMetadata && !ytComplete && (
                              <button 
                                onClick={handleYoutubePreview}
                                disabled={!ytUrl || isYtPreviewing}
                                className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl font-bold text-white transition flex items-center justify-center gap-2"
                              >
                                {isYtPreviewing ? <Loader2 className="animate-spin" /> : <ImageIcon size={18} />}
                                Preview Video
                              </button>
                          )}

                          {/* 3. Metadata Preview */}
                          {ytMetadata && (
                             <div className="bg-zinc-900 rounded-xl overflow-hidden border border-zinc-700 animate-in fade-in zoom-in duration-300">
                                <div className="relative aspect-video">
                                    <img src={ytMetadata.thumbnail} alt="Thumbnail" className="w-full h-full object-cover" />
                                    <div className="absolute bottom-2 right-2 bg-black/80 px-2 py-1 rounded text-xs font-bold">HD</div>
                                </div>
                                <div className="p-3">
                                    <h4 className="font-bold text-sm text-left line-clamp-2">{ytMetadata.title}</h4>
                                </div>
                             </div>
                          )}

                          {/* 4. Format & Download */}
                          {ytMetadata && !ytComplete && (
                             <div className="space-y-4 animate-in slide-in-from-bottom-2 duration-300">
                                 <div className="grid grid-cols-2 gap-4 p-1 bg-zinc-900 rounded-xl border border-zinc-800">
                                      <button 
                                        onClick={() => setYtFormat('mp3')}
                                        className={`flex items-center justify-center gap-2 py-3 rounded-lg font-bold transition-all ${ytFormat === 'mp3' ? 'bg-zinc-800 text-white shadow-md border border-zinc-600' : 'text-zinc-500 hover:text-zinc-300'}`}
                                      >
                                          <FileAudio size={18} className={ytFormat === 'mp3' ? 'text-orange-500' : ''} />
                                          MP3 (Audio)
                                      </button>
                                      <button 
                                        onClick={() => setYtFormat('mp4')}
                                        className={`flex items-center justify-center gap-2 py-3 rounded-lg font-bold transition-all ${ytFormat === 'mp4' ? 'bg-zinc-800 text-white shadow-md border border-zinc-600' : 'text-zinc-500 hover:text-zinc-300'}`}
                                      >
                                          <FileVideo size={18} className={ytFormat === 'mp4' ? 'text-blue-500' : ''} />
                                          MP4 (Video)
                                      </button>
                                  </div>

                                  <button 
                                    onClick={handleYoutubeProcess}
                                    disabled={isYtProcessing}
                                    className="w-full py-4 bg-gradient-to-r from-red-600 to-orange-600 rounded-xl font-bold text-white shadow-lg hover:shadow-red-500/25 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transform active:scale-95"
                                  >
                                      {isYtProcessing ? (
                                          <>
                                              <Loader2 className="animate-spin" size={20} />
                                              Converting on Server...
                                          </>
                                      ) : (
                                          <>
                                              <Download size={20} />
                                              Start Download
                                          </>
                                      )}
                                  </button>
                             </div>
                          )}

                          {/* 5. Error & Fallback */}
                          {ytError && (
                              <div className="space-y-3 animate-in fade-in duration-300">
                                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs flex items-center gap-2">
                                    <AlertCircle size={16} /> {ytError}
                                </div>
                                
                                {/* Manual Fallback Button */}
                                <a 
                                   href="https://cobalt.tools" 
                                   target="_blank" 
                                   rel="noopener noreferrer"
                                   className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 rounded-xl flex items-center justify-center gap-2 text-sm text-gray-300 transition"
                                >
                                    <ExternalLink size={16} /> Open External Downloader (Backup)
                                </a>
                              </div>
                          )}

                          {/* 6. Success State */}
                          {ytComplete && (
                              <div className="animate-in fade-in zoom-in duration-300">
                                  <a 
                                    href={ytDownloadLink || '#'}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full py-4 bg-zinc-800 border border-green-500/30 hover:bg-zinc-700 rounded-xl font-bold text-white shadow-[0_0_15px_rgba(74,222,128,0.1)] transition flex items-center justify-center gap-2"
                                  >
                                      <Download size={20} className="text-green-500" />
                                      Click to Save {ytFormat.toUpperCase()}
                                  </a>
                                  <p className="text-xs text-zinc-500 mt-2 text-center">
                                      *Download should start immediately. If not, Right Click &gt; Save Link As.
                                  </p>
                                  <button onClick={() => { setYtUrl(''); setYtComplete(false); setYtMetadata(null); setYtDownloadLink(null); }} className="mt-4 text-sm text-zinc-500 hover:text-white underline block mx-auto">
                                      Convert Another
                                  </button>
                              </div>
                          )}
                      </div>
                  </div>
              )}
          </div>
      </div>
  );

  const renderMusicBrowser = () => (
      <div className="h-full flex flex-col overflow-hidden bg-[#050505]">
          {/* Filters */}
          <div className="p-6 pb-2 flex flex-col gap-4 sticky top-0 bg-[#050505]/90 backdrop-blur-md z-10">
             
             <div className="flex gap-3">
                 <div className="flex-1 flex items-center gap-3 bg-[#121212] p-3 rounded-xl border border-[#222]">
                     <Search className="text-gray-400" size={20} />
                     <input 
                        type="text" 
                        placeholder="Search artists, songs..." 
                        className="bg-transparent w-full outline-none text-white font-medium"
                        value={musicSearch}
                        onChange={(e) => setMusicSearch(e.target.value)}
                     />
                     <button onClick={fetchMusic} className={`p-2 rounded-full hover:bg-zinc-800 transition ${isLoadingMusic ? 'animate-spin' : ''}`}>
                        <RefreshCw size={18} className="text-gray-400 hover:text-white" />
                     </button>
                 </div>
                 
                 <label className="flex items-center gap-2 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-white px-6 py-2 rounded-xl border border-pink-500/20 cursor-pointer shadow-[0_0_15px_rgba(236,72,153,0.3)] hover:shadow-[0_0_20px_rgba(236,72,153,0.5)] transition-all whitespace-nowrap group animate-in fade-in slide-in-from-right-4">
                    <Upload size={18} className="text-white group-hover:scale-110 transition" />
                    <span className="font-bold uppercase tracking-wider text-sm">Import Local File</span>
                    <input type="file" accept="audio/*" multiple onChange={handleLocalMusicUpload} className="hidden" />
                 </label>
             </div>
             
             <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-2">
                 {['All', 'Malayalam', 'Hindi', 'Tamil', 'Telugu', 'English'].map(lang => (
                     <button 
                        key={lang}
                        onClick={() => setActiveLang(lang)}
                        className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition ${activeLang === lang ? 'bg-white text-black' : 'bg-[#121212] text-gray-400 border border-[#222] hover:border-gray-500'}`}
                     >
                         {lang}
                     </button>
                 ))}
             </div>
             <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-2">
                 {['All', 'Movie Songs', 'Pop', 'Mappila Songs', 'Malayalam Album', 'HipHop', 'Melody'].map(cat => (
                     <button 
                        key={cat}
                        onClick={() => setActiveCategory(cat)}
                        className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition ${activeCategory === cat ? 'bg-pink-500 text-white' : 'bg-[#121212] text-gray-400 border border-[#222] hover:border-pink-500/50'}`}
                     >
                         {cat}
                     </button>
                 ))}
             </div>
          </div>

          {/* Grid */}
          <div className="flex-1 overflow-y-auto p-6 pt-2">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <Zap size={18} className="text-yellow-400" /> Trending Now
              </h3>
              
              {isLoadingMusic ? (
                  <div className="h-40 flex items-center justify-center text-gray-500 gap-2">
                      <Loader2 className="animate-spin" /> Loading Top Hits...
                  </div>
              ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-8">
                  {musicQueue.map(track => (
                      <div 
                        key={track.id} 
                        onClick={() => playMusic(track, musicQueue)}
                        className="group relative bg-[#121212] p-3 rounded-2xl hover:bg-[#1a1a1a] transition cursor-pointer border border-transparent hover:border-[#333]"
                      >
                          <div className="relative aspect-square rounded-xl overflow-hidden mb-3 shadow-lg">
                              <img src={track.cover} alt={track.title} className="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
                              <div className={`absolute inset-0 bg-black/40 flex items-center justify-center transition opacity-0 group-hover:opacity-100 ${currentTrack?.id === track.id && musicIsPlaying ? 'opacity-100 bg-black/60' : ''}`}>
                                  {currentTrack?.id === track.id && musicIsPlaying ? (
                                       <div className="flex gap-1 items-end h-6 mb-2">
                                           <span className="w-1 bg-pink-500 animate-pulse h-4"></span>
                                           <span className="w-1 bg-pink-500 animate-pulse h-6 delay-75"></span>
                                           <span className="w-1 bg-pink-500 animate-pulse h-3 delay-150"></span>
                                       </div>
                                  ) : (
                                      <Play fill="white" size={32} className="drop-shadow-lg" />
                                  )}
                              </div>
                              {track.isNew && <span className="absolute top-2 left-2 bg-blue-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-md shadow-sm">NEW</span>}
                          </div>
                          <h4 className="font-bold text-sm text-white truncate">{track.title}</h4>
                          <p className="text-xs text-gray-400 truncate">{track.artist}</p>
                          <div className="flex items-center gap-2 mt-2">
                              <span className="text-[10px] bg-[#222] text-gray-300 px-2 py-0.5 rounded capitalize">{activeLang === 'All' ? 'Music' : activeLang}</span>
                          </div>
                      </div>
                  ))}
              </div>
              )}
              
              {!isLoadingMusic && musicQueue.length === 0 && (
                  <div className="text-center py-20">
                      <p className="text-gray-500">No songs found for this category.</p>
                      <button onClick={() => {setActiveCategory('All'); setActiveLang('All'); setMusicSearch(''); fetchMusic();}} className="mt-4 text-pink-500 font-bold text-sm">Clear Filters</button>
                  </div>
              )}
          </div>
      </div>
  );

  const renderFullPlayer = () => {
      if(!currentTrack) return null;
      return (
          <div className="fixed inset-0 z-[60] bg-black flex flex-col animate-in slide-in-from-bottom duration-300">
              {/* Blurry Background */}
              <div className="absolute inset-0 overflow-hidden">
                   <img src={currentTrack.cover} alt="bg" className="w-full h-full object-cover blur-3xl opacity-40 scale-125" />
                   <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-[#050505]/80 to-[#050505]" />
              </div>

              {/* Header */}
              <div className="relative z-10 flex items-center justify-between p-6">
                  <button onClick={() => setShowFullPlayer(false)} className="p-2 hover:bg-white/10 rounded-full">
                      <ChevronDown color="white" />
                  </button>
                  <span className="text-xs font-bold tracking-widest uppercase text-white/70">NOW PLAYING</span>
                  <button className="p-2 hover:bg-white/10 rounded-full">
                      <Settings color="white" size={20} />
                  </button>
              </div>

              {/* Main Content */}
              <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-8">
                  <div className="w-full max-w-sm aspect-square rounded-[2rem] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 mb-8 relative group">
                      <img src={currentTrack.cover} alt={currentTrack.title} className="w-full h-full object-cover" />
                  </div>

                  <div className="w-full max-w-sm flex items-start justify-between mb-2">
                      <div>
                          <h2 className="text-3xl font-bold text-white mb-1 line-clamp-1">{currentTrack.title}</h2>
                          <p className="text-lg text-gray-300">{currentTrack.artist}</p>
                      </div>
                      <button className="mt-2">
                          <Heart size={28} className="text-white/50 hover:text-pink-500 transition" />
                      </button>
                  </div>
                  <div className="w-full max-w-sm mb-8 flex gap-2">
                      <span className="text-xs bg-white/10 px-2 py-1 rounded text-gray-300">{activeLang !== 'All' ? activeLang : 'Music'}</span>
                  </div>

                  {/* Interactive Progress Bar */}
                  <div className="w-full max-w-sm mb-8 group">
                      <input
                        type="range"
                        min={0}
                        max={musicDuration && !isNaN(musicDuration) ? musicDuration : 100}
                        value={musicCurrentTime}
                        onChange={(e) => handleMusicSeek(Number(e.target.value))}
                        className="w-full h-1.5 bg-white/20 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:opacity-0 group-hover:[&::-webkit-slider-thumb]:opacity-100 transition-all"
                        style={{
                            background: `linear-gradient(to right, white ${(musicCurrentTime / (musicDuration || 1)) * 100}%, rgba(255,255,255,0.2) ${(musicCurrentTime / (musicDuration || 1)) * 100}%)`
                        }}
                      />
                      <div className="flex justify-between text-xs text-gray-400 font-medium mt-2">
                          <span>{formatTime(musicCurrentTime)}</span>
                          <span>{formatTime(musicDuration)}</span>
                      </div>
                  </div>

                  {/* Controls */}
                  <div className="w-full max-w-sm flex items-center justify-between">
                      <button 
                        onClick={() => setMusicMode(musicMode === 'shuffle' ? 'normal' : 'shuffle')}
                        className={`p-2 ${musicMode === 'shuffle' ? 'text-green-400' : 'text-white/60'}`}
                      >
                          <Shuffle size={24} />
                      </button>
                      
                      <button onClick={handleMusicPrev} className="p-2 text-white hover:scale-110 transition">
                          <SkipBack size={32} fill="currentColor" />
                      </button>
                      
                      <button 
                        onClick={toggleMusicPlay}
                        className="w-20 h-20 bg-white rounded-full flex items-center justify-center hover:scale-105 transition shadow-[0_0_30px_rgba(255,255,255,0.2)]"
                      >
                          {musicIsPlaying ? <Pause size={32} fill="black" className="text-black" /> : <Play size={32} fill="black" className="ml-1 text-black" />}
                      </button>
                      
                      <button onClick={handleMusicNext} className="p-2 text-white hover:scale-110 transition">
                          <SkipForward size={32} fill="currentColor" />
                      </button>
                      
                      <button 
                        onClick={() => setMusicMode(musicMode === 'repeat' ? 'normal' : 'repeat')}
                        className={`p-2 ${musicMode === 'repeat' ? 'text-green-400' : 'text-white/60'}`}
                      >
                          <Repeat size={24} />
                      </button>
                  </div>
              </div>
              
              {/* Footer Output */}
              <div className="relative z-10 p-6 w-full flex justify-center">
                  <div className="flex items-center gap-2 text-green-400 bg-green-400/10 px-4 py-2 rounded-full text-xs font-bold">
                      <Disc className="animate-spin" size={14} />
                      ALI's Music Player
                  </div>
              </div>
          </div>
      )
  }

  // --- Small Player (Background) ---
  const renderSmallPlayer = () => {
      if (!currentTrack || showFullPlayer || view === 'mixer') return null; // Don't show in mixer or if full
      return (
          <div 
            onClick={() => setShowFullPlayer(true)}
            className="fixed bottom-20 left-1/2 -translate-x-1/2 w-[90%] max-w-md bg-[#1a1a1a]/90 backdrop-blur-xl p-2 rounded-2xl border border-white/10 shadow-2xl z-40 flex items-center gap-3 cursor-pointer hover:scale-[1.02] transition"
          >
              <img src={currentTrack.cover} className="w-12 h-12 rounded-xl object-cover animate-[spin_10s_linear_infinite]" style={{animationPlayState: musicIsPlaying ? 'running' : 'paused'}} />
              <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-white text-sm truncate">{currentTrack.title}</h4>
                  <p className="text-xs text-gray-400 truncate">{currentTrack.artist}</p>
              </div>
              <div className="flex items-center gap-2 mr-2">
                   <button onClick={(e) => {e.stopPropagation(); toggleMusicPlay();}} className="p-2 bg-white rounded-full text-black">
                        {musicIsPlaying ? <Pause size={16} fill="black" /> : <Play size={16} fill="black" />}
                   </button>
              </div>
          </div>
      )
  }


  return (
    <div className="min-h-screen flex flex-col bg-[#050505] text-white selection:bg-pink-500/30 font-['Space_Grotesk']">
      
      {/* Full Screen Player Overlay */}
      {showFullPlayer && renderFullPlayer()}
      
      {/* Background Music Player Control */}
      {renderSmallPlayer()}

      {/* Export Overlay */}
      {isExporting && (
          <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex flex-col items-center justify-center">
              <div className="w-full max-w-md p-8 text-center">
                  <div className="relative w-24 h-24 mx-auto mb-6">
                       <div className="absolute inset-0 rounded-full border-4 border-zinc-800"></div>
                       <div 
                        className="absolute inset-0 rounded-full border-4 border-orange-500 border-l-transparent animate-spin"
                        style={{ borderRightColor: '#FF5E00', borderTopColor: '#FF5E00' }}
                       ></div>
                       <div className="absolute inset-0 flex items-center justify-center font-bold text-xl">
                           {Math.round(exportProgress)}%
                       </div>
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-2">
                      {exportType === 'video' ? "Rendering Video Mix" : "Exporting Audio Mix"}
                  </h2>
                  <p className="text-zinc-500 text-sm mb-6">Processing... ({Math.round(duration)}s) <br/> Please keep this tab active.</p>
                  
                  <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-orange-500 to-pink-500 transition-all duration-200"
                        style={{ width: `${exportProgress}%` }}
                      ></div>
                  </div>
              </div>
          </div>
      )}

      {/* Top Bar */}
      <header className="h-16 border-b border-zinc-900 flex items-center justify-between px-6 bg-[#080808]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center font-bold text-white shadow-[0_0_15px_rgba(255,106,26,0.6)]">
                NK
            </div>
            <h1 className="font-bold text-xl tracking-tighter hidden md:block bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent">{APP_NAME}</h1>
        </div>

        <nav className="flex items-center bg-[#111] rounded-full p-1 border border-[#222]">
            <button onClick={() => setView('mixer')} className={`px-4 md:px-5 py-2 rounded-full text-[10px] md:text-xs font-bold uppercase tracking-wider transition-all ${view === 'mixer' ? 'bg-[#222] text-white shadow-inner' : 'text-gray-500 hover:text-white'}`}>Mixer</button>
            <button onClick={() => setView('music')} className={`px-4 md:px-5 py-2 rounded-full text-[10px] md:text-xs font-bold uppercase tracking-wider transition-all ${view === 'music' ? 'bg-[#222] text-white shadow-inner' : 'text-gray-500 hover:text-white'}`}>Music</button>
            <button onClick={() => setView('tools')} className={`px-4 md:px-5 py-2 rounded-full text-[10px] md:text-xs font-bold uppercase tracking-wider transition-all ${view === 'tools' ? 'bg-[#222] text-white shadow-inner' : 'text-gray-500 hover:text-white'}`}>Tools</button>
            <button onClick={() => setView('thumbnail')} className={`px-4 md:px-5 py-2 rounded-full text-[10px] md:text-xs font-bold uppercase tracking-wider transition-all ${view === 'thumbnail' ? 'bg-[#222] text-white shadow-inner' : 'text-gray-500 hover:text-white'}`}>Thumbnail</button>
        </nav>

        <div className="flex items-center gap-3">
             {view === 'mixer' && (
                 <>
                    {/* Project Controls */}
                    <div className="flex items-center mr-2 bg-[#111] rounded-lg border border-[#222] overflow-hidden">
                        <button onClick={handleSaveProject} className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 transition" title="Save Project Settings">
                            <Save size={16} />
                        </button>
                        <button onClick={() => projectLoadInputRef.current?.click()} className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 transition border-l border-[#222]" title="Load Project Settings">
                            <FolderOpen size={16} />
                        </button>
                        <input ref={projectLoadInputRef} type="file" accept=".json" onChange={handleLoadProject} className="hidden" />
                    </div>

                    <button onClick={handleReset} className="p-2 text-zinc-400 hover:text-red-500 hover:bg-zinc-800 transition rounded-lg" title="Reset Project">
                        <RotateCcw size={16} />
                    </button>
                    
                    {/* Audio Export */}
                     <button 
                        onClick={handleAudioExport} 
                        className="px-3 py-2 bg-zinc-800 text-white border border-zinc-700 rounded-lg text-xs font-bold hover:bg-zinc-700 transition flex items-center gap-2"
                        title="Export Audio Only (WAV)"
                    >
                        <Music size={14} className="text-cyan-400" />
                        <span className="hidden sm:inline">AUDIO</span>
                    </button>

                    {/* Video Export */}
                    <button 
                        onClick={handleVideoExport} 
                        className="px-5 py-2 bg-white text-black rounded-lg text-xs font-bold hover:bg-gray-200 transition flex items-center gap-2 shadow-[0_0_15px_rgba(255,255,255,0.2)]"
                        title="Export Video with Visualizer"
                    >
                        <Video size={14} />
                        <span className="hidden sm:inline">FINAL DOWNLOAD</span>
                    </button>
                 </>
             )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative">
        {view === 'thumbnail' && (
            <div className="h-full flex items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-[#1a1a1a] via-[#050505] to-black">
                <ThumbnailGen onSetProjectArt={(url) => setProjectThumbnail(url)} />
            </div>
        )}
        
        {view === 'tools' && (
            renderToolsPage()
        )}

        {view === 'music' && (
            renderMusicBrowser()
        )}
        
        {view === 'mixer' && (
            <div className="flex flex-col lg:flex-row h-full">
                
                {/* Left: Tracks Area */}
                <div className="flex-1 flex flex-col p-6 gap-6 overflow-y-auto bg-[radial-gradient(circle_at_top_left,_var(--tw-gradient-stops))] from-[#111] to-[#050505]">
                    
                    {/* Instrumental Track Card */}
                    <div className="bg-[#121212] border border-[#222] rounded-3xl p-6 relative overflow-visible group hover:border-[#333] transition shadow-2xl">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3 text-cyan-400">
                                <div className="p-2 bg-cyan-500/10 rounded-lg">
                                    <Music size={20} />
                                </div>
                                <div>
                                    <span className="text-xs font-bold tracking-widest uppercase text-gray-400 block mb-0.5">Track 01</span>
                                    <span className="text-sm font-bold text-white">INSTRUMENTAL</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-6">
                                {/* Extra Bass Control */}
                                <div className="flex items-center gap-2 mr-4 bg-black/40 px-3 py-1.5 rounded-lg border border-white/5">
                                    <span className="text-[9px] text-gray-500 font-bold uppercase">Extra Bass</span>
                                    <div className="w-16">
                                        <input 
                                            type="range" min="0" max="20" step="1" 
                                            value={instSettings.bassBoost} 
                                            onChange={(e) => setInstSettings({...instSettings, bassBoost: parseFloat(e.target.value)})}
                                            className="w-full h-1 bg-gray-800 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-orange-500 [&::-webkit-slider-thumb]:rounded-full"
                                        />
                                    </div>
                                </div>
                                
                                {/* Explicit Volume Control */}
                                <div className="w-48 bg-black/20 p-2 rounded-xl border border-white/5 flex items-center gap-2">
                                    <Volume2 size={14} className="text-cyan-400" />
                                    <Slider 
                                        label="TRACK VOLUME" 
                                        value={instSettings.volume} min={-60} max={0} 
                                        onChange={(v) => setInstSettings(p => ({...p, volume: v}))}
                                        color={COLORS.secondaryBlue} 
                                    />
                                </div>
                            </div>
                        </div>

                        {tracks.instrumental ? (
                            <Waveform 
                                track={tracks.instrumental} 
                                isPlaying={isPlaying} 
                                currentTime={currentTime}
                                color={COLORS.secondaryBlue}
                                onReady={(d) => {
                                    setDuration(prev => Math.max(prev, d));
                                    // Also sync engine max
                                    setDuration(engine.getMaxDuration());
                                }}
                                onSeek={handleSeek}
                            />
                        ) : (
                            <label className="h-40 border-2 border-dashed border-[#222] rounded-2xl flex flex-col items-center justify-center text-gray-600 cursor-pointer hover:border-cyan-500/50 hover:bg-cyan-500/5 transition duration-300">
                                <Music className="mb-3 opacity-50" size={32} />
                                <span className="text-sm font-bold">DROP MUSIC FILE</span>
                                <input type="file" accept="audio/*" onChange={(e) => handleFileUpload(e, 'instrumental')} className="hidden" />
                            </label>
                        )}
                    </div>

                    {/* Vocal Track Card */}
                    <div className="bg-[#121212] border border-[#222] rounded-3xl p-6 relative overflow-visible group hover:border-[#333] transition shadow-2xl">
                         <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
                            <div className="flex items-center gap-3 text-pink-500">
                                <div className="p-2 bg-pink-500/10 rounded-lg">
                                    <Mic size={20} />
                                </div>
                                <div>
                                    <span className="text-xs font-bold tracking-widest uppercase text-gray-400 block mb-0.5">Track 02</span>
                                    <span className="text-sm font-bold text-white">VOCAL</span>
                                </div>
                            </div>
                             <div className="flex items-center gap-6">
                                {/* Record Button */}
                                <button
                                    onClick={handleRecordToggle}
                                    className={`flex items-center gap-2 px-4 py-1.5 rounded-full border transition-all ${
                                        isRecording 
                                        ? 'bg-red-500 border-red-500 text-white animate-pulse' 
                                        : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-red-500 hover:text-red-500'
                                    }`}
                                >
                                    {isRecording ? <StopCircle size={14} fill="white" /> : <Mic size={14} />}
                                    <span className="text-[10px] font-bold uppercase">{isRecording ? 'REC' : 'RECORD'}</span>
                                </button>
                                
                                {/* Speed Control - NEW */}
                                <div className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-lg border border-white/5">
                                    <span className="text-[9px] text-gray-500 font-bold uppercase">Speed</span>
                                    <div className="w-16">
                                        <input 
                                            type="range" min="0.5" max="1.5" step="0.01" 
                                            value={vocalSettings.speed} 
                                            onChange={(e) => setVocalSettings({...vocalSettings, speed: parseFloat(e.target.value)})}
                                            className="w-full h-1 bg-gray-800 rounded-full appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-pink-500 [&::-webkit-slider-thumb]:rounded-full"
                                        />
                                    </div>
                                </div>

                                {/* SYNC CONTROL */}
                                <div className="flex items-center gap-2 bg-zinc-900 px-3 py-1 rounded-lg border border-zinc-700">
                                    <AlignHorizontalDistributeCenter size={12} className="text-zinc-500" />
                                    <span className="text-[10px] text-zinc-400 font-bold uppercase">SYNC</span>
                                    
                                    <button onClick={() => handleVocalSync(vocalShift - 0.1)} className="p-1 hover:bg-zinc-700 rounded"><Rewind size={10} /></button>
                                    <span className="text-xs font-mono w-12 text-center text-pink-400">{vocalShift > 0 ? '+' : ''}{vocalShift.toFixed(1)}s</span>
                                    <button onClick={() => handleVocalSync(vocalShift + 0.1)} className="p-1 hover:bg-zinc-700 rounded"><FastForward size={10} /></button>
                                </div>

                                {/* Explicit Volume Control */}
                                <div className="w-48 bg-black/20 p-2 rounded-xl border border-white/5 flex items-center gap-2">
                                    <Volume2 size={14} className="text-pink-500" />
                                    <Slider 
                                        label="TRACK VOLUME" 
                                        value={vocalSettings.volume} min={-60} max={0} 
                                        onChange={(v) => setVocalSettings(p => ({...p, volume: v}))} 
                                        color={COLORS.accentPink}
                                    />
                                </div>
                            </div>
                        </div>

                        {tracks.vocal ? (
                            <div className="relative">
                                {/* Visual indicator of shift */}
                                <div 
                                    className="transition-transform duration-300 ease-out"
                                    style={{ transform: `translateX(${vocalShift * 50}px)` }} // Arbitrary visual shift scaling
                                >
                                    <Waveform 
                                        track={tracks.vocal} 
                                        isPlaying={isPlaying} 
                                        currentTime={currentTime} // Vocal receives global time, Engine handles audio offset
                                        color={COLORS.accentPink}
                                        onReady={(d) => {
                                            setDuration(prev => Math.max(prev, d));
                                            setDuration(engine.getMaxDuration());
                                        }}
                                        onSeek={handleSeek}
                                    />
                                </div>
                                {vocalShift !== 0 && (
                                    <div className="absolute top-0 right-0 text-[10px] bg-pink-500 text-white px-2 py-0.5 rounded-bl-lg font-bold shadow-lg">
                                        OFFSET: {vocalShift > 0 ? '+' : ''}{vocalShift}s
                                    </div>
                                )}
                            </div>
                        ) : (
                            <label className="h-40 border-2 border-dashed border-[#222] rounded-2xl flex flex-col items-center justify-center text-gray-600 cursor-pointer hover:border-pink-500/50 hover:bg-pink-500/5 transition duration-300">
                                <Mic className="mb-3 opacity-50" size={32} />
                                <span className="text-sm font-bold">DROP VOCAL FILE</span>
                                <input type="file" accept="audio/*" onChange={(e) => handleFileUpload(e, 'vocal')} className="hidden" />
                            </label>
                        )}
                    </div>

                    {/* Transport Controls */}
                    <div className="mt-auto bg-[#151515]/90 backdrop-blur-lg rounded-2xl p-5 flex items-center justify-between border border-[#222] shadow-[0_10px_40px_rgba(0,0,0,0.5)] sticky bottom-4 z-10">
                        <div className="flex items-center gap-6">
                            <button 
                                onClick={togglePlay}
                                className={`w-16 h-16 rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition shadow-lg ${isPlaying ? 'bg-zinc-800 text-white border border-zinc-700' : 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.3)]'}`}
                            >
                                {isPlaying ? <Pause fill="currentColor" size={24} /> : <Play fill="currentColor" className="ml-1" size={24} />}
                            </button>
                            <div>
                                <div className="text-3xl font-mono text-white tracking-tighter">
                                    {new Date(currentTime * 1000).toISOString().substr(14, 5)}
                                    <span className="text-zinc-600 text-xl"> / {new Date(duration * 1000).toISOString().substr(14, 5)}</span>
                                </div>
                                <div className={`text-[10px] font-bold uppercase tracking-[0.2em] mt-1 flex items-center gap-2 ${isRecording ? 'text-red-500' : 'text-orange-500'}`}>
                                    {isPlaying && <span className={`w-2 h-2 rounded-full animate-pulse ${isRecording ? 'bg-red-500' : 'bg-orange-500'}`} />}
                                    {isPlaying ? (isRecording ? 'RECORDING LIVE' : 'Live Playback') : 'Ready'}
                                </div>
                            </div>
                        </div>
                        
                        {/* Visualizer Mock */}
                        <div className="hidden sm:flex items-center gap-2 h-10">
                            {[...Array(10)].map((_, i) => (
                                <div 
                                    key={i} 
                                    className="w-1.5 bg-zinc-800 rounded-full animate-pulse" 
                                    style={{ 
                                        height: isPlaying ? `${Math.random() * 100}%` : '20%',
                                        animationDuration: `${Math.random() * 0.5 + 0.2}s`
                                    }} 
                                />
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right: FX Panel */}
                <div className="w-full lg:w-[340px] bg-[#0A0A0A] border-l border-[#222] p-6 shadow-2xl z-20">
                    {renderEffectRack()}
                </div>
            </div>
        )}
      </main>

      {/* Footer */}
      <footer className="h-8 border-t border-[#111] flex items-center justify-center text-[10px] uppercase tracking-widest bg-black">
        <span className="neon-text-orange text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-pink-500 font-bold animate-pulse">
            {FOOTER_TEXT}
        </span>
      </footer>
    </div>
  );
};

export default App;
