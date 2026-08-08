import * as http from "node:http";
import * as net from "node:net";
import { WebAccessPolicy, resolvePublicHostname } from "./NetworkPolicy";

// A normal search visits the provider homepage and then its results page in the
// same isolated session. Modern pages can open more than 64 HTTPS connections
// across those two navigations even with images and fonts blocked.
const MAX_CONNECTIONS = 128;
const MAX_CONCURRENT_CONNECTIONS = 16;
const MAX_TRANSFER_BYTES = 16 * 1024 * 1024;

export class SafeConnectProxy {
  private server?: http.Server;
  private connections = 0;
  private transferred = 0;
  private activeConnections = 0;
  private readonly sockets = new Set<net.Socket>();
  private readonly pinnedDns = new Map<string, string[]>();
  private readonly blocked = new Map<string, number>();
  private operation = 0;

  constructor(private policy: WebAccessPolicy) {}

  async start(): Promise<number> {
    if (this.server) {throw new Error("Proxy is already running");}
    this.server = http.createServer((_request, response) => {
      this.recordBlock("non_connect_http");
      response.writeHead(403, { "content-type": "text/plain" });
      response.end("Only HTTPS CONNECT is allowed");
    });
    this.server.on("connect", (request, client, head) => {
      const socket = client as net.Socket;
      socket.on("error", () => undefined);
      void this.handleConnect(request, socket, head).catch((error: unknown) => {
        this.recordBlock(classifyBlock(error));
        deny(socket, 403);
      });
    });
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(0, "127.0.0.1", () => resolve());
    });
    const address = this.server.address();
    if (!address || typeof address === "string") {throw new Error("Proxy did not bind to TCP");}
    return address.port;
  }

  async dispose(): Promise<void> {
    this.destroySockets();
    const server = this.server;
    this.server = undefined;
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  getMetrics(): { requests: number; transferredBytes: number; blocked: Record<string, number> } {
    return { requests: this.connections, transferredBytes: this.transferred, blocked: Object.fromEntries(this.blocked) };
  }

  reset(policy: WebAccessPolicy): ReturnType<SafeConnectProxy["getMetrics"]> {
    const metrics = this.getMetrics();
    this.operation += 1;
    this.destroySockets();
    this.policy = policy;
    this.connections = 0;
    this.transferred = 0;
    this.activeConnections = 0;
    this.pinnedDns.clear();
    this.blocked.clear();
    return metrics;
  }

  private recordBlock(code: string): void {this.blocked.set(code, (this.blocked.get(code) ?? 0) + 1);}

  private async handleConnect(request: http.IncomingMessage, client: net.Socket, head: Buffer): Promise<void> {
    const operation = this.operation;
    if (++this.connections > MAX_CONNECTIONS) {throw new Error("Web request limit exceeded");}
    const target = parseAuthority(request.url ?? "");
    if (target.port !== 443 || !this.policy.isAllowedHostname(target.hostname)) {
      throw new Error("Destination is not granted");
    }
    const addresses = await resolvePublicHostname(target.hostname);
    if (operation !== this.operation) {throw new Error("Web proxy operation changed");}
    const resolvedSet = addresses.map((entry) => `${entry.family}:${entry.address}`).sort();
    const priorSet = this.pinnedDns.get(target.hostname);
    if (priorSet && (priorSet.length !== resolvedSet.length || priorSet.some((entry, index) => entry !== resolvedSet[index]))) {
      throw new Error("DNS rebinding was detected");
    }
    this.pinnedDns.set(target.hostname, resolvedSet);
    const selectedKey = resolvedSet[0]!;
    const selected = addresses.find((entry) => `${entry.family}:${entry.address}` === selectedKey)!;
    if (++this.activeConnections > MAX_CONCURRENT_CONNECTIONS) {
      this.activeConnections -= 1;
      throw new Error("Web connection concurrency limit exceeded");
    }
    const upstream = net.connect({ host: selected.address, port: 443, family: selected.family });
    this.sockets.add(client);
    this.sockets.add(upstream);
    let cleaned = false;
    const cleanup = (): void => {
      if (cleaned) {return;}
      cleaned = true;
      if (operation === this.operation) {this.activeConnections = Math.max(0, this.activeConnections - 1);}
      this.sockets.delete(client);
      this.sockets.delete(upstream);
      client.destroy();
      upstream.destroy();
    };
    upstream.once("error", cleanup);
    upstream.once("close", cleanup);
    client.once("error", cleanup);
    client.once("close", cleanup);
    upstream.once("connect", () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length > 0) {upstream.write(head);}
      client.pipe(upstream);
      upstream.pipe(client);
    });
    const count = (chunk: Buffer): void => {
      if (operation !== this.operation) {return;}
      this.transferred += chunk.length;
      if (this.transferred > MAX_TRANSFER_BYTES) {this.recordBlock("transfer_limit"); cleanup();}
    };
    client.on("data", count);
    upstream.on("data", count);
  }

  private destroySockets(): void {
    for (const socket of this.sockets) {socket.destroy();}
    this.sockets.clear();
  }
}

function parseAuthority(value: string): { hostname: string; port: number } {
  const match = /^([^:\[\]]+):(\d+)$/.exec(value.trim());
  if (!match) {throw new Error("Invalid CONNECT authority");}
  return { hostname: match[1]!.toLowerCase(), port: Number(match[2]) };
}

function deny(socket: net.Socket, status: number): void {
  if (!socket.destroyed) {
    socket.end(`HTTP/1.1 ${status} Forbidden\r\nConnection: close\r\n\r\n`);
  }
}

function classifyBlock(error: unknown): string {
  const message = error instanceof Error ? error.message : "unknown";
  if (/DNS rebinding/i.test(message)) {return "dns_rebinding";}
  if (/DNS|lookup|address/i.test(message)) {return "dns_non_public";}
  if (/request limit/i.test(message)) {return "request_limit";}
  if (/concurrency/i.test(message)) {return "connection_limit";}
  if (/Destination|authority|port/i.test(message)) {return "destination_not_granted";}
  return "connection_blocked";
}
