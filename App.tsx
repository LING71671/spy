import React, { useState, useEffect, useCallback } from 'react';
import { DebugOverlay } from './components/DebugOverlay';
import { ScopeVisualizer } from './components/ScopeVisualizer';
import { Controls } from './components/Controls';
import { VideoDevice } from './types';

// Capture console logs globally
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

export default function App() {
  const [gain, setGain] = useState<number>(50); // Default gain increased for AC coupled mode
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
        // Request permission first to get labels
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
        
        // Try to find environment facing camera first
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
    if (devices.length < 2) {
      console.log("No other cameras available to switch to.");
      return;
    }
    setCurrentDeviceIndex(prev => (prev + 1) % devices.length);
    console.log(`Switching to camera index: ${(currentDeviceIndex + 1) % devices.length}`);
  }, [devices, currentDeviceIndex]);

  const handleReset = useCallback(() => {
    // Force a re-mount/reload to reset baseline and state
    window.location.reload(); 
  }, []);

  const activeDeviceId = devices.length > 0 ? devices[currentDeviceIndex].deviceId : undefined;

  return (
    <div className="flex flex-col h-screen w-screen bg-cyber-black text-cyber-green font-mono overflow-hidden relative">
      {/* Top: Debug Logs */}
      <div className="h-1/4 w-full z-50 pointer-events-none">
        <DebugOverlay logs={logs} />
      </div>

      {/* Center: Scope Visualizer (Takes up remaining space minus controls) */}
      <div className="flex-1 relative w-full overflow-hidden">
         <ScopeVisualizer 
            deviceId={activeDeviceId} 
            gain={gain} 
         />
      </div>

      {/* Bottom: Controls */}
      <div className="h-auto z-50 w-full bg-cyber-black border-t border-cyber-green p-2 pb-6">
        <Controls 
          onSwitchCamera={handleSwitchCamera}
          onReset={handleReset}
          gain={gain}
          setGain={setGain}
          currentDeviceLabel={devices[currentDeviceIndex]?.label}
        />
      </div>
    </div>
  );
}