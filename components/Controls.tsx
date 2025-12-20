import React from 'react';

interface ControlsProps {
  onSwitchCamera: () => void;
  onReset: () => void;
  gain: number;
  setGain: (val: number) => void;
  threshold: number;
  setThreshold: (val: number) => void;
  currentDeviceLabel?: string;
}

export const Controls: React.FC<ControlsProps> = ({ 
  onSwitchCamera, 
  onReset, 
  gain, 
  setGain,
  threshold,
  setThreshold,
  currentDeviceLabel 
}) => {
  return (
    <div className="flex flex-col gap-3 max-w-lg mx-auto w-full px-2">
      <div className="flex gap-4 w-full">
        {/* Gain Control */}
        <div className="flex-1 flex flex-col gap-1">
           <div className="flex justify-between items-end">
              <label className="text-cyber-green font-bold text-[10px] tracking-wider">GAIN</label>
              <span className="text-cyber-green font-mono text-sm font-bold">{gain}x</span>
           </div>
           <input 
              type="range" min="50" max="500" step="10"
              value={gain} onChange={(e) => setGain(Number(e.target.value))}
              className="w-full accent-cyber-green h-2 bg-cyber-darkGreen rounded-full appearance-none"
           />
        </div>

        {/* Threshold Control */}
        <div className="flex-1 flex flex-col gap-1">
           <div className="flex justify-between items-end">
              <label className="text-cyan-400 font-bold text-[10px] tracking-wider">THRESHOLD</label>
              <span className="text-cyan-400 font-mono text-sm font-bold">{threshold}</span>
           </div>
           <input 
              type="range" min="5" max="100" step="1"
              value={threshold} onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-full accent-cyan-400 h-2 bg-cyber-darkGreen rounded-full appearance-none"
           />
        </div>
      </div>
      
      {/* Action Buttons */}
      <div className="flex gap-3 w-full h-10">
        <button 
          onClick={onSwitchCamera}
          className="flex-1 bg-cyber-darkGreen border border-cyber-green text-cyber-green rounded hover:bg-cyber-green hover:text-black transition-all font-bold text-xs"
        >
          CAM: {currentDeviceLabel?.split(' ')[0] || 'SWITCH'}
        </button>
        
        <button 
          onClick={onReset}
          className="w-24 bg-red-950/40 border border-red-500 text-red-500 rounded hover:bg-red-500 hover:text-white transition-all font-bold text-xs"
        >
          RESET
        </button>
      </div>
    </div>
  );
};