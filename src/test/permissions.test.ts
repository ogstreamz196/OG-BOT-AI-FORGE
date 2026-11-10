import { beforeEach, describe, expect, it } from "vitest";
import { permissions } from "@/lib/permissions";

beforeEach(() => permissions._reset());

describe("permissions", () => {
  it("defaults to not granted", () => {
    expect(permissions.isGranted("orchestrate")).toBe(false);
  });
  it("request resolves immediately when already granted", async () => {
    permissions.grant("orchestrate");
    await expect(permissions.request("orchestrate")).resolves.toBe(true);
  });
  it("request stays pending until answered, then grants on allow", async () => {
    const p = permissions.request("self-tune");
    const pending = permissions.getPending();
    expect(pending?.def.id).toBe("self-tune");
    pending!.resolve(true);
    await expect(p).resolves.toBe(true);
    expect(permissions.isGranted("self-tune")).toBe(true);
  });
  it("deny does not grant", async () => {
    const p = permissions.request("apply-code");
    permissions.getPending()!.resolve(false);
    await expect(p).resolves.toBe(false);
    expect(permissions.isGranted("apply-code")).toBe(false);
  });
  it("revoke removes a grant", () => {
    permissions.grant("propose-code");
    permissions.revoke("propose-code");
    expect(permissions.isGranted("propose-code")).toBe(false);
  });
});

import { isAllowed, isDevCode } from "@/lib/dev-auth";
describe("dev-auth allowlist", () => {
  it("allows the 2 D.EV emails (case-insensitive), rejects others", () => {
    expect(isAllowed("ogbot196@gmail.com")).toBe(true);
    expect(isAllowed("OGSTREAMZ196@gmail.com")).toBe(true);
    expect(isAllowed("faiyaz196@gmail.com")).toBe(false);
    expect(isAllowed("someone@else.com")).toBe(false);
    expect(isAllowed(null)).toBe(false);
  });
  it("accepts the local fallback code variants", () => {
    expect(isDevCode("dev.b055")).toBe(true);
    expect(isDevCode("DEV.BO55")).toBe(true);
    expect(isDevCode("nope")).toBe(false);
  });
});
