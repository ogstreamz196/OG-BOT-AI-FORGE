import { beforeEach, describe, expect, it } from "vitest";
import { CONNECTOR_CATALOG, connectors } from "@/lib/connectors";

beforeEach(() => connectors._reset());

describe("connectors store", () => {
  it("has local AI, backend, payments and integration connectors", () => {
    const kinds = CONNECTOR_CATALOG.map((c) => c.kind);
    expect(kinds).toEqual(
      expect.arrayContaining(["ollama", "comfyui", "supabase", "stripe", "rest", "email"]),
    );
  });
  it("defaults Ollama base URL to localhost", () => {
    expect(connectors.configOf("ollama")["baseUrl"]).toBe("http://localhost:11434");
  });
  it("toggles and stores config", () => {
    connectors.toggle("ollama", true);
    expect(connectors.isEnabled("ollama")).toBe(true);
    connectors.setField("ollama", "baseUrl", "http://127.0.0.1:1234");
    expect(connectors.configOf("ollama")["baseUrl"]).toBe("http://127.0.0.1:1234");
    connectors.toggle("ollama");
    expect(connectors.isEnabled("ollama")).toBe(false);
  });
});
