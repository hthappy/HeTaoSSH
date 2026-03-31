export interface TunnelInfo {
  id: string;
  mode: TunnelMode;
  local_port: number;
  remote_host?: string;
  remote_port?: number;
  server_id: number;
}

export type TunnelMode = 'local' | 'dynamic';

export interface TunnelConfig {
  mode: TunnelMode;
  local_port: number;
  remote_host?: string;
  remote_port?: number;
  server_id: number;
}
