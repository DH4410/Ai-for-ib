import { describe, expect, it, vi } from "vitest";

import {
  checkModelEndpoint,
} from "@/lib/model-endpoint";

function jsonResponse(
  payload: unknown,
  status = 200,
): Response {
  return new Response(
    JSON.stringify(payload),
    {
      headers: {
        "Content-Type":
          "application/json",
      },
      status,
    },
  );
}

describe("model endpoint preflight", () => {
  it("requires the configured model alias and a non-empty chat response", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "Qwen/Qwen3-4B-Instruct-2507",
            },
            {
              id: "Dima-IB-Tutor-v1",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          model: "Dima-IB-Tutor-v1",
          choices: [
            {
              message: {
                content:
                  "IB tutor endpoint is ready.",
              },
            },
          ],
        }),
      );

    const result =
      await checkModelEndpoint(
        {
          baseUrl:
            "http://localhost:8000/v1",
          model: "Dima-IB-Tutor-v1",
        },
        fetchImpl,
      );

    expect(result).toMatchObject({
      listedModelCount: 2,
      model: "Dima-IB-Tutor-v1",
      modelListed: true,
      responseModel:
        "Dima-IB-Tutor-v1",
      thinkingBlockDetected: false,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(
      2,
    );
  });

  it("fails before chat when the configured adapter alias is not exposed", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({
          data: [
            {
              id: "base-model",
            },
          ],
        }),
      );

    await expect(
      checkModelEndpoint(
        {
          baseUrl:
            "http://localhost:8000/v1",
          model: "Dima-IB-Tutor-v1",
        },
        fetchImpl,
      ),
    ).rejects.toThrow(
      "configured model alias is not exposed",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(
      1,
    );
  });

  it("rejects visible thinking blocks for the normal tutor endpoint", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "Dima-IB-Tutor-v1",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          model: "Dima-IB-Tutor-v1",
          choices: [
            {
              message: {
                content:
                  "<think>hidden reasoning</think> Ready.",
              },
            },
          ],
        }),
      );

    await expect(
      checkModelEndpoint(
        {
          baseUrl:
            "http://localhost:8000/v1",
          model: "Dima-IB-Tutor-v1",
        },
        fetchImpl,
      ),
    ).rejects.toThrow(
      "exposed a <think> block",
    );
  });
});
