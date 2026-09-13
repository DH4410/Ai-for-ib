import { describe, expect, it } from "vitest";

import {
  AuthenticationError,
  bearerTokenFromRequest,
  isUserAuthConfigured,
} from "@/lib/auth/request-user";

describe("request authentication", () => {
  it("requires a bearer access token", () => {
    expect(() =>
      bearerTokenFromRequest(
        new Request("http://localhost/api/progress"),
      ),
    ).toThrow(AuthenticationError);

    expect(
      bearerTokenFromRequest(
        new Request("http://localhost/api/progress", {
          headers: {
            Authorization: "Bearer test-access-token",
          },
        }),
      ),
    ).toBe("test-access-token");
  });

  it("requires a URL plus a current publishable key", () => {
    expect(
      isUserAuthConfigured({
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      }),
    ).toBe(true);

    expect(
      isUserAuthConfigured({
        SUPABASE_URL: "https://example.supabase.co",
      }),
    ).toBe(false);
  });
});
