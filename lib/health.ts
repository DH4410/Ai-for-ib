import {
  isUserAuthConfigured,
  type UserAuthEnvironment,
} from "@/lib/auth/request-user";
import {
  isStudyRepositoryConfigured,
  type StudyRepositoryEnvironment,
} from "@/lib/database/supabase-server";
import {
  isEmbeddingConfigured,
  type EmbeddingEnvironment,
} from "@/lib/embeddings";

export type HealthEnvironment =
  & UserAuthEnvironment
  & StudyRepositoryEnvironment
  & EmbeddingEnvironment
  & {
    MODEL_BASE_URL?: string;
    MODEL_NAME?: string;
    USE_MOCK_MODEL?: string;
  };

export type CapabilityHealth = {
  ok: true;
  service: "ai-for-ib";
  model: {
    configured: boolean;
    mode: "mock" | "self-hosted" | "missing";
  };
  embeddings: {
    configured: boolean;
  };
  retrieval: {
    configured: boolean;
  };
  realPastPapers: {
    configured: boolean;
  };
  auth: {
    configured: boolean;
  };
  progress: {
    configured: boolean;
  };
  serverDatabaseKey: "secret" | "legacy-service-role" | "missing";
};

export function buildCapabilityHealth(
  environment: HealthEnvironment,
): CapabilityHealth {
  const mockMode = environment.USE_MOCK_MODEL === "true";
  const modelConfigured = Boolean(
    mockMode ||
      (environment.MODEL_BASE_URL?.trim() &&
        environment.MODEL_NAME?.trim()),
  );
  const retrievalConfigured =
    isStudyRepositoryConfigured(environment);
  const authConfigured = isUserAuthConfigured(environment);

  return {
    auth: {
      configured: authConfigured,
    },
    embeddings: {
      configured: isEmbeddingConfigured(environment),
    },
    model: {
      configured: modelConfigured,
      mode: mockMode
        ? "mock"
        : modelConfigured
          ? "self-hosted"
          : "missing",
    },
    ok: true,
    progress: {
      configured:
        authConfigured && retrievalConfigured,
    },
    realPastPapers: {
      configured: retrievalConfigured,
    },
    retrieval: {
      configured: retrievalConfigured,
    },
    serverDatabaseKey: environment.SUPABASE_SECRET_KEY?.trim()
      ? "secret"
      : environment.SUPABASE_SERVICE_ROLE_KEY?.trim()
        ? "legacy-service-role"
        : "missing",
    service: "ai-for-ib",
  };
}
