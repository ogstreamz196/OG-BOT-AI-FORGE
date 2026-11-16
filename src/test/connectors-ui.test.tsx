import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Connectors } from "@/components/studio/Connectors";
import { driveLink } from "@/lib/drive-link";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Connectors", () => {
  it("drive-managed engines need nothing filled in", () => {
    vi.spyOn(driveLink, "get").mockReturnValue({ mode: "remote", base: "https://d.example", status: null, message: "" });
    render(<Connectors />);
    expect(screen.getAllByText("Managed by your drive · remote").length).toBe(2);
    expect(screen.queryByRole("switch", { name: "Enable Ollama (local LLM)" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Ollama/ }));
    expect(screen.getByText(/Your drive sets this up by itself/)).toBeInTheDocument();
  });
  it("rows start folded and say what they're set to", () => {
    vi.spyOn(driveLink, "get").mockReturnValue({ mode: "none", base: null, status: null, message: "" });
    render(<Connectors />);
    expect(screen.queryByLabelText("Project URL")).not.toBeInTheDocument();
    expect(screen.queryByText(/on the Worker/)).not.toBeInTheDocument();
  });
});
