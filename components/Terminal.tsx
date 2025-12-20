import React, { useEffect, useRef } from 'react';

interface TerminalProps {
  content: string;
}

export const Terminal: React.FC<TerminalProps> = ({ content }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [content]);

  return (
    <div className="w-full h-full flex flex-col font-mono text-sm">
        <div className="flex justify-between items-center bg-cyber-darkGreen px-2 py-0.5 text-xs font-bold text-cyber-green mb-1">
            <span>TERMINAL_OUTPUT</span>
            <span className="animate-pulse">● REC</span>
        </div>
        <div className="flex-1 overflow-y-auto overflow-x-hidden break-all p-2 bg-black text-cyber-green shadow-inner">
            <span className="whitespace-pre-wrap">{content}</span>
            <div ref={bottomRef} />
        </div>
    </div>
  );
};