import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type StudyRepositoryEnvironment = {
  [name: string]: string | undefined;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

export function isStudyRepositoryConfigured(environment: StudyRepositoryEnvironment): boolean {
  return Boolean(
    environment.SUPABASE_URL?.trim() && environment.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

export function getPrivateSupabaseServerClient(
  environment: StudyRepositoryEnvironment = process.env,
): SupabaseClient {
  if (!isStudyRepositoryConfigured(environment)) {
    throw new Error(
      "Private study retrieval is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.",
    );
  }

  return createClient(environment.SUPABASE_URL!, environment.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
