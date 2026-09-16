import type { SupabaseClient } from "@supabase/supabase-js";

import { getPrivateSupabaseServerClient } from "@/lib/database/supabase-server";
import type { StudyDocumentType } from "@/lib/study-source/types";
import type { Subject } from "@/types/study";

export type SafeStudySourceSummary = {
  sourceId: string;
  subject: Subject | "ib";
  documentType: StudyDocumentType;
  title: string;
  versionCount: number;
  latestAcquiredAt: string | null;
  chunkCount: number;
  questionCount: number;
  pairedQuestionCount: number;
};

export interface StudySourceCatalogRepository {
  listSources(
    subject?: Subject,
  ): Promise<SafeStudySourceSummary[]>;
}

type RpcRow = {
  source_id: string;
  subject: Subject | "ib";
  document_type: StudyDocumentType;
  title: string;
  version_count: number;
  latest_acquired_at: string | null;
  chunk_count: number;
  question_count: number;
  paired_question_count: number;
};

type RpcClient = {
  rpc: (
    name: string,
    parameters: Record<string, unknown>,
  ) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

export class SupabaseStudySourceCatalogRepository
  implements StudySourceCatalogRepository
{
  private readonly client: RpcClient;

  constructor(client: SupabaseClient = getPrivateSupabaseServerClient()) {
    this.client = client as unknown as RpcClient;
  }

  async listSources(
    subject?: Subject,
  ): Promise<SafeStudySourceSummary[]> {
    const { data, error } = await this.client.rpc(
      "list_private_study_sources",
      {
        p_subject: subject ?? null,
      },
    );

    if (error) {
      throw new Error(
        `loading source catalog failed: ${error.message}`,
      );
    }

    return ((data ?? []) as RpcRow[]).map((row) => ({
      chunkCount: Number(row.chunk_count),
      documentType: row.document_type,
      latestAcquiredAt: row.latest_acquired_at,
      pairedQuestionCount: Number(
        row.paired_question_count,
      ),
      questionCount: Number(row.question_count),
      sourceId: row.source_id,
      subject: row.subject,
      title: row.title,
      versionCount: Number(row.version_count),
    }));
  }
}

export class InMemoryStudySourceCatalogRepository
  implements StudySourceCatalogRepository
{
  constructor(
    private readonly sources: SafeStudySourceSummary[],
  ) {}

  async listSources(
    subject?: Subject,
  ): Promise<SafeStudySourceSummary[]> {
    return this.sources
      .filter(
        (source) =>
          !subject || source.subject === subject,
      )
      .sort(
        (left, right) =>
          left.title.localeCompare(right.title) ||
          left.sourceId.localeCompare(right.sourceId),
      );
  }
}
