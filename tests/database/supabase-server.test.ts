import { describe, expect, it } from "vitest";

import {
  isStudyRepositoryConfigured,
} from "@/lib/database/supabase-server";

describe("private Supabase server configuration", () => {
  it("is not configured without a URL and server secret", () => {
    expect(
      isStudyRepositoryConfigured({
        SUPABASE_URL: "",
        SUPABASE_SECRET_KEY: "",
        SUPABASE_SERVICE_ROLE_KEY: "",
      }),
    ).toBe(false);
  });

  it("prefers the current secret-key configuration", () => {
    expect(
      isStudyRepositoryConfigured({
        SUPABASE_SECRET_KEY: "sb_secret_example",
        SUPABASE_URL: "https://example.supabase.co",
      }),
    ).toBe(true);
  });

  it("keeps the legacy service-role key as a fallback", () => {
    expect(
      isStudyRepositoryConfigured({
        SUPABASE_SERVICE_ROLE_KEY:
          "legacy-service-role",
        SUPABASE_URL: "https://example.supabase.co",
      }),
    ).toBe(true);
  });
});
