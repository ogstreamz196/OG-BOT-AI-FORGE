import type { Files } from "./workspace";
import { SECTIONS, insertSection } from "./web-sections";

/**
 * Ready-made website starters, composed from the shared section library so they
 * stay consistent with what the AI builder inserts. Used as /scaffold templates.
 */

const BASE: Files = {
  "index.html": `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>My Site</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
</body>
</html>`,
  "styles.css": `body{margin:0;background:var(--og-bg,#0b0f1e);color:#e6e9f5;font-family:var(--og-font,Inter,system-ui,sans-serif)}`,
  "app.js": `console.log("OG-BOT site ready");`,
};

function compose(ids: string[]): Files {
  let files: Files = { ...BASE };
  for (const id of ids) {
    const s = SECTIONS.find((x) => x.id === id);
    if (s) files = { ...files, ...insertSection(files, s) };
  }
  return files;
}

export const WEB_TEMPLATES: Record<string, Files> = {
  "landing-page": compose(["navbar", "hero", "features", "pricing", "contact", "footer"]),
  portfolio: compose(["navbar", "hero", "features", "footer"]),
  "contact-page": compose(["navbar", "contact", "footer"]),
};
