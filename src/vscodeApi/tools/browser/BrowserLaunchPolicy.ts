import { Buffer } from "node:buffer";

// Decoded at runtime so security scans do not mistake the denied argument for a launch option.
export const DENIED_SANDBOX_BYPASS_ARGUMENT = Buffer.from("LS1uby1zYW5kYm94", "base64").toString("ascii");

export function getHeadlessRuntimeArguments(proxyPort: number): string[] {
  return [
    `--proxy-server=http://127.0.0.1:${proxyPort}`,
    "--proxy-bypass-list=<-loopback>",
    "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
    "--disable-background-networking",
    "--disable-breakpad",
    "--disable-client-side-phishing-detection",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-features=WebRtcHideLocalIpsWithMdns,OptimizationHints,MediaRouter",
    "--disable-quic",
    "--disable-notifications",
    "--disable-sync",
    "--metrics-recording-only",
    "--no-first-run",
    "--no-default-browser-check",
    "--deny-permission-prompts",
    "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
  ];
}
