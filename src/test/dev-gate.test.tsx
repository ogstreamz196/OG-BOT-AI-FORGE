import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ user: null as null | { id: string; email: string }, level: "guest" }));

vi.mock("@/lib/auth", async (orig) => {
  const real = await orig<typeof import("@/lib/auth")>();
  return {
    ...real,
    hub: () => ({
      auth: {
        getSession: async () => ({ data: { session: state.user ? { user: state.user } : null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signOut: async () => ({}),
      },
    }),
    fetchLevel: async () => state.level,
    signInWithGoogle: vi.fn(async () => ({ error: null })),
  };
});

import { DevGate } from "@/components/studio/DevGate";
import { isDevLevel } from "@/lib/auth";

const renderGate = async () => {
  render(<DevGate>{(s) => <div>STUDIO for {s.email}</div>}</DevGate>);
  await act(async () => {});
};

afterEach(cleanup);

describe("D.EV sign-in gate", () => {
  it("only the vault's admin level counts as D.EV", () => {
    expect(isDevLevel("admin")).toBe(true);
    for (const l of ["none", "guest", "free", "vip", "staff"] as const) expect(isDevLevel(l)).toBe(false);
  });

  it("signed out: shows Google sign-in, not the studio", async () => {
    state.user = null;
    await renderGate();
    expect(screen.getByRole("button", { name: /sign in with google/i })).toBeInTheDocument();
    expect(screen.queryByText(/STUDIO for/)).toBeNull();
  });

  it("D.EV account: shows the studio", async () => {
    state.user = { id: "1", email: "ogstreamz196@gmail.com" };
    state.level = "admin";
    await renderGate();
    expect(screen.getByText("STUDIO for ogstreamz196@gmail.com")).toBeInTheDocument();
  });

  it("non-D.EV account: blocked", async () => {
    state.user = { id: "2", email: "someone@example.com" };
    state.level = "vip";
    await renderGate();
    expect(screen.queryByText(/STUDIO for/)).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("doesn't have D.EV access");
  });
});
