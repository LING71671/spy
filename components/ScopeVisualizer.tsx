import React, { useRef, useEffect, useState } from 'react';

interface ScopeVisualizerProps {
  deviceId?: string;
  gain: number;
}

export const ScopeVisualizer: React.FC<ScopeVisualizerProps> = ({ deviceId, gain }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const processCanvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // Signal processing state refs
  const historyRef = useRef<number[]>([]);
  const signalBufferRef = useRef<number[]>([]);
  const animationFrameRef = useRef<number>();
  
  const SAMPLE_SIZE = 50; // 50x50 pixel center
  const HISTORY_LENGTH = 50; // For moving average (High-pass filter)
  const BUFFER_SIZE = 500; // Width of the oscilloscope

  useEffect(() => {
    // Initialize hidden processing canvas once
    if (!processCanvasRef.current) {
      processCanvasRef.current = document.createElement('canvas');
      processCanvasRef.current.width = SAMPLE_SIZE;
      processCanvasRef.current.height = SAMPLE_SIZE;
    }
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
            // Prefer environment facing, though deviceId overrides this usually
            facingMode: 'environment',
            // Try to get reasonable resolution
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // Important for Android WebView
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
      // Draw the center 50x50 of the video into the processing canvas
      const sx = (video.videoWidth - SAMPLE_SIZE) / 2;
      const sy = (video.videoHeight - SAMPLE_SIZE) / 2;
      
      pCtx.drawImage(video, sx, sy, SAMPLE_SIZE, SAMPLE_SIZE, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      
      // 2. Calculate Average Brightness
      const frameData = pCtx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      const data = frameData.data;
      let totalBrightness = 0;
      
      for (let i = 0; i < data.length; i += 4) {
        // Simple RGB average
        totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
      }
      
      const currentAvg = totalBrightness / (SAMPLE_SIZE * SAMPLE_SIZE);

      // 3. High Pass Filter Logic
      // Update history buffer for moving average
      historyRef.current.push(currentAvg);
      if (historyRef.current.length > HISTORY_LENGTH) {
        historyRef.current.shift();
      }
      
      const movingAvg = historyRef.current.reduce((a, b) => a + b, 0) / historyRef.current.length;
      
      // Signal = (Current - Average) * Gain
      // We center it around 0
      const rawSignal = currentAvg - movingAvg;
      const amplifiedSignal = rawSignal * gain;

      // 4. Update Waveform Buffer
      signalBufferRef.current.push(amplifiedSignal);
      if (signalBufferRef.current.length > BUFFER_SIZE) {
        signalBufferRef.current.shift();
      }

      // 5. Draw Everything
      // Clear main canvas
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // --- Draw Waveform ---
      const w = canvas.width;
      const h = canvas.height;
      const centerY = h / 2;
      
      ctx.beginPath();
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 2;
      ctx.shadowBlur = 4;
      ctx.shadowColor = '#00ff00';

      for (let i = 0; i < signalBufferRef.current.length; i++) {
        const x = (i / BUFFER_SIZE) * w;
        // Invert signal for display so + is up
        const y = centerY - signalBufferRef.current[i] * 5; // *5 for basic visual scaling
        
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0; // Reset shadow

      // --- Draw Grid/UI on Canvas ---
      ctx.strokeStyle = '#003300';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(w, centerY);
      ctx.stroke();

      // Draw current value text
      ctx.fillStyle = '#00ff00';
      ctx.font = '12px monospace';
      ctx.fillText(`LUMA: ${currentAvg.toFixed(2)}`, 10, 20);
      ctx.fillText(`DELTA: ${rawSignal.toFixed(2)}`, 10, 35);

      animationFrameRef.current = requestAnimationFrame(process);
    };

    animationFrameRef.current = requestAnimationFrame(process);

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [gain]); // Re-bind if gain changes (or use a ref for gain to avoid restart)

  return (
    <div className="relative w-full h-full flex flex-col">
      {/* Video Preview Layer - Centered */}
      <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden border-b border-cyber-green">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="absolute w-full h-full object-cover opacity-60"
        />
        
        {/* Crosshair Overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="relative w-12 h-12">
                {/* Horizontal line */}
                <div className="absolute top-1/2 left-0 w-full h-0.5 bg-red-600 -translate-y-1/2 shadow-[0_0_5px_rgba(255,0,0,0.8)]"></div>
                {/* Vertical line */}
                <div className="absolute left-1/2 top-0 h-full w-0.5 bg-red-600 -translate-x-1/2 shadow-[0_0_5px_rgba(255,0,0,0.8)]"></div>
                {/* Center Gap box */}
                <div className="absolute top-1/2 left-1/2 w-2 h-2 border border-red-500 -translate-x-1/2 -translate-y-1/2"></div>
            </div>
        </div>
      </div>

      {/* Oscilloscope Canvas */}
      <div className="h-48 w-full bg-cyber-black relative border-t-2 border-cyber-green">
        <canvas 
          ref={canvasRef} 
          width={500} 
          height={200}
          className="w-full h-full block"
        />
      </div>
    </div>
  );
};