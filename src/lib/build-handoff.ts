/** Create → Build hand-off: a website/app request opens Build and OG BOT starts on it. */
let pending: string | null = null;
const listeners = new Set<(prompt: string) => void>();

export const buildHandoff = {
  send(prompt: string) {
    pending = prompt;
    listeners.forEach((l) => l(prompt));
  },
  /** Take the waiting prompt (once). */
  take(): string | null {
    const p = pending;
    pending = null;
    return p;
  },
  onSend(l: (prompt: string) => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};
