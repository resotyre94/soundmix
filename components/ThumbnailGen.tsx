
import React, { useRef, useEffect, useState } from 'react';
import { Download, Upload, Type, CheckCircle2 } from 'lucide-react';

interface ThumbnailGenProps {
    onSetProjectArt?: (dataUrl: string) => void;
}

const ThumbnailGen: React.FC<ThumbnailGenProps> = ({ onSetProjectArt }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [songName, setSongName] = useState("Sounds");
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [gradientType, setGradientType] = useState<'sunset' | 'ocean' | 'midnight'>('sunset');
  const [applied, setApplied] = useState(false);

  // Particle System State
  const particles = useRef<{x: number, y: number, size: number, speedY: number, life: number}[]>([]);
  const animationFrameId = useRef<number>(0);

  const initParticles = (width: number, height: number) => {
    if (particles.current.length < 50) {
      particles.current.push({
        x: width / 2 + (Math.random() - 0.5) * 100,
        y: height / 2 + 50,
        size: Math.random() * 20 + 10,
        speedY: Math.random() * 2 + 1,
        life: 1.0
      });
    }
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // 1. Background
    if (bgImage) {
        ctx.drawImage(bgImage, 0, 0, width, height);
        // Darken overlay
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(0,0,width,height);
    } else {
        const grad = ctx.createLinearGradient(0, 0, width, height);
        if (gradientType === 'sunset') {
            grad.addColorStop(0, '#FF3C8A');
            grad.addColorStop(1, '#FF6A1A');
        } else if (gradientType === 'ocean') {
            grad.addColorStop(0, '#000428');
            grad.addColorStop(1, '#4DF2FF');
        } else {
            grad.addColorStop(0, '#0F0F0F');
            grad.addColorStop(1, '#2a2a2a');
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
    }

    // 2. Central Circle Glow
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = 180;

    // Neon Glow
    ctx.shadowBlur = 40;
    ctx.shadowColor = gradientType === 'ocean' ? '#4DF2FF' : '#FF6A1A';
    
    // Circle Border
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#FFFFFF';
    ctx.stroke();
    
    // Reset Shadow for interior
    ctx.shadowBlur = 0;
    
    // 3. Fire Effect
    initParticles(width, height);
    particles.current.forEach((p, i) => {
        p.y -= p.speedY;
        p.life -= 0.02;
        p.size *= 0.95;

        if (p.life <= 0) {
            particles.current.splice(i, 1);
        } else {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            // Fire Colors
            const r = 255;
            const g = Math.floor(100 + (p.life * 155));
            const b = 0;
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${p.life})`;
            ctx.fill();
        }
    });

    // 4. Text - "NK"
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#FF3C8A';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 120px "Space Grotesk"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText("NK", centerX, centerY - 20);

    // 5. Text - Song Name
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#4DF2FF';
    ctx.font = 'bold 30px "Space Grotesk"';
    ctx.fillText(songName.toUpperCase(), centerX, centerY + 60);

    // Loop
    animationFrameId.current = requestAnimationFrame(draw);
  };

  useEffect(() => {
    if (canvasRef.current) {
        canvasRef.current.width = 600;
        canvasRef.current.height = 600;
        draw();
    }
    return () => cancelAnimationFrame(animationFrameId.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songName, bgImage, gradientType]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => setBgImage(img);
            img.src = event.target?.result as string;
        };
        reader.readAsDataURL(file);
    }
  };

  const handleDownload = () => {
      const link = document.createElement('a');
      link.download = `${songName}-thumbnail.png`;
      link.href = canvasRef.current?.toDataURL() || '';
      link.click();
  };

  const handleApply = () => {
      if(onSetProjectArt && canvasRef.current) {
          const data = canvasRef.current.toDataURL();
          onSetProjectArt(data);
          setApplied(true);
          setTimeout(() => setApplied(false), 2000);
      }
  }

  return (
    <div className="flex flex-col md:flex-row gap-8 items-center justify-center p-8 bg-zinc-900/30 rounded-3xl border border-zinc-800">
        {/* Canvas Preview */}
        <div className="relative group">
            <canvas ref={canvasRef} className="w-[300px] h-[300px] md:w-[400px] md:h-[400px] rounded-xl shadow-2xl shadow-black border border-zinc-700" />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition bg-black/50 rounded-xl pointer-events-none">
                <span className="text-white font-bold">Preview</span>
            </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-6 w-full max-w-sm">
            <div>
                <h3 className="text-2xl font-bold mb-2 text-white">Thumbnail Creator</h3>
                <p className="text-zinc-400 text-sm">Create viral-ready cover art for your mix.</p>
            </div>

            <div className="space-y-4">
                {/* Text Input */}
                <div className="flex flex-col gap-1">
                    <label className="text-xs text-zinc-500 uppercase">Track Title</label>
                    <div className="flex items-center gap-2 bg-zinc-800 p-3 rounded-lg border border-zinc-700 focus-within:border-accentPink">
                        <Type size={18} className="text-zinc-400" />
                        <input 
                            type="text" 
                            value={songName} 
                            onChange={(e) => setSongName(e.target.value)}
                            className="bg-transparent outline-none text-white w-full font-bold"
                            maxLength={12}
                        />
                    </div>
                </div>

                {/* Gradient Select */}
                <div className="flex gap-2">
                    {['sunset', 'ocean', 'midnight'].map(g => (
                        <button
                            key={g}
                            onClick={() => { setGradientType(g as any); setBgImage(null); }}
                            className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase transition ${gradientType === g && !bgImage ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}
                        >
                            {g}
                        </button>
                    ))}
                </div>

                {/* Image Upload */}
                <div>
                     <label className="flex items-center justify-center w-full gap-2 p-3 border border-dashed border-zinc-600 rounded-lg hover:bg-zinc-800 cursor-pointer transition">
                        <Upload size={18} className="text-zinc-400" />
                        <span className="text-sm text-zinc-300">Upload Background (Optional)</span>
                        <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                     </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <button 
                        onClick={handleDownload}
                        className="py-4 bg-zinc-800 rounded-xl font-bold text-white border border-zinc-700 hover:bg-zinc-700 transition flex items-center justify-center gap-2"
                    >
                        <Download size={20} />
                        PNG
                    </button>
                    <button 
                        onClick={handleApply}
                        className={`py-4 rounded-xl font-bold text-white shadow-lg transition flex items-center justify-center gap-2 ${applied ? 'bg-green-500' : 'bg-gradient-to-r from-orange-500 to-pink-500 hover:shadow-orange-500/40 transform hover:-translate-y-1'}`}
                    >
                        {applied ? <CheckCircle2 size={20}/> : <CheckCircle2 size={20} />}
                        {applied ? 'Set!' : 'Use Art'}
                    </button>
                </div>
            </div>
        </div>
    </div>
  );
};

export default ThumbnailGen;
