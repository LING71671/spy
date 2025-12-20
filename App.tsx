import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DebugOverlay } from './components/DebugOverlay';
import { ScopeVisualizer } from './components/ScopeVisualizer';
import { Controls } from './components/Controls';
import { Terminal } from './components/Terminal';
import { VideoDevice } from './types';

// Capture console logs globally
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

export default function App() {
  const [gain, setGain] = useState<number>(300); // Higher default for weak signals
  const [threshold, setThreshold] = useState<number>(15); // Lower default threshold
  const [terminalContent, setTerminalContent] = useState<string>("");
  const [devices, setDevices] = useState<VideoDevice[]>([]);
  const [currentDeviceIndex, setCurrentDeviceIndex] = useState<number>(0);
  const [logs, setLogs] = useState<import('./types').LogEntry[]>([]);

  // Initialize Console Interceptor
  useEffect(() => {
    const addLog = (level: 'info' | 'warn' | 'error' | 'log', args: any[]) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      
      setLogs(prev => [
        {
          id: Math.random().toString(36).substr(2, 9),
          timestamp: new Date().toISOString().split('T')[1].split('.')[0],
          level,
          message
        },
        ...prev.slice(0, 49) // Keep last 50 logs
      ]);
    };

    console.log = (...args) => {
      originalConsoleLog(...args);
      addLog('log', args);
    };
    console.error = (...args) => {
      originalConsoleError(...args);
      addLog('error', args);
    };
    console.warn = (...args) => {
      originalConsoleWarn(...args);
      addLog('warn', args);
    };

    return () => {
      console.log = originalConsoleLog;
      console.error = originalConsoleError;
      console.warn = originalConsoleWarn;
    };
  }, []);

  // Enumerate Devices
  useEffect(() => {
    const getDevices = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ video: true });
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = allDevices
          .filter(device => device.kind === 'videoinput')
          .map(d => ({
            deviceId: d.deviceId,
            label: d.label || `Camera ${d.deviceId.slice(0, 5)}...`
          }));

        console.log(`Found ${videoDevices.length} cameras`);
        setDevices(videoDevices);
        
        const backCameraIndex = videoDevices.findIndex(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('environment'));
        if (backCameraIndex !== -1) {
          setCurrentDeviceIndex(backCameraIndex);
        }
      } catch (err) {
        console.error("Error enumerating devices:", err);
      }
    };

    getDevices();
  }, []);

  const handleSwitchCamera = useCallback(() => {
    if (devices.length < 2) return;
    setCurrentDeviceIndex(prev => (prev + 1) % devices.length);
  }, [devices]);

  const handleReset = useCallback(() => {
    window.location.reload(); 
  }, []);

  const handleClearLog = useCallback(() => {
    setTerminalContent("");
  }, []);

  const handleCharDecoded = useCallback((char: string) => {
    setTerminalContent(prev => prev + char);
  }, []);

  const activeDeviceId = devices.length > 0 ? devices[currentDeviceIndex].deviceId : undefined;

  return (
    <div className="flex flex-col h-screen w-screen bg-cyber-black text-cyber-green font-mono overflow-hidden relative">
      {/* Top: Debug Logs */}
      <div className="h-1/5 w-full z-50 pointer-events-none opacity-50 hover:opacity-100 transition-opacity absolute top-0 left-0">
        <DebugOverlay logs={logs} />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col relative z-10 pt-16"> 
         
         {/* Scope */}
         <div className="flex-1 relative w-full overflow-hidden min-h-[200px]">
             <ScopeVisualizer 
                deviceId={activeDeviceId} 
                gain={gain}
                threshold={threshold}
                onCharDecoded={handleCharDecoded}
             />
         </div>

         {/* Terminal Output */}
         <div className="h-32 w-full bg-black border-t-2 border-cyber-green p-1">
            <Terminal content={terminalContent} />
         </div>

         {/* Bottom: Controls */}
         <div className="h-auto w-full bg-cyber-black border-t border-cyber-green p-2 pb-6 shadow-[0_-5px_20px_rgba(0,50,0,0.5)]">
            <Controls 
              onSwitchCamera={handleSwitchCamera}
              onReset={handleReset}
              onClearLog={handleClearLog}
              gain={gain}
              setGain={setGain}
              threshold={threshold}
              setThreshold={setThreshold}
              currentDeviceLabel={devices[currentDeviceIndex]?.label}
            />
         </div>
      </div>
    </div>
  );
}