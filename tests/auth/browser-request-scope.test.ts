import { describe, expect, it } from "vitest";
import { createLatestRequestScope, workspaceAccountKey } from "@/lib/auth/browser-request-scope";

describe("browser request isolation", () => {
  it("aborts superseded requests and ignores late completion", () => {
    const scope = createLatestRequestScope();
    const old = scope.begin();
    expect(scope.pending()).toBe(true);
    const latest = scope.begin();
    expect(old.signal.aborted).toBe(true);
    expect(scope.isCurrent(old)).toBe(false);
    expect(scope.finish(old)).toBe(false);
    expect(scope.isCurrent(latest)).toBe(true);
    expect(scope.finish(latest)).toBe(true);
    expect(scope.pending()).toBe(false);
  });

  it("invalidates pending work when a workspace unmounts", () => {
    const scope = createLatestRequestScope();
    const request = scope.begin();
    scope.cancel();
    expect(request.signal.aborted).toBe(true);
    expect(scope.isCurrent(request)).toBe(false);
    expect(scope.finish(request)).toBe(false);
    expect(scope.pending()).toBe(false);
    const next = scope.begin();
    expect(scope.isCurrent(next)).toBe(true);
  });

  it("separates local, signed-out and distinct account workspaces", () => {
    const keys = [
      workspaceAccountKey(false),
      workspaceAccountKey(true),
      workspaceAccountKey(true, "user-a"),
      workspaceAccountKey(true, "user-b"),
      workspaceAccountKey(true, "user-a", 2),
    ];
    expect(new Set(keys).size).toBe(keys.length);
    expect(workspaceAccountKey(true, "user-a", 2)).toBe(keys[4]);
  });
});
