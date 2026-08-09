import * as path from "node:path";
import { homedir } from "node:os";

export interface BrowserExecutable {
  path: string;
  source: "edge" | "chrome" | "managed-headless-shell";
  buildId?: string;
}

export function getSystemBrowserCandidates(
  platform: NodeJS.Platform = process.platform,
  environment: NodeJS.ProcessEnv = process.env,
  userHome = homedir(),
): BrowserExecutable[] {
  if (platform === "win32") {
    const roots = [environment.PROGRAMFILES, environment["PROGRAMFILES(X86)"], environment.LOCALAPPDATA].filter(Boolean) as string[];
    return [
      ...roots.map((root) => ({ path: path.join(root, "Microsoft", "Edge", "Application", "msedge.exe"), source: "edge" as const })),
      ...roots.map((root) => ({ path: path.join(root, "Google", "Chrome", "Application", "chrome.exe"), source: "chrome" as const })),
    ];
  }
  if (platform === "darwin") {
    const userApplications = path.join(userHome, "Applications");
    return [
      { path: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", source: "edge" },
      { path: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", source: "chrome" },
      { path: path.join(userApplications, "Microsoft Edge.app", "Contents", "MacOS", "Microsoft Edge"), source: "edge" },
      { path: path.join(userApplications, "Google Chrome.app", "Contents", "MacOS", "Google Chrome"), source: "chrome" },
    ];
  }
  return [
    { path: "/usr/bin/microsoft-edge", source: "edge" },
    { path: "/usr/bin/microsoft-edge-stable", source: "edge" },
    { path: "/usr/bin/google-chrome", source: "chrome" },
    { path: "/usr/bin/google-chrome-stable", source: "chrome" },
    { path: "/usr/bin/chromium", source: "chrome" },
    { path: "/usr/bin/chromium-browser", source: "chrome" },
    { path: "/opt/microsoft/msedge/msedge", source: "edge" },
    { path: "/opt/google/chrome/chrome", source: "chrome" },
  ];
}
