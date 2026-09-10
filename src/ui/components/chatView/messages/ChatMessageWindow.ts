/**
 * Render window for the chat transcript.
 *
 * A long conversation keeps every loaded message in memory: history paging is a
 * host concern, and the webview needs the whole loaded transcript to reconcile
 * tool calls. Rendering all of it, however, makes typing and view activation
 * sluggish, because every keystroke re-renders every message.
 *
 * The transcript therefore renders only its tail and reveals earlier messages on
 * demand, so only what is actually read is mounted. These helpers are pure so the
 * windowing rules stay testable without a DOM.
 */

/** Messages rendered in a transcript that was never expanded. */
export const CHAT_MESSAGE_WINDOW = 40;
/** Messages revealed by one `Show earlier messages` click. */
export const CHAT_MESSAGE_WINDOW_PAGE = 40;

/**
 * Messages to render on mount.
 *
 * History paging prepends a page of earlier messages and remounts the chat, so
 * the window has to include whatever the user explicitly loaded; otherwise the
 * page they just requested would be hidden again. Only the tail of the first page
 * stays behind until it is revealed.
 */
export function initialChatWindowSize(totalMessages: number, earlierMessagesLoaded = 0): number {
  return clampWindowSize(CHAT_MESSAGE_WINDOW + Math.max(0, earlierMessagesLoaded), totalMessages);
}

/** Window size after revealing one more page of already loaded messages. */
export function growChatWindow(currentSize: number, totalMessages: number): number {
  return clampWindowSize(currentSize + CHAT_MESSAGE_WINDOW_PAGE, totalMessages);
}

/**
 * Window size after the transcript itself changed.
 *
 * A chat starts empty and grows while the first exchange streams in, so a window
 * sized once on mount would leave those messages hidden behind "show earlier
 * messages". The window therefore follows the newest messages and never shrinks
 * for a transcript of the same length, so revealing a page is never undone by a
 * later sync. A shorter transcript clamps it back down.
 */
export function followChatWindowGrowth(
  currentSize: number,
  totalMessages: number,
  earlierMessagesLoaded = 0,
): number {
  return Math.max(
    clampWindowSize(currentSize, totalMessages),
    initialChatWindowSize(totalMessages, earlierMessagesLoaded),
  );
}

/** Messages kept out of the DOM above the rendered window. */
export function hiddenChatMessageCount(totalMessages: number, windowSize: number): number {
  return Math.max(0, Math.floor(totalMessages) - clampWindowSize(windowSize, totalMessages));
}

/**
 * Slice of the transcript to render, always anchored to the newest message.
 *
 * Returns the original array when nothing is hidden so React can keep the same
 * reference and skip re-rendering the list.
 */
export function visibleChatMessages<T>(messages: T[], windowSize: number): T[] {
  const hidden = hiddenChatMessageCount(messages.length, windowSize);
  return hidden === 0 ? messages : messages.slice(hidden);
}

function clampWindowSize(size: number, totalMessages: number): number {
  const total = Number.isFinite(totalMessages) ? Math.max(0, Math.floor(totalMessages)) : 0;
  if (!Number.isFinite(size) || size <= 0) {
    return 0;
  }
  return Math.min(Math.floor(size), total);
}
