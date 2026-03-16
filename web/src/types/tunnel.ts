export interface TunnelInfo {
  local_port: number;
  mode: string;
}

export type TunnelMode = 'local' | 'dynamic';

export interface TunnelConfig {
  mode: TunnelMode;
  local_port: number;
  remote_host?: string;
  remote_port?: number;
  server_id: number;
}
