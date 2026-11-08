import type { Files } from "./workspace";
import { wrapBlock } from "./web-blocks";

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
.og-sec{max-width:1040px;margin:0 auto;padding:56px 20px;font-family:var(--og-font,Inter,system-ui,sans-serif);color:#e6e9f5}
.og-sec h2{font-size:30px;margin:0 0 8px;color:var(--og-text,#fff);letter-spacing:.01em}
.og-sec p.lead{color:var(--og-muted,#9aa4c4);margin:0 0 28px;max-width:60ch}
.og-grid{display:grid;gap:16px}
.og-card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:20px}
.og-btn{display:inline-block;background:var(--og-primary,#3d5afe);color:var(--og-text,#fff);border:0;border-radius:10px;padding:12px 20px;font-weight:700;text-decoration:none;cursor:pointer}
.og-btn.alt{background:transparent;border:1px solid var(--og-primary,#3d5afe);color:#9ab0ff}
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
    css: `.og-nav{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 20px;max-width:1040px;margin:0 auto;font-family:var(--og-font,Inter,system-ui,sans-serif)}
.og-nav-brand{color:var(--og-text,#fff);font-weight:800;text-decoration:none;font-size:18px}
.og-nav-links{display:flex;align-items:center;gap:18px}
.og-nav-links a{color:var(--og-muted,#9aa4c4);text-decoration:none;font-size:14px}
.og-nav-links a.og-btn{color:var(--og-text,#fff)}`,
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
.og-hero-title{font-size:48px;line-height:1.05;margin:0 0 14px;color:var(--og-text,#fff);font-family:var(--og-font,Inter,system-ui,sans-serif)}
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
.og-card h3{margin:0 0 6px;color:var(--og-text,#fff)}
.og-card p{margin:0;color:var(--og-muted,#9aa4c4);font-size:14px}
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
.og-price h3{margin:0;color:var(--og-text,#fff)}
.og-amount{font-size:34px;font-weight:800;color:var(--og-text,#fff)}
.og-amount span{font-size:14px;color:var(--og-muted,#9aa4c4);font-weight:500}
.og-price ul{list-style:none;padding:0;margin:0;color:var(--og-muted,#9aa4c4);font-size:14px;display:grid;gap:6px}
.og-featured{border-color:var(--og-primary,#3d5afe);box-shadow:0 0 0 1px var(--og-primary,#3d5afe)}
@media(max-width:760px){#pricing .og-grid-3{grid-template-columns:1fr}}`,
  },
  {
    id: "contact",
    label: "Contact form",
    keywords: ["contact", "contact form", "form", "get in touch", "lead form"],
    html: `<section class="og-sec" id="contact">
  <h2>Get in touch</h2>
  <p class="lead">We'll get back to you shortly.</p>
  <form class="og-form" data-og-contact>
    <input name="name" required placeholder="Your name" />
    <input name="email" required type="email" placeholder="Email" />
    <textarea name="message" required rows="4" placeholder="Message"></textarea>
    <button class="og-btn" type="submit">Send</button>
    <div class="og-form-msg"></div>
  </form>
  <script>document.querySelectorAll('form[data-og-contact]').forEach(function(f){if(f.__og)return;f.__og=1;f.addEventListener('submit',function(e){e.preventDefault();var m=f.querySelector('.og-form-msg');var d={project:(window.OG_PROJECT||'site'),name:f.elements['name'].value,email:f.elements['email'].value,message:f.elements['message'].value};var c=window.OG_SUPABASE;if(c&&c.url&&c.key){m.textContent='Sending…';fetch(c.url.replace(/\\/$/,'')+'/rest/v1/submissions',{method:'POST',headers:{'Content-Type':'application/json','apikey':c.key,'Authorization':'Bearer '+c.key},body:JSON.stringify(d)}).then(function(r){m.textContent=r.ok?'Thanks — your message was sent.':'Sorry, something went wrong.';if(r.ok)f.reset();}).catch(function(){m.textContent='Network error — please try again.';});}else{m.textContent='Thanks — message captured (connect Supabase to save).';f.reset();}});});</script>
</section>`,
    css: `.og-form{display:grid;gap:12px;max-width:460px}
.og-form input,.og-form textarea{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:12px;color:#e6e9f5;font:inherit}
.og-form input:focus,.og-form textarea:focus{outline:none;border-color:var(--og-primary,#3d5afe)}
.og-form-msg{color:var(--og-accent,#00f59b);font-size:14px}`,
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
    id: "stats",
    label: "Stats",
    keywords: ["stats", "statistics", "metrics", "numbers", "kpis"],
    html: `<section class="og-sec og-stats">
  <div class="og-grid og-grid-4">
    <div class="og-stat"><div class="og-stat-n">10k+</div><div class="og-stat-l">Users</div></div>
    <div class="og-stat"><div class="og-stat-n">99.9%</div><div class="og-stat-l">Uptime</div></div>
    <div class="og-stat"><div class="og-stat-n">4.9★</div><div class="og-stat-l">Rating</div></div>
    <div class="og-stat"><div class="og-stat-n">24/7</div><div class="og-stat-l">Support</div></div>
  </div>
</section>`,
    css: `.og-grid-4{grid-template-columns:repeat(4,1fr);text-align:center}
.og-stat-n{font-size:34px;font-weight:800;color:var(--og-text,#fff)}
.og-stat-l{color:var(--og-muted,#9aa4c4);font-size:14px}
@media(max-width:640px){.og-grid-4{grid-template-columns:repeat(2,1fr)}}`,
  },
  {
    id: "testimonials",
    label: "Testimonials",
    keywords: ["testimonials", "reviews", "quotes", "social proof"],
    html: `<section class="og-sec" id="testimonials">
  <h2>What people say</h2>
  <p class="lead">Real words from happy users.</p>
  <div class="og-grid og-grid-3">
    <figure class="og-card og-quote"><blockquote>"This changed how we work."</blockquote><figcaption>— Alex, Founder</figcaption></figure>
    <figure class="og-card og-quote"><blockquote>"Fast, simple, and offline."</blockquote><figcaption>— Sam, Developer</figcaption></figure>
    <figure class="og-card og-quote"><blockquote>"Exactly what we needed."</blockquote><figcaption>— Riya, Designer</figcaption></figure>
  </div>
</section>`,
    css: `.og-quote{margin:0}.og-quote blockquote{margin:0 0 10px;color:var(--og-text,#fff);font-size:16px}
.og-quote figcaption{color:var(--og-muted,#9aa4c4);font-size:13px}`,
  },
  {
    id: "faq",
    label: "FAQ",
    keywords: ["faq", "faqs", "questions", "accordion", "q&a"],
    html: `<section class="og-sec" id="faq">
  <h2>FAQ</h2>
  <div class="og-faq">
    <details><summary>Is it really offline?</summary><p>Yes — everything runs on your own machine.</p></details>
    <details><summary>How much does it cost?</summary><p>Nothing to run. You own the stack.</p></details>
    <details><summary>Can I export my site?</summary><p>Yes, download it as a single file or a ZIP.</p></details>
  </div>
</section>`,
    css: `.og-faq{display:grid;gap:10px;max-width:720px}
.og-faq details{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:14px 16px}
.og-faq summary{cursor:pointer;color:var(--og-text,#fff);font-weight:600}
.og-faq p{color:var(--og-muted,#9aa4c4);margin:10px 0 0;font-size:14px}`,
  },
  {
    id: "gallery",
    label: "Gallery",
    keywords: ["gallery", "images", "photos", "portfolio grid", "showcase"],
    html: `<section class="og-sec" id="gallery">
  <h2>Gallery</h2>
  <div class="og-grid og-grid-3 og-gallery">
    <div class="og-shot"></div><div class="og-shot"></div><div class="og-shot"></div>
    <div class="og-shot"></div><div class="og-shot"></div><div class="og-shot"></div>
  </div>
</section>`,
    css: `.og-gallery .og-shot{aspect-ratio:4/3;border-radius:12px;background:linear-gradient(135deg,#1b2440,#0f1630);border:1px solid rgba(255,255,255,.08)}`,
  },
  {
    id: "team",
    label: "Team",
    keywords: ["team", "about us", "people", "staff", "members"],
    html: `<section class="og-sec" id="team">
  <h2>Meet the team</h2>
  <div class="og-grid og-grid-3">
    <div class="og-card og-member"><div class="og-avatar"></div><h3>Name</h3><p>Role</p></div>
    <div class="og-card og-member"><div class="og-avatar"></div><h3>Name</h3><p>Role</p></div>
    <div class="og-card og-member"><div class="og-avatar"></div><h3>Name</h3><p>Role</p></div>
  </div>
</section>`,
    css: `.og-member{text-align:center}.og-member h3{margin:10px 0 2px;color:var(--og-text,#fff)}.og-member p{margin:0;color:var(--og-muted,#9aa4c4);font-size:14px}
.og-avatar{width:72px;height:72px;border-radius:50%;margin:0 auto;background:linear-gradient(135deg,var(--og-primary,#3d5afe),var(--og-accent,#00f59b))}`,
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
    css: `.og-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;max-width:1040px;margin:0 auto;padding:28px 20px;border-top:1px solid rgba(255,255,255,.08);color:var(--og-muted,#9aa4c4);font-size:14px;font-family:var(--og-font,Inter,system-ui,sans-serif)}
.og-footer-links{display:flex;gap:16px}.og-footer-links a{color:var(--og-muted,#9aa4c4);text-decoration:none}`,
  },
];

/**
 * Optional cloud override. When the app is online and OG-BOT Cloud is reachable,
 * the latest sections from the Cloudflare D1 store are set here and preferred
 * over the bundled set, so the builder "uses what it needs" without a redeploy.
 */
let cloudSections: Section[] | null = null;
export function setCloudSections(list: Section[] | null) {
  cloudSections = list && list.length ? list : null;
}
export function activeSections(): Section[] {
  return cloudSections ?? SECTIONS;
}

/** Resolve a free-text phrase to a section, or null. */
export function resolveSection(phrase: string): Section | null {
  const p = phrase.toLowerCase().trim();
  // Prefer the longest keyword match so "pricing table" beats "table".
  let best: { s: Section; len: number } | null = null;
  for (const s of activeSections()) {
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
  const block = wrapBlock(section.id, section.html);
  const nextHtml = /<\/body>/i.test(html)
    ? html.replace(/<\/body>/i, () => `${block}\n</body>`)
    : `${html}\n${block}`;
  let nextCss = css;
  if (!nextCss.includes("og-sections-base")) nextCss = `${nextCss}\n${BASE_CSS}`;
  const marker = `/* og-sec:${section.id} */`;
  if (!nextCss.includes(marker)) nextCss = `${nextCss}\n${marker}\n${section.css}`;
  return { "index.html": nextHtml, "styles.css": nextCss };
}
