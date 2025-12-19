import React, { useRef, useEffect, useState } from 'react';

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
  const historyRef = useRef<number[]>([]);
  const signalBufferRef = useRef<number[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  
  const SAMPLE_SIZE = 50; // 50x50 pixel center
  const HISTORY_LENGTH = 50; // For moving average (High-pass filter)
  const BUFFER_SIZE = 500; // Width of the oscilloscope data buffer

  useEffect(() => {
    // Initialize hidden processing canvas once
    if (!processCanvasRef.current) {
      processCanvasRef.current = document.createElement('canvas');
      processCanvasRef.current.width = SAMPLE_SIZE;
      processCanvasRef.current.height = SAMPLE_SIZE;
    }
  }, []);

  // Handle Canvas Resizing
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && canvasRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        // Handle High DPI screens
        const dpr = window.devicePixelRatio || 1;
        canvasRef.current.width = width * dpr;
        canvasRef.current.height = height * dpr;
        
        // Scale context to match
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) ctx.scale(dpr, dpr);

        // Store logical size for drawing loop
        canvasRef.current.style.width = `${width}px`;
        canvasRef.current.style.height = `${height}px`;
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // Initial size

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Initialize Camera Stream
  useEffect(() => {
    const startStream = async () => {
      if (!deviceId) return;
      
      // Stop previous tracks
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }

      console.log(`Starting stream for device: ${deviceId}`);
      
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: deviceId },
            facingMode: 'environment', // Prefer back camera
            width: { ideal: 1280 },
            height: { ideal: 720 },
            // Advanced constraint to try to lock exposure if possible (experimental)
            // @ts-ignore
            advanced: [{ exposureMode: 'continuous' }] 
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

  // Processing Loop
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

      // 1. Extract Center Area
      const sx = (video.videoWidth - SAMPLE_SIZE) / 2;
      const sy = (video.videoHeight - SAMPLE_SIZE) / 2;
      pCtx.drawImage(video, sx, sy, SAMPLE_SIZE, SAMPLE_SIZE, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      
      // 2. Calculate Average Brightness (Luma)
      // Rec. 601 Luma formula (R*0.299 + G*0.587 + B*0.114) is better for human perception, 
      // but for raw signal detection from a screen, a simple average or Green channel is often enough.
      // We stick to simple average to match the white/black logic provided.
      const frameData = pCtx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      const data = frameData.data;
      let totalBrightness = 0;
      for (let i = 0; i < data.length; i += 4) {
        totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
      }
      const currentAvg = totalBrightness / (SAMPLE_SIZE * SAMPLE_SIZE);

      // 3. High Pass Filter Logic
      historyRef.current.push(currentAvg);
      if (historyRef.current.length > HISTORY_LENGTH) {
        historyRef.current.shift();
      }
      const movingAvg = historyRef.current.reduce((a, b) => a + b, 0) / historyRef.current.length;
      
      // Signal calc: Invert logic? No, screen goes DARKER when alpha is applied.
      // So (Current - MovingAvg) will be NEGATIVE when signal is ON (masked).
      // To visualise "Pulse", we might want to invert it visually or just look at amplitude.
      // Let's keep it raw.
      const rawSignal = currentAvg - movingAvg;
      const amplifiedSignal = rawSignal * gain;

      // 4. Update Waveform Buffer
      signalBufferRef.current.push(amplifiedSignal);
      if (signalBufferRef.current.length > BUFFER_SIZE) {
        signalBufferRef.current.shift();
      }

      // 5. Draw Everything
      const width = parseFloat(canvas.style.width); 
      const height = parseFloat(canvas.style.height);
      const centerY = height / 2;
      
      // Clear
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, width, height);

      // --- Draw Waveform ---
      ctx.beginPath();
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 4;
      ctx.shadowColor = '#00ff00';

      for (let i = 0; i < signalBufferRef.current.length; i++) {
        const x = (i / (BUFFER_SIZE - 1)) * width;
        const val = signalBufferRef.current[i];
        // Scale visual: arbitrary factor to make small signals visible
        // Invert val so negative (darker) goes DOWN? Or UP?
        // Standard oscilloscope: +V is Up. 
        // Our signal drops (negative) when Pulse is Active (Darker).
        // Let's draw it as is.
        const y = centerY - val * 5; 
        
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // --- Draw Grid/UI ---
      ctx.strokeStyle = '#003300';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(width, centerY);
      ctx.stroke();

      // --- Exposure / Signal Quality Meter ---
      // Right side bar
      const barWidth = 10;
      const barHeight = height - 20;
      const barX = width - 20;
      const barY = 10;
      
      // Exposure Background
      ctx.fillStyle = '#111';
      ctx.fillRect(barX, barY, barWidth, barHeight);
      
      // Exposure Level (0-255 mapped to height)
      const exposureNorm = Math.min(Math.max(currentAvg / 255, 0), 1);
      const levelHeight = exposureNorm * barHeight;
      
      // Color based on range
      if (currentAvg < 50) ctx.fillStyle = '#ff0000'; // Too dark
      else if (currentAvg > 240) ctx.fillStyle = '#ffff00'; // Clipping
      else ctx.fillStyle = '#00ff00'; // Good
      
      ctx.fillRect(barX, barY + (barHeight - levelHeight), barWidth, levelHeight);
      
      // Border for bar
      ctx.strokeStyle = '#333';
      ctx.strokeRect(barX, barY, barWidth, barHeight);

      // --- Status Text ---
      ctx.font = 'bold 14px monospace';
      
      // 1. Raw Value
      ctx.fillStyle = '#00ff00';
      ctx.fillText(`LUMA: ${currentAvg.toFixed(1)}`, 10, 20);
      
      // 2. Delta
      ctx.fillText(`DELTA: ${rawSignal.toFixed(2)}`, 10, 38);
      
      // 3. User Feedback Warning
      if (currentAvg < 50) {
        ctx.fillStyle = '#ff3333';
        ctx.fillText("⚠ LOW LIGHT: AIM AT BRIGHTER AREA", 10, height - 10);
      } else if (currentAvg > 250) {
        ctx.fillStyle = '#ffff00';
        ctx.fillText("⚠ SATURATION: REDUCE BRIGHTNESS", 10, height - 10);
      } else if (Math.abs(rawSignal) * gain < 0.5 && gain > 20) {
         // High gain but low signal?
         ctx.fillStyle = '#555';
         ctx.fillText("SEARCHING FOR SIGNAL...", 10, height - 10);
      } else if (Math.abs(rawSignal) > 0.5) {
          ctx.fillStyle = '#00ff00';
          ctx.fillText("SIGNAL DETECTED", 10, height - 10);
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
      <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden border-b border-cyber-green">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="absolute w-full h-full object-cover opacity-60"
        />
        
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="relative w-12 h-12">
                <div className="absolute top-1/2 left-0 w-full h-0.5 bg-red-600 -translate-y-1/2 shadow-[0_0_5px_rgba(255,0,0,0.8)]"></div>
                <div className="absolute left-1/2 top-0 h-full w-0.5 bg-red-600 -translate-x-1/2 shadow-[0_0_5px_rgba(255,0,0,0.8)]"></div>
                <div className="absolute top-1/2 left-1/2 w-2 h-2 border border-red-500 -translate-x-1/2 -translate-y-1/2"></div>
            </div>
        </div>
      </div>

      {/* Oscilloscope Container */}
      <div ref={containerRef} className="h-48 w-full bg-cyber-black relative border-t-2 border-cyber-green shrink-0">
        <canvas 
          ref={canvasRef} 
          className="block w-full h-full"
        />
      </div>
    </div>
  );
};