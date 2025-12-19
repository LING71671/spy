import React from 'react';
import { LogEntry } from '../types';

interface DebugOverlayProps {
  logs: LogEntry[];
}

export const DebugOverlay: React.FC<DebugOverlayProps> = ({ logs }) => {
  return (
    <div className="absolute top-0 left-0 w-full h-32 bg-black/80 text-xs overflow-y-auto p-2 border-b border-cyber-green/30 pointer-events-auto">
      <div className="font-bold border-b border-gray-700 mb-1 text-cyber-green">DEBUG LOG</div>
      {logs.map((log) => (
        <div key={log.id} className="font-mono mb-0.5 break-words">
          <span className="text-gray-500">[{log.timestamp}]</span>
          <span className={`ml-2 ${
            log.level === 'error' ? 'text-red-500' : 
            log.level === 'warn' ? 'text-yellow-500' : 'text-cyber-green'
          }`}>
            {log.message}
          </span>
        </div>
      ))}
    </div>
  );
};