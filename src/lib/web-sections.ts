import type { Files } from "./workspace";

/**
 * Reusable website sections the builder can drop into the current project via
 * natural language ("add a hero", "add a pricing table", "add a contact form").
 * Each section is self-contained HTML + scoped CSS (og-sec-* classes) that looks
 * good on the dark starter canvas. Pure + testable.
 */

export type Section = {
  id: string;
  label: string;
  keywords: string[];
  html: string;
  css: string;
};

const BASE_CSS = `/* og-sections-base */
.og-sec{max-width:1040px;margin:0 auto;padding:56px 20px;font-family:Inter,system-ui,sans-serif;color:#e6e9f5}
.og-sec h2{font-size:30px;margin:0 0 8px;color:#fff;letter-spacing:.01em}
.og-sec p.lead{color:#9aa4c4;margin:0 0 28px;max-width:60ch}
.og-grid{display:grid;gap:16px}
.og-card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:20px}
.og-btn{display:inline-block;background:#3d5afe;color:#fff;border:0;border-radius:10px;padding:12px 20px;font-weight:700;text-decoration:none;cursor:pointer}
.og-btn.alt{background:transparent;border:1px solid #3d5afe;color:#9ab0ff}
@media(max-width:640px){.og-sec{padding:40px 16px}.og-sec h2{font-size:24px}}`;

export const SECTIONS: Section[] = [
  {
    id: "navbar",
    label: "Navbar",
    keywords: ["navbar", "nav", "navigation", "menu", "top bar"],
    html: `<nav class="og-nav">
  <a class="og-nav-brand" href="#">Your Brand</a>
  <div class="og-nav-links">
    <a href="#features">Features</a><a href="#pricing">Pricing</a><a href="#contact">Contact</a>
    <a class="og-btn" href="#">Get started</a>
  </div>
</nav>`,
    css: `.og-nav{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 20px;max-width:1040px;margin:0 auto;font-family:Inter,system-ui,sans-serif}
.og-nav-brand{color:#fff;font-weight:800;text-decoration:none;font-size:18px}
.og-nav-links{display:flex;align-items:center;gap:18px}
.og-nav-links a{color:#9aa4c4;text-decoration:none;font-size:14px}
.og-nav-links a.og-btn{color:#fff}`,
  },
  {
    id: "hero",
    label: "Hero",
    keywords: ["hero", "banner", "intro", "headline", "jumbotron"],
    html: `<section class="og-sec og-hero" id="home">
  <h1 class="og-hero-title">Build something great</h1>
  <p class="lead og-hero-sub">A clear one-line pitch for your product goes right here.</p>
  <div class="og-hero-cta"><a class="og-btn" href="#">Start free</a><a class="og-btn alt" href="#features">Learn more</a></div>
</section>`,
    css: `.og-hero{text-align:center;padding-top:72px;padding-bottom:72px}
.og-hero-title{font-size:48px;line-height:1.05;margin:0 0 14px;color:#fff;font-family:Inter,system-ui,sans-serif}
.og-hero-sub{margin:0 auto 26px}
.og-hero-cta{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
@media(max-width:640px){.og-hero-title{font-size:34px}}`,
  },
  {
    id: "features",
    label: "Features grid",
    keywords: ["features", "feature grid", "feature section", "benefits"],
    html: `<section class="og-sec" id="features">
  <h2>Features</h2>
  <p class="lead">Everything you need, nothing you don't.</p>
  <div class="og-grid og-grid-3">
    <div class="og-card"><h3>Fast</h3><p>Describe what each feature does in a sentence.</p></div>
    <div class="og-card"><h3>Offline</h3><p>Describe what each feature does in a sentence.</p></div>
    <div class="og-card"><h3>Yours</h3><p>Describe what each feature does in a sentence.</p></div>
  </div>
</section>`,
    css: `.og-grid-3{grid-template-columns:repeat(3,1fr)}
.og-card h3{margin:0 0 6px;color:#fff}
.og-card p{margin:0;color:#9aa4c4;font-size:14px}
@media(max-width:760px){.og-grid-3{grid-template-columns:1fr}}`,
  },
  {
    id: "pricing",
    label: "Pricing table",
    keywords: ["pricing", "plans", "pricing table", "tiers"],
    html: `<section class="og-sec" id="pricing">
  <h2>Pricing</h2>
  <p class="lead">Simple, transparent plans.</p>
  <div class="og-grid og-grid-3">
    <div class="og-card og-price"><h3>Starter</h3><div class="og-amount">£0</div><ul><li>Core features</li><li>1 project</li></ul><a class="og-btn alt" href="#">Choose</a></div>
    <div class="og-card og-price og-featured"><h3>Pro</h3><div class="og-amount">£12<span>/mo</span></div><ul><li>Everything in Starter</li><li>Unlimited projects</li></ul><a class="og-btn" href="#">Choose</a></div>
    <div class="og-card og-price"><h3>Team</h3><div class="og-amount">£39<span>/mo</span></div><ul><li>Everything in Pro</li><li>Team seats</li></ul><a class="og-btn alt" href="#">Choose</a></div>
  </div>
</section>`,
    css: `.og-price{display:flex;flex-direction:column;gap:12px;text-align:center}
.og-price h3{margin:0;color:#fff}
.og-amount{font-size:34px;font-weight:800;color:#fff}
.og-amount span{font-size:14px;color:#9aa4c4;font-weight:500}
.og-price ul{list-style:none;padding:0;margin:0;color:#9aa4c4;font-size:14px;display:grid;gap:6px}
.og-featured{border-color:#3d5afe;box-shadow:0 0 0 1px #3d5afe}
@media(max-width:760px){#pricing .og-grid-3{grid-template-columns:1fr}}`,
  },
  {
    id: "contact",
    label: "Contact form",
    keywords: ["contact", "contact form", "form", "get in touch", "lead form"],
    html: `<section class="og-sec" id="contact">
  <h2>Get in touch</h2>
  <p class="lead">We'll get back to you shortly.</p>
  <form class="og-form" onsubmit="event.preventDefault();this.querySelector('.og-form-msg').textContent='Thanks — message captured locally.';">
    <input required placeholder="Your name" />
    <input required type="email" placeholder="Email" />
    <textarea required rows="4" placeholder="Message"></textarea>
    <button class="og-btn" type="submit">Send</button>
    <div class="og-form-msg"></div>
  </form>
</section>`,
    css: `.og-form{display:grid;gap:12px;max-width:460px}
.og-form input,.og-form textarea{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:12px;color:#e6e9f5;font:inherit}
.og-form input:focus,.og-form textarea:focus{outline:none;border-color:#3d5afe}
.og-form-msg{color:#00f59b;font-size:14px}`,
  },
  {
    id: "cta",
    label: "Call to action",
    keywords: ["cta", "call to action", "signup banner", "get started banner"],
    html: `<section class="og-sec og-cta">
  <h2>Ready to start?</h2>
  <p class="lead">Join today — it only takes a minute.</p>
  <a class="og-btn" href="#">Create your account</a>
</section>`,
    css: `.og-cta{text-align:center;background:rgba(61,90,254,.08);border:1px solid rgba(61,90,254,.25);border-radius:24px}`,
  },
  {
    id: "footer",
    label: "Footer",
    keywords: ["footer", "bottom", "site footer"],
    html: `<footer class="og-footer">
  <div>© <span class="og-year"></span> Your Brand. All rights reserved.</div>
  <div class="og-footer-links"><a href="#">Privacy</a><a href="#">Terms</a><a href="#contact">Contact</a></div>
  <script>var y=document.querySelector('.og-year');if(y)y.textContent=new Date().getFullYear();</script>
</footer>`,
    css: `.og-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;max-width:1040px;margin:0 auto;padding:28px 20px;border-top:1px solid rgba(255,255,255,.08);color:#9aa4c4;font-size:14px;font-family:Inter,system-ui,sans-serif}
.og-footer-links{display:flex;gap:16px}.og-footer-links a{color:#9aa4c4;text-decoration:none}`,
  },
];

/** Resolve a free-text phrase to a section, or null. */
export function resolveSection(phrase: string): Section | null {
  const p = phrase.toLowerCase().trim();
  // Prefer the longest keyword match so "pricing table" beats "table".
  let best: { s: Section; len: number } | null = null;
  for (const s of SECTIONS) {
    for (const k of [s.id, ...s.keywords]) {
      if (p.includes(k) && (!best || k.length > best.len)) best = { s, len: k.length };
    }
  }
  return best?.s ?? null;
}

/** Produce the file patch that inserts a section into the project. */
export function insertSection(files: Files, section: Section): Files {
  const html = files["index.html"] ?? "";
  const css = files["styles.css"] ?? "";
  const nextHtml = /<\/body>/i.test(html)
    ? html.replace(/<\/body>/i, () => `${section.html}\n</body>`)
    : `${html}\n${section.html}`;
  let nextCss = css;
  if (!nextCss.includes("og-sections-base")) nextCss = `${nextCss}\n${BASE_CSS}`;
  const marker = `/* og-sec:${section.id} */`;
  if (!nextCss.includes(marker)) nextCss = `${nextCss}\n${marker}\n${section.css}`;
  return { "index.html": nextHtml, "styles.css": nextCss };
}
