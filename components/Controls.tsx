import React from 'react';

interface ControlsProps {
  onSwitchCamera: () => void;
  onReset: () => void;
  gain: number;
  setGain: (val: number) => void;
  currentDeviceLabel?: string;
}

export const Controls: React.FC<ControlsProps> = ({ 
  onSwitchCamera, 
  onReset, 
  gain, 
  setGain,
  currentDeviceLabel 
}) => {
  return (
    <div className="flex flex-col gap-3 max-w-lg mx-auto w-full">
      <div className="flex items-center justify-between gap-4">
         <span className="whitespace-nowrap font-bold text-sm">GAIN: {gain}x</span>
         <input 
            type="range" 
            min="1" 
            max="50" 
            step="1"
            value={gain} 
            onChange={(e) => setGain(Number(e.target.value))}
            className="w-full accent-cyber-green h-2 bg-cyber-darkGreen rounded-lg appearance-none cursor-pointer"
         />
      </div>
      
      <div className="flex gap-2 w-full">
        <button 
          onClick={onSwitchCamera}
          className="flex-1 bg-cyber-darkGreen border border-cyber-green text-cyber-green py-3 px-4 rounded active:bg-cyber-green active:text-black transition-colors font-bold uppercase truncate"
        >
          SWITCH CAM
          <div className="text-[10px] opacity-70 normal-case truncate">
            {currentDeviceLabel || 'Loading...'}
          </div>
        </button>
        
        <button 
          onClick={onReset}
          className="flex-none w-24 bg-red-900/30 border border-red-500 text-red-500 py-3 px-4 rounded active:bg-red-500 active:text-black transition-colors font-bold uppercase"
        >
          RESET
        </button>
      </div>
    </div>
  );
};