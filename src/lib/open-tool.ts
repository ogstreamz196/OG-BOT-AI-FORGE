/** Ask the studio shell to open a tool screen from anywhere (e.g. "musicvideo", "settings"). */
export const OPEN_TOOL_EVENT = "og-open-tool";
export function openTool(id: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(OPEN_TOOL_EVENT, { detail: id }));
}
