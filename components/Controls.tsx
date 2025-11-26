
import React from 'react';

interface KnobProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (val: number) => void;
  color?: string;
  unit?: string;
}

export const Knob: React.FC<KnobProps> = ({ 
  label, value, min, max, step = 1, onChange, color = "#FF5E00", unit = "" 
}) => {
  // Calculate rotation: 270 degree arc (-135 to +135)
  const percent = (value - min) / (max - min);
  const rotation = -135 + (percent * 270);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative group w-14 h-14">
        {/* Outer Ring Glow */}
        <div 
            className="absolute inset-0 rounded-full blur-md opacity-20 group-hover:opacity-40 transition-opacity duration-300"
            style={{ backgroundColor: color }}
        />
        
        {/* Knob Body */}
        <div className="relative w-full h-full rounded-full bg-[#1A1A1A] border border-[#333] shadow-[inset_0_2px_4px_rgba(0,0,0,0.5)] flex items-center justify-center">
            
            {/* Indicator Dot */}
            <div 
                className="absolute w-full h-full rounded-full"
                style={{ transform: `rotate(${rotation}deg)` }}
            >
                <div 
                    className="absolute top-1.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full shadow-[0_0_5px_currentColor]"
                    style={{ backgroundColor: color }}
                />
            </div>
            
            {/* Value Text */}
            <span className="text-[10px] font-bold text-gray-300 select-none">{Math.round(value * 10) / 10}{unit}</span>
        </div>

        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-ns-resize z-10"
          title={label}
        />
      </div>
      <span className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">{label}</span>
    </div>
  );
};

export const Slider: React.FC<KnobProps> = ({
    label, value, min, max, step = 0.01, onChange, color = "#FF5E00" 
}) => {
    return (
        <div className="w-full">
            <div className="flex justify-between mb-1.5">
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{label}</span>
                <span className="text-[10px] text-gray-200 font-mono">{value}</span>
            </div>
            <div className="relative h-2 w-full bg-[#111] rounded-full overflow-hidden border border-[#222]">
                <div 
                    className="absolute top-0 left-0 h-full rounded-full transition-all duration-75"
                    style={{ 
                        width: `${((value - min) / (max - min)) * 100}%`,
                        backgroundColor: color,
                        boxShadow: `0 0 10px ${color}`
                    }}
                />
                <input 
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(e) => onChange(parseFloat(e.target.value))}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
            </div>
        </div>
    )
}

export const Toggle: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void; color?: string }> = ({
    label, checked, onChange, color = "#00F0FF"
}) => (
    <div className="flex items-center justify-between w-full p-2 bg-[#111] rounded-lg border border-[#222]">
        <span className="text-xs text-gray-300 font-bold">{label}</span>
        <button 
            onClick={() => onChange(!checked)}
            className={`w-10 h-5 rounded-full relative transition-all duration-300 border border-transparent ${checked ? 'bg-black border-' + color : 'bg-[#222]'}`}
            style={{ borderColor: checked ? color : '#333' }}
        >
            <div 
                className={`absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all duration-300 ${checked ? 'left-5 shadow-[0_0_8px_currentColor]' : 'left-1 bg-gray-500'}`} 
                style={{ backgroundColor: checked ? color : undefined }}
            />
        </button>
    </div>
)
