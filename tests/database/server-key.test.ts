import {
  describe,
  expect,
  it,
} from "vitest";

import {
  resolveServerDatabaseKey,
} from "@/lib/database/server-key";

describe("server database key resolution", () => {
  it("prefers the current secret key and keeps legacy service_role as fallback", () => {
    expect(
      resolveServerDatabaseKey({
        SUPABASE_SECRET_KEY: " current-secret ",
        SUPABASE_SERVICE_ROLE_KEY:
          "legacy-service",
      }),
    ).toEqual({
      key: "current-secret",
      kind: "secret",
    });

    expect(
      resolveServerDatabaseKey({
        SUPABASE_SERVICE_ROLE_KEY:
          " legacy-service ",
      }),
    ).toEqual({
      key: "legacy-service",
      kind: "legacy-service-role",
    });

    expect(
      resolveServerDatabaseKey({}),
    ).toEqual({
      key: undefined,
      kind: "missing",
    });
  });
});
