import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { resolveServerDatabaseKey } from "@/lib/database/server-key";

export type StudyRepositoryEnvironment = {
  [name: string]: string | undefined;
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

export function isStudyRepositoryConfigured(
  environment: StudyRepositoryEnvironment,
): boolean {
  return Boolean(
    environment.SUPABASE_URL?.trim() &&
      resolveServerDatabaseKey(environment).key,
  );
}

export function getPrivateSupabaseServerClient(
  environment: StudyRepositoryEnvironment = process.env,
): SupabaseClient {
  const key =
    resolveServerDatabaseKey(environment).key;

  if (!environment.SUPABASE_URL?.trim() || !key) {
    throw new Error(
      "Private study retrieval is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY on the server (or legacy SUPABASE_SERVICE_ROLE_KEY).",
    );
  }

  return createClient(environment.SUPABASE_URL, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
