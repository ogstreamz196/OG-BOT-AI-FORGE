import { beforeEach, describe, expect, it } from "vitest";
import { buildDoc, standaloneIndex } from "@/lib/workspace";
import { connectors } from "@/lib/connectors";
import { SECTIONS } from "@/lib/web-sections";

beforeEach(() => connectors._reset());

const files = { "index.html": "<p>hi</p>", "styles.css": "", "app.js": "" };

describe("connector config injection", () => {
  it("always sets OG_PROJECT and omits OG_SUPABASE when disabled", () => {
    connectors.toggle("supabase", false);
    const doc = buildDoc(files);
    expect(doc).toContain("window.OG_PROJECT=");
    expect(doc).not.toContain("window.OG_SUPABASE");
  });
  it("injects OG_SUPABASE when the connector is enabled and configured", () => {
    connectors.toggle("supabase", true);
    connectors.setField("supabase", "url", "https://proj.supabase.co");
    connectors.setField("supabase", "anonKey", "sb_publishable_abc");
    const doc = buildDoc(files);
    expect(doc).toContain(
      'window.OG_SUPABASE={url:"https://proj.supabase.co",key:"sb_publishable_abc"}',
    );
    expect(standaloneIndex(files)).toContain("window.OG_SUPABASE=");
  });
});

describe("contact section", () => {
  it("submits to Supabase REST and falls back locally", () => {
    const contact = SECTIONS.find((s) => s.id === "contact")!;
    expect(contact.html).toContain("data-og-contact");
    expect(contact.html).toContain("/rest/v1/submissions");
    expect(contact.html).toContain("window.OG_SUPABASE");
    expect(contact.html).toContain("og-form-msg");
  });
});
