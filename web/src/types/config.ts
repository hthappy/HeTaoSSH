export interface ServerConfig {
  id?: number;
  name: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  private_key_path?: string;
  passphrase?: string;
}

export interface ConnectionStatus {
  isConnected: boolean;
  serverId?: number;
  serverName?: string;
  error?: string;
}
