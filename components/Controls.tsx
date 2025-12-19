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
    <div className="flex flex-col gap-4 max-w-lg mx-auto w-full px-2">
      {/* Gain Control */}
      <div className="flex flex-col gap-1">
         <div className="flex justify-between items-end">
            <label className="text-cyber-green font-bold text-sm tracking-wider">SIGNAL GAIN</label>
            <span className="text-cyber-green font-mono text-xl font-bold">{gain}x</span>
         </div>
         
         <div className="relative h-10 flex items-center">
            <input 
                type="range" 
                min="1" 
                max="50" 
                step="1"
                value={gain} 
                onChange={(e) => setGain(Number(e.target.value))}
                className="
                  w-full appearance-none bg-transparent focus:outline-none 
                  [&::-webkit-slider-runnable-track]:h-2 
                  [&::-webkit-slider-runnable-track]:bg-cyber-darkGreen 
                  [&::-webkit-slider-runnable-track]:rounded-full
                  [&::-webkit-slider-thumb]:appearance-none 
                  [&::-webkit-slider-thumb]:h-8 
                  [&::-webkit-slider-thumb]:w-8 
                  [&::-webkit-slider-thumb]:-mt-3
                  [&::-webkit-slider-thumb]:bg-cyber-green 
                  [&::-webkit-slider-thumb]:rounded-full 
                  [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(0,255,0,0.5)]
                  [&::-webkit-slider-thumb]:border-2
                  [&::-webkit-slider-thumb]:border-black
                "
            />
         </div>
      </div>
      
      {/* Action Buttons */}
      <div className="flex gap-3 w-full h-14">
        <button 
          onClick={onSwitchCamera}
          className="flex-1 bg-cyber-darkGreen border border-cyber-green text-cyber-green rounded active:bg-cyber-green active:text-black transition-all duration-100 font-bold flex flex-col items-center justify-center touch-manipulation"
        >
          <span className="text-lg">SWITCH CAM</span>
          <span className="text-[10px] opacity-70 font-normal max-w-[150px] truncate">
            {currentDeviceLabel || 'Loading...'}
          </span>
        </button>
        
        <button 
          onClick={onReset}
          className="w-24 bg-red-950/40 border border-red-500 text-red-500 rounded active:bg-red-500 active:text-black transition-all duration-100 font-bold text-lg touch-manipulation"
        >
          RESET
        </button>
      </div>
    </div>
  );
};