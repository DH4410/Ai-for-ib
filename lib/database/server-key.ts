export type ServerDatabaseKeyEnvironment = {
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

export function resolveServerDatabaseKey(
  environment: ServerDatabaseKeyEnvironment,
): {
  key: string | undefined;
  kind: "secret" | "legacy-service-role" | "missing";
} {
  const secret =
    environment.SUPABASE_SECRET_KEY?.trim();
  if (secret) {
    return {
      key: secret,
      kind: "secret",
    };
  }

  const legacy =
    environment.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (legacy) {
    return {
      key: legacy,
      kind: "legacy-service-role",
    };
  }

  return {
    key: undefined,
    kind: "missing",
  };
}
