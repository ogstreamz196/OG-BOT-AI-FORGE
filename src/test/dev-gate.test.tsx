import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const google = { provider: "google", providers: ["google"] };
const state = vi.hoisted(() => ({ user: null as null | { id: string; email: string; app_metadata: Record<string, unknown> } }));

vi.mock("@/lib/auth", async (orig) => {
  const real = await orig<typeof import("@/lib/auth")>();
  return {
    ...real,
    supabase: () => ({
      auth: {
        getSession: async () => ({ data: { session: state.user ? { user: state.user } : null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signOut: async () => ({}),
      },
    }),
    signInWithGoogle: vi.fn(async () => ({ error: null })),
  };
});

import { DevGate } from "@/components/studio/DevGate";
import { isDevUser } from "@/lib/auth";

const renderGate = async () => {
  render(<DevGate>{(s) => <div>STUDIO for {s.email}</div>}</DevGate>);
  await act(async () => {});
};

afterEach(cleanup);

describe("D.EV sign-in gate", () => {
  it("only the D.EV emails signed in with Google count", () => {
    expect(isDevUser({ email: "OGstreamz196@gmail.com", app_metadata: google })).toBe(true);
    expect(isDevUser({ email: "ogbot196@gmail.com", app_metadata: google })).toBe(true);
    expect(isDevUser({ email: "someone@example.com", app_metadata: google })).toBe(false);
    expect(isDevUser({ email: "ogbot196@gmail.com", app_metadata: { provider: "email", providers: ["email"] } })).toBe(false);
    expect(isDevUser(null)).toBe(false);
  });

  it("signed out: shows Google sign-in, not the studio", async () => {
    state.user = null;
    await renderGate();
    expect(screen.getByRole("button", { name: /sign in with google/i })).toBeInTheDocument();
    expect(screen.queryByText(/STUDIO for/)).toBeNull();
  });

  it("D.EV account: shows the studio", async () => {
    state.user = { id: "1", email: "ogstreamz196@gmail.com", app_metadata: google };
    await renderGate();
    expect(screen.getByText("STUDIO for ogstreamz196@gmail.com")).toBeInTheDocument();
  });

  it("non-D.EV account: blocked", async () => {
    state.user = { id: "2", email: "someone@example.com", app_metadata: google };
    await renderGate();
    expect(screen.queryByText(/STUDIO for/)).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("doesn't have D.EV access");
  });
});
