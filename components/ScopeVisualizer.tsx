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
  // Stores the (Blue - Green) history for detrending
  const historyRef = useRef<number[]>([]);
  const signalBufferRef = useRef<number[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  
  const SAMPLE_SIZE = 50; // 50x50 pixel center processing area
  const MA_WINDOW = 20;   // Moving Average Window for baseline calculation
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

      console.log(`Starting Blue-Hunter stream for device: ${deviceId}`);
      
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: deviceId },
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 },
            // Lock WB/Exposure if possible to prevent auto-cancellation of our signal
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

  // Processing Loop - "Blue-Hunter" Algorithm
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
      
      let totalBlue = 0;
      let totalGreen = 0;
      
      for (let i = 0; i < data.length; i += 4) {
        // [R, G, B, A]
        totalGreen += data[i + 1];
        totalBlue += data[i + 2];
      }
      
      const pixelCount = SAMPLE_SIZE * SAMPLE_SIZE;
      const bMean = totalBlue / pixelCount;
      const gMean = totalGreen / pixelCount;

      // 3. CORE ALGORITHM: (Blue - Green)
      // This subtractive method cancels out global brightness fluctuations 
      // (where B and G rise/fall together), isolating the specific spectral shift.
      const rawDiff = bMean - gMean;

      // 4. Detrending (High Pass Filter)
      // Removes the DC offset (color of the wall/object) to isolate the AC pulses.
      historyRef.current.push(rawDiff);
      if (historyRef.current.length > MA_WINDOW) {
        historyRef.current.shift();
      }
      
      let baseline = rawDiff;
      if (historyRef.current.length > 5) { // Wait for a little history
         baseline = historyRef.current.reduce((a, b) => a + b, 0) / historyRef.current.length;
      }

      // Signal = (Difference - Baseline) * Gain
      // When Blue Channel pulses +1, (B-G) increases, so Signal goes POSITIVE.
      const acComponent = rawDiff - baseline;
      const amplifiedSignal = acComponent * gain;

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
      // Optional grid lines
      ctx.moveTo(0, centerY - 50);
      ctx.lineTo(width, centerY - 50);
      ctx.moveTo(0, centerY + 50);
      ctx.lineTo(width, centerY + 50);
      ctx.stroke();

      // Draw Waveform
      ctx.beginPath();
      ctx.lineWidth = 3; // Thicker line for better visibility on mobile
      
      // Dynamic color based on signal polarity
      // Cyan/Blue for positive (Blue Pulse), Darker for negative
      ctx.strokeStyle = '#0088ff'; 
      ctx.shadowColor = '#0088ff';
      ctx.shadowBlur = 10;

      for (let i = 0; i < signalBufferRef.current.length; i++) {
        const x = (i / (BUFFER_SIZE - 1)) * width;
        const val = signalBufferRef.current[i];
        
        // Scale visual: 1 unit of change * Gain 50 = 50 pixels.
        // Invert Y because Canvas Y grows downwards. Positive signal should go UP.
        const y = centerY - val; 
        
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // --- Exposure / Saturation Meter (Monitoring Blue Channel) ---
      // Crucial: If Blue channel clips at 255, we cannot detect the +1 pulse.
      const barWidth = 12;
      const barHeight = height - 20;
      const barX = width - 20;
      const barY = 10;
      
      ctx.fillStyle = '#111';
      ctx.fillRect(barX, barY, barWidth, barHeight);
      
      const bNorm = Math.min(Math.max(bMean / 255, 0), 1);
      const levelHeight = bNorm * barHeight;
      
      // Color coding for Exposure
      if (bMean < 20) ctx.fillStyle = '#ff0000'; // Too dark (noise dominates)
      else if (bMean > 240) ctx.fillStyle = '#ffff00'; // Danger zone (clipping)
      else ctx.fillStyle = '#0088ff'; // Optimal Blue level
      
      ctx.fillRect(barX, barY + (barHeight - levelHeight), barWidth, levelHeight);
      ctx.strokeStyle = '#333';
      ctx.strokeRect(barX, barY, barWidth, barHeight);

      // --- HUD Text ---
      ctx.font = 'bold 14px monospace';
      
      // 1. Stats
      ctx.fillStyle = '#0088ff';
      ctx.fillText(`RAW(B-G): ${rawDiff.toFixed(2)}`, 10, 20);
      ctx.fillText(`SIGNAL: ${amplifiedSignal.toFixed(2)}`, 10, 40);
      
      // 2. Warnings / Status
      const THRESHOLD = 15; // Visual threshold for text trigger
      
      if (bMean > 250) {
        ctx.fillStyle = '#ff3333';
        ctx.font = 'bold 16px monospace';
        ctx.fillText("⚠ CLIP WARNING: BLUE > 250", 10, height - 15);
      } else if (Math.abs(amplifiedSignal) > THRESHOLD) {
        // Pulse Detected
        ctx.fillStyle = amplifiedSignal > 0 ? '#00ffff' : '#0044aa';
        ctx.font = 'bold 20px monospace';
        const bit = amplifiedSignal > 0 ? "1" : "0";
        ctx.fillText(`DETECTED: ${bit}`, 10, height - 15);
        
        // Draw visual marker
        ctx.beginPath();
        ctx.arc(width - 40, 30, 8, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Idle / Noise
        ctx.fillStyle = '#335577';
        ctx.font = '14px monospace';
        ctx.fillText("SCANNING FLUX...", 10, height - 15);
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
          className="absolute w-full h-full object-cover opacity-50 grayscale" 
          /* Grayscale the preview to emphasize we are looking at raw data, not pretty colors */
        />
        
        {/* ROI Box - Blue Themed */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="relative w-16 h-16 transition-all duration-75">
                <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-blue-500 shadow-[0_0_10px_#0088ff]"></div>
                <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-blue-500 shadow-[0_0_10px_#0088ff]"></div>
                <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-blue-500 shadow-[0_0_10px_#0088ff]"></div>
                <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-blue-500 shadow-[0_0_10px_#0088ff]"></div>
                {/* Crosshair */}
                <div className="absolute top-1/2 left-1/2 w-1 h-1 bg-blue-400 rounded-full -translate-x-1/2 -translate-y-1/2"></div>
            </div>
        </div>
      </div>

      {/* Oscilloscope Container */}
      <div ref={containerRef} className="h-48 w-full bg-cyber-black relative border-t-2 border-blue-900 shrink-0">
        <canvas 
          ref={canvasRef} 
          className="block w-full h-full"
        />
      </div>
    </div>
  );
};