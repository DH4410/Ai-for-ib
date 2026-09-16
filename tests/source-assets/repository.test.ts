import {
  describe,
  expect,
  it,
} from "vitest";

import {
  SupabaseSourceAssetRepository,
} from "@/lib/source-assets/repository";

describe("source asset repository", () => {
  it("loads only safe metadata through the server RPC", async () => {
    let called:
      | {
          name: string;
          parameters:
            Record<string, unknown>;
        }
      | undefined;

    const repository =
      new SupabaseSourceAssetRepository({
        async rpc(
          name: string,
          parameters:
            Record<string, unknown>,
        ) {
          called = {
            name,
            parameters,
          };
          return {
            data: [
              {
                mime_type:
                  "application/pdf",
                page_end: 7,
                page_start: 6,
                storage_path:
                  "physics/paper.pdf",
                title:
                  "Physics May 2025 HL P2",
              },
            ],
            error: null,
          };
        },
      } as never);

    await expect(
      repository.getPastPaperAsset(
        "physics-m25-q1",
      ),
    ).resolves.toEqual({
      mimeType: "application/pdf",
      pageEnd: 7,
      pageStart: 6,
      storagePath:
        "physics/paper.pdf",
      title:
        "Physics May 2025 HL P2",
    });
    expect(called).toEqual({
      name:
        "get_private_past_paper_asset",
      parameters: {
        p_question_id:
          "physics-m25-q1",
      },
    });
  });
});
