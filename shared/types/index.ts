export interface HealthStatus {
  status: 'ok' | 'error';
  uptime: number;
  timestamp: string;
  message?: string;
}

export interface ApiError {
  message: string;
  details?: string;
}

export interface ClientInfo {
  name: string;
  version: string;
}
