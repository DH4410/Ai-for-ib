import "server-only";

import { createClient } from "@supabase/supabase-js";

export class AuthenticationError extends Error {}

export type UserAuthEnvironment = {
  [name: string]: string | undefined;
  SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
};

function publishableKey(
  environment: UserAuthEnvironment,
): string | undefined {
  return (
    environment.SUPABASE_PUBLISHABLE_KEY?.trim() ||
    environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
  );
}

export function isUserAuthConfigured(
  environment: UserAuthEnvironment,
): boolean {
  return Boolean(
    environment.SUPABASE_URL?.trim() &&
      publishableKey(environment),
  );
}

export function bearerTokenFromRequest(request: Request): string {
  const header = request.headers.get("Authorization")?.trim();

  if (!header?.startsWith("Bearer ")) {
    throw new AuthenticationError(
      "A valid Bearer access token is required.",
    );
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    throw new AuthenticationError(
      "A valid Bearer access token is required.",
    );
  }

  return token;
}

export async function resolveAuthenticatedUserId(
  request: Request,
  environment: UserAuthEnvironment = process.env,
): Promise<string> {
  const key = publishableKey(environment);
  const url = environment.SUPABASE_URL?.trim();

  if (!url || !key) {
    throw new Error(
      "User authentication is not configured. Set SUPABASE_URL and a Supabase publishable key.",
    );
  }

  const token = bearerTokenFromRequest(request);
  const client = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
  const {
    data: { user },
    error,
  } = await client.auth.getUser(token);

  if (error || !user) {
    throw new AuthenticationError(
      "The Supabase session is invalid or expired.",
    );
  }

  return user.id;
}
