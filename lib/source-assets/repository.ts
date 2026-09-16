import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getPrivateSupabaseServerClient,
} from "@/lib/database/supabase-server";

export type PastPaperAssetDescriptor = {
  mimeType: string;
  pageEnd: number;
  pageStart: number;
  storagePath: string;
  title: string;
};

export interface SourceAssetRepository {
  getPastPaperAsset(
    questionId: string,
  ): Promise<PastPaperAssetDescriptor | null>;
}

type RpcClient = {
  rpc: (
    name: string,
    parameters: Record<string, unknown>,
  ) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

type RpcAssetRow = {
  mime_type: string;
  page_end: number;
  page_start: number;
  storage_path: string;
  title: string;
};

function toDescriptor(
  row: RpcAssetRow,
): PastPaperAssetDescriptor {
  if (
    typeof row.storage_path !== "string" ||
    typeof row.mime_type !== "string" ||
    !Number.isSafeInteger(row.page_start) ||
    !Number.isSafeInteger(row.page_end) ||
    typeof row.title !== "string"
  ) {
    throw new Error(
      "private source asset returned invalid metadata",
    );
  }

  return {
    mimeType: row.mime_type,
    pageEnd: row.page_end,
    pageStart: row.page_start,
    storagePath: row.storage_path,
    title: row.title,
  };
}

export class SupabaseSourceAssetRepository
  implements SourceAssetRepository
{
  private readonly client: RpcClient;

  constructor(
    client: SupabaseClient =
      getPrivateSupabaseServerClient(),
  ) {
    this.client =
      client as unknown as RpcClient;
  }

  async getPastPaperAsset(
    questionId: string,
  ): Promise<PastPaperAssetDescriptor | null> {
    const { data, error } =
      await this.client.rpc(
        "get_private_past_paper_asset",
        {
          p_question_id: questionId,
        },
      );

    if (error) {
      throw new Error(
        `loading private source asset failed: ${error.message}`,
      );
    }

    const row = (
      (data ?? []) as RpcAssetRow[]
    )[0];

    return row ? toDescriptor(row) : null;
  }
}
