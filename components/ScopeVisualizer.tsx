import React, { useRef, useEffect } from 'react';

interface ScopeVisualizerProps {
  deviceId?: string;
  gain: number;
  threshold: number;
  onCharDecoded: (char: string) => void;
}

export const ScopeVisualizer: React.FC<ScopeVisualizerProps> = ({ deviceId, gain, threshold, onCharDecoded }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const processCanvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // DSP State
  const baselineRef = useRef<number | null>(null);
  const digitalStateRef = useRef<number>(0);
  
  // Averaging Buffer for Smoothing
  const rawHistoryRef = useRef<number[]>([]); 
  
  // Buffers for visualization
  const BUFFER_SIZE = 300;
  const signalBufferRef = useRef<number[]>([]);
  const digitalBufferRef = useRef<number[]>([]);
  
  // Manchester Decoder State
  const runLengthRef = useRef<number>(0);
  const bitAccumulatorRef = useRef<string>("");
  const lastDigitalStateRef = useRef<number>(0);
  const pendingShortRef = useRef<number | null>(null);

  const animationFrameRef = useRef<number | null>(null);
  const SAMPLE_SIZE = 50;

  useEffect(() => {
    if (!processCanvasRef.current) {
      processCanvasRef.current = document.createElement('canvas');
      processCanvasRef.current.width = SAMPLE_SIZE;
      processCanvasRef.current.height = SAMPLE_SIZE;
    }
  }, []);

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

  // Camera Setup
  useEffect(() => {
    const startStream = async () => {
      if (!deviceId) return;
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
      
      // Reset State
      baselineRef.current = null;
      rawHistoryRef.current = [];
      runLengthRef.current = 0;
      bitAccumulatorRef.current = "";
      pendingShortRef.current = null;
      
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: deviceId },
            facingMode: 'environment',
            width: { ideal: 640 },
            height: { ideal: 480 },
            // @ts-ignore
            advanced: [{ exposureMode: 'continuous', whiteBalanceMode: 'manual', focusMode: 'continuous' }] 
          },
          audio: false
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Camera Error:", err);
      }
    };
    startStream();
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [deviceId]);

  // --- PROCESSING LOOP ---
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

      // 1. Image Processing
      const sx = (video.videoWidth - SAMPLE_SIZE) / 2;
      const sy = (video.videoHeight - SAMPLE_SIZE) / 2;
      pCtx.drawImage(video, sx, sy, SAMPLE_SIZE, SAMPLE_SIZE, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
      const data = pCtx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
      
      let sumDiff = 0;
      for (let i = 0; i < data.length; i += 4) {
        sumDiff += (data[i + 2] - data[i + 1]); // Blue - Green
      }
      const rawCurrent = sumDiff / (SAMPLE_SIZE * SAMPLE_SIZE);
      
      // 2. 3-Frame Smoothing
      rawHistoryRef.current.push(rawCurrent);
      if (rawHistoryRef.current.length > 3) rawHistoryRef.current.shift();
      const rawSmoothed = rawHistoryRef.current.reduce((a, b) => a + b, 0) / rawHistoryRef.current.length;

      // 3. IIR Filter (AC Coupling)
      // Slower adaptation to handle low frequency signal
      if (baselineRef.current === null) baselineRef.current = rawSmoothed;
      else baselineRef.current = (baselineRef.current * 0.98) + (rawSmoothed * 0.02);
      
      const acSignal = (rawSmoothed - baselineRef.current) * gain;

      // 4. Schmitt Trigger
      if (acSignal > threshold) {
        digitalStateRef.current = 1;
      } else if (acSignal < -threshold) {
        digitalStateRef.current = 0;
      }
      
      const currentState = digitalStateRef.current;

      // 5. Manchester Decoder Logic
      const processBit = (bit: string) => {
          bitAccumulatorRef.current += bit;
          if (bitAccumulatorRef.current.length >= 8) {
              const byteStr = bitAccumulatorRef.current;
              // Check for Preamble/Sync words
              if (byteStr === "11110000") {
                  onCharDecoded("\n[LOCK]");
                  bitAccumulatorRef.current = "";
                  return;
              } 
              if (byteStr === "00001111") {
                  onCharDecoded("\n[END]\n");
                  bitAccumulatorRef.current = "";
                  return;
              }

              // Decode ASCII
              const charCode = parseInt(byteStr, 2);
              if (charCode >= 32 && charCode <= 126) {
                  onCharDecoded(String.fromCharCode(charCode));
              }
              bitAccumulatorRef.current = "";
          }
      };

      if (currentState === lastDigitalStateRef.current) {
          runLengthRef.current++;
      } else {
          // State Transition Occurred
          const pulseLen = runLengthRef.current;
          // Frames per half-bit is approx 2.
          // Short Pulse: 1, 2, 3 frames.
          // Long Pulse: 4, 5, 6+ frames.
          
          const isShort = pulseLen <= 3;
          const isLong = pulseLen >= 4;

          if (isLong) {
              // Long pulse aligns us to bit boundary.
              // Long Low (1->0 transition): We output '0'
              // Long High (0->1 transition): We output '1'
              if (currentState === 0) processBit("0");
              else processBit("1");
              
              pendingShortRef.current = null;
          } else if (isShort) {
              // Short Pulse
              const pending = pendingShortRef.current;
              if (pending !== null) {
                  // We have a pair!
                  // (Short Low, Short High) -> 0
                  // (Short High, Short Low) -> 1
                  if (pending === 0 && currentState === 1) processBit("0");
                  else if (pending === 1 && currentState === 0) processBit("1");
                  pendingShortRef.current = null;
              } else {
                  pendingShortRef.current = currentState; // wait for next short
              }
          }
          
          runLengthRef.current = 0;
          lastDigitalStateRef.current = currentState;
      }

      // 6. Update Buffers for UI
      signalBufferRef.current.push(acSignal);
      if (signalBufferRef.current.length > BUFFER_SIZE) signalBufferRef.current.shift();
      digitalBufferRef.current.push(currentState);
      if (digitalBufferRef.current.length > BUFFER_SIZE) digitalBufferRef.current.shift();

      // 7. Visuals
      const width = parseFloat(canvas.style.width);
      const height = parseFloat(canvas.style.height);
      const centerY = height / 2;
      
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, 0, width, height);
      
      // Grid
      ctx.strokeStyle = '#003300';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, centerY); ctx.lineTo(width, centerY);
      ctx.stroke();

      // Analog
      ctx.beginPath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#00ff41';
      for (let i = 0; i < signalBufferRef.current.length; i++) {
        const x = (i / (BUFFER_SIZE - 1)) * width;
        const y = (centerY / 2) - (signalBufferRef.current[i] / 2);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Digital
      ctx.beginPath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#00ffff';
      const digiBase = height * 0.75;
      const digiHeight = 20;
      for (let i = 0; i < digitalBufferRef.current.length; i++) {
        const x = (i / (BUFFER_SIZE - 1)) * width;
        const s = digitalBufferRef.current[i];
        const y = s === 1 ? digiBase - digiHeight : digiBase + digiHeight;
        if (i === 0) ctx.moveTo(x, y);
        else {
             const prev = digitalBufferRef.current[i-1];
             if (s !== prev) {
                 const prevY = prev === 1 ? digiBase - digiHeight : digiBase + digiHeight;
                 ctx.lineTo(x, prevY); ctx.lineTo(x, y);
             } else ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
      
      // Thresholds
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.3)';
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(0, (centerY/2) - (threshold/2)); ctx.lineTo(width, (centerY/2) - (threshold/2));
      ctx.moveTo(0, (centerY/2) + (threshold/2)); ctx.lineTo(width, (centerY/2) + (threshold/2));
      ctx.stroke();
      ctx.setLineDash([]);

      animationFrameRef.current = requestAnimationFrame(process);
    };

    animationFrameRef.current = requestAnimationFrame(process);
    return () => { if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current); };
  }, [gain, threshold]);

  return (
    <div className="relative w-full h-full flex flex-col">
      <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden border-b border-cyber-green/50">
        <video
          ref={videoRef}
          autoPlay muted playsInline
          className="absolute w-full h-full object-cover opacity-30 grayscale contrast-125" 
        />
        {/* Cyberpunk Crosshair */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="relative w-20 h-20">
                <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-cyber-green"></div>
                <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-cyber-green"></div>
                <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-cyber-green"></div>
                <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-cyber-green"></div>
                <div className="absolute top-1/2 left-1/2 w-1 h-1 bg-red-500 rounded-full shadow-[0_0_10px_#f00]"></div>
            </div>
        </div>
      </div>

      <div ref={containerRef} className="h-full w-full bg-cyber-black relative border-t-2 border-cyber-darkGreen shrink-0 min-h-[150px]">
        <canvas ref={canvasRef} className="block w-full h-full" />
        <div className="absolute top-2 left-2 text-[10px] text-cyber-green bg-black/50 px-1">ANALOG INPUT</div>
        <div className="absolute bottom-16 left-2 text-[10px] text-cyan-400 bg-black/50 px-1">DIGITAL EXTRACT</div>
      </div>
    </div>
  );
};