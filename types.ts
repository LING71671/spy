export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'log';
  message: string;
}

export interface VideoDevice {
  deviceId: string;
  label: string;
}
