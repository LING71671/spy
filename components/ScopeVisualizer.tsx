import React, { useRef, useEffect } from 'react';

interface ScopeVisualizerProps {
  deviceId?: string;
  gain: number;
}

export const ScopeVisualizer: React.FC<ScopeVisualizerProps> = ({ deviceId, gain }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const processCanvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // Signal processing state refs
  // IIR Filter State: baseline represents the DC offset
  const baselineRef = useRef<number | null>(null);
  const signalBufferRef = useRef<number[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  
  const SAMPLE_SIZE = 50; // 50x50 pixel center processing area
  const BUFFER_SIZE = 500; // Width of the oscilloscope data buffer

  useEffect(() => {
    // Initialize hidden processing canvas once
    if (!processCanvasRef.current) {
      processCanvasRef.current = document.createElement('canvas');
      processCanvasRef.current.width = SAMPLE_SIZE;
      processCanvasRef.current.height = SAMPLE_SIZE;
    }
  }, []);

  // Handle Canvas Resizing (Responsive & Retina support)
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && canvasRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvasRef.current.width = width * dpr;
        canvasRef.current.height = height * dpr;
        
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) ctx.scale(dpr, dpr);

        canvasRef.current.style.width = `${width}px`;
        canvasRef.current.style.height = `${height}px`;
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Initialize Camera Stream
  useEffect(() => {
    const startStream = async () => {
      if (!deviceId) return;
      
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
      
      // Reset baseline when camera changes
      baselineRef.current = null;

      console.log(`Starting AC-Coupled stream for device: ${deviceId}`);
      
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: deviceId },
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 },
            // Lock WB/Exposure if possible
            // @ts-ignore
            advanced: [{ exposureMode: 'continuous', whiteBalanceMode: 'manual' }] 
          },
          audio: false
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true'); 
          videoRef.current.setAttribute('webkit-playsinline', 'true');
        }
      } catch (err) {
        console.error("Failed to access camera:", err);
      }
    };

    startStream();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [deviceId]);

  // Processing Loop - "AC-Coupled" Algorithm
  useEffect(() => {
    const process = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const pCanvas = processCanvasRef.current;
      
      if (!video || !canvas || !pCanvas || video.readyState !== 4) {
        animationFrameRef.current = requestAnimationFrame(process);
        return;
      }

      const ctx = canvas.getContext('2d');
      const pCtx = pCanvas.getContext('2d');
      
      if (!ctx || !pCtx) return;

      // 1. Extract Center ROI
      const sx = (video.videoWidth - SAMPLE_SIZE) / 2;
      const sy = (video.videoHeight - SAMPLE_SIZE) / 2;
      pCtx.drawImage(video, sx, sy, SAMPLE_SIZE, SAMPLE_SIZE, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      
      // 2. Separate Channels for "Blue - Green" Logic
      const frameData = pCtx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      const data = frameData.data; // RGBA array
      
      let sumDiff = 0;
      
      for (let i = 0; i < data.length; i += 4) {
        // [R, G, B, A]
        // sumDiff += (Blue - Green)
        sumDiff += (data[i + 2] - data[i + 1]);
      }
      
      const pixelCount = SAMPLE_SIZE * SAMPLE_SIZE;
      const rawValue = sumDiff / pixelCount;

      // 3. IIR High-Pass Filter (Dynamic Baseline Subtraction)
      // IIR Formula: Baseline = (Baseline * 0.95) + (Raw * 0.05)
      // This acts as a Low Pass Filter for the baseline
      if (baselineRef.current === null) {
        baselineRef.current = rawValue;
      } else {
        baselineRef.current = (baselineRef.current * 0.95) + (rawValue * 0.05);
      }

      // 4. Extract AC Signal (High Pass)
      // AC = Signal - DC
      const acSignal = rawValue - baselineRef.current;
      const amplifiedSignal = acSignal * gain;

      // 5. Update Visualization Buffer
      signalBufferRef.current.push(amplifiedSignal);
      if (signalBufferRef.current.length > BUFFER_SIZE) {
        signalBufferRef.current.shift();
      }

      // --- Drawing ---
      const width = parseFloat(canvas.style.width); 
      const height = parseFloat(canvas.style.height);
      const centerY = height / 2;
      
      // Clear Background
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, width, height);

      // Draw Grid
      ctx.strokeStyle = '#003300';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(width, centerY);
      ctx.stroke();

      // Draw Waveform
      ctx.beginPath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#00ff41'; // Cyber green
      ctx.shadowColor = '#00ff41';
      ctx.shadowBlur = 4;

      for (let i = 0; i < signalBufferRef.current.length; i++) {
        const x = (i / (BUFFER_SIZE - 1)) * width;
        const val = signalBufferRef.current[i];
        
        // Invert Y because Canvas Y grows downwards. Positive signal should go UP.
        const y = centerY - val; 
        
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // --- HUD Text ---
      ctx.font = 'bold 14px monospace';
      
      // 1. Stats
      ctx.fillStyle = '#888';
      ctx.fillText("DC OFFSET", 10, 20);
      ctx.fillStyle = '#fff';
      ctx.fillText(baselineRef.current.toFixed(2), 10, 40);

      ctx.fillStyle = '#888';
      ctx.fillText("AC SIGNAL", 120, 20);
      ctx.fillStyle = '#00ff41'; // Green Highlight
      ctx.fillText(amplifiedSignal.toFixed(2), 120, 40);
      
      // Signal Detection visual logic
      const THRESHOLD = 50;
      if (Math.abs(amplifiedSignal) > THRESHOLD) {
         ctx.fillStyle = '#ff003c';
         ctx.fillText("SIGNAL DETECTED", 10, height - 10);
         
         // Visual pulse marker on the right
         ctx.beginPath();
         ctx.arc(width - 20, 20, 5, 0, Math.PI * 2);
         ctx.fill();
      }

      animationFrameRef.current = requestAnimationFrame(process);
    };

    animationFrameRef.current = requestAnimationFrame(process);

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [gain]);

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* Video Preview Layer */}
      <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden border-b border-cyber-green/50">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="absolute w-full h-full object-cover opacity-40 grayscale contrast-125" 
        />
        
        {/* ROI Box - Red Cyberpunk Crosshair */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="relative w-16 h-16">
                {/* Brackets */}
                <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-cyber-green"></div>
                <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-cyber-green"></div>
                <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-cyber-green"></div>
                <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-cyber-green"></div>
                
                {/* Red Crosshair Center */}
                <div className="absolute top-1/2 left-1/2 w-8 h-0.5 bg-red-600 -translate-x-1/2 -translate-y-1/2 shadow-[0_0_8px_#ff0000]"></div>
                <div className="absolute top-1/2 left-1/2 h-8 w-0.5 bg-red-600 -translate-x-1/2 -translate-y-1/2 shadow-[0_0_8px_#ff0000]"></div>
            </div>
        </div>
      </div>

      {/* Oscilloscope Container */}
      <div ref={containerRef} className="h-48 w-full bg-cyber-black relative border-t-2 border-cyber-darkGreen shrink-0">
        <canvas 
          ref={canvasRef} 
          className="block w-full h-full"
        />
        {/* Mid line for scope */}
        <div className="absolute top-1/2 left-0 w-full h-px bg-cyber-green/30 pointer-events-none"></div>
      </div>
    </div>
  );
};