import type * as vscode from "vscode";
import { randomUUID } from "crypto";
import type { AssistantTimelineEvent, StreamChunk } from "@/adapters";

export interface StreamDonePayload {
  cancelled?: boolean;
  finish_reason?: string;
}

export class StreamEventEmitter {
  private readonly timeline: AssistantTimelineEvent[] = [];
  private activeTextEvent: Extract<AssistantTimelineEvent, { type: "reasoning" | "content" }> | null = null;

  constructor(private readonly webviewView: vscode.WebviewView) {}

  showTyping(): void {
    this.webviewView.webview.postMessage({ type: "showTyping" });
  }

  chunk(content: string): void {
    this.text("content", content);
  }

  reasoning(content: string): void {
    this.text("reasoning", content);
  }

  toolGroup(round: number, toolCallIds: string[]): void {
    const event: Extract<AssistantTimelineEvent, { type: "tool-group" }> = {
      id: randomUUID(),
      type: "tool-group",
      round,
      toolCallIds: [...toolCallIds],
    };
    this.activeTextEvent = null;
    this.timeline.push(event);
    this.webviewView.webview.postMessage({ type: "streamTimelineToolGroup", event });
  }

  getTimeline(): AssistantTimelineEvent[] {
    return this.timeline.map((event) =>
      event.type === "tool-group" ? { ...event, toolCallIds: [...event.toolCallIds] } : { ...event },
    );
  }

  done(payload: StreamDonePayload = {}): void {
    this.webviewView.webview.postMessage({
      type: "streamDone",
      ...payload,
    });
  }

  error(error: string): void {
    this.webviewView.webview.postMessage({
      type: "streamError",
      error,
    });
  }

  fromChunk(chunk: StreamChunk): void {
    switch (chunk.type) {
      case "content":
        this.chunk(chunk.content ?? "");
        break;
      case "reasoning":
        this.reasoning(chunk.reasoning_content ?? "");
        break;
      case "done":
        this.done({
          finish_reason: chunk.finish_reason,
        });
        break;
      case "error":
        this.error(chunk.error ?? "Unknown stream error");
        break;
      case "tool_call":
        break;
      case "usage":
        break;
    }
  }

  private text(eventType: "reasoning" | "content", content: string): void {
    if (!content) {
      return;
    }

    if (!this.activeTextEvent || this.activeTextEvent.type !== eventType) {
      const event: Extract<AssistantTimelineEvent, { type: "reasoning" | "content" }> =
        eventType === "reasoning"
          ? { id: randomUUID(), type: "reasoning", content: "" }
          : { id: randomUUID(), type: "content", content: "" };
      this.activeTextEvent = event;
      this.timeline.push(event);
    }

    const activeTextEvent = this.activeTextEvent;
    activeTextEvent.content += content;
    this.webviewView.webview.postMessage({
      type: "streamTimelineDelta",
      eventId: activeTextEvent.id,
      eventType,
      content,
    });
  }
}
