import { describe, expect, it } from "vitest";

import { isStudyRepositoryConfigured } from "@/lib/database/supabase-server";

describe("private Supabase configuration", () => {
  it("is unavailable without both server credentials", () => {
    expect(
      isStudyRepositoryConfigured({
        SUPABASE_SERVICE_ROLE_KEY: "",
        SUPABASE_URL: "",
      }),
    ).toBe(false);
  });

  it("requires both a URL and service role before server retrieval can start", () => {
    expect(
      isStudyRepositoryConfigured({
        SUPABASE_SERVICE_ROLE_KEY: "service-role-only-on-server",
        SUPABASE_URL: "https://example.supabase.co",
      }),
    ).toBe(true);
  });
});
