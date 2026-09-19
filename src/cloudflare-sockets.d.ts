declare module "cloudflare:sockets" {
  type SocketAddress = { hostname: string; port: number };
  type SocketOptions = { secureTransport?: "off" | "on" | "starttls"; allowHalfOpen?: boolean };
  type SocketInfo = { localAddress?: string; remoteAddress?: string };
  export type Socket = {
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
    opened: Promise<SocketInfo>;
    closed: Promise<void>;
    close(): Promise<void>;
    startTls(): Socket;
  };
  export function connect(address: SocketAddress, options?: SocketOptions): Socket;
}
