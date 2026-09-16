import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  createSourcePdfGetHandler,
} from "@/app/api/source-pdf/route";
import {
  AuthenticationError,
} from "@/lib/auth/request-user";

const descriptor = {
  mimeType: "application/pdf",
  pageEnd: 7,
  pageStart: 6,
  storagePath:
    "physics/private-paper.pdf",
  title: "Physics May 2025 HL P2",
};

describe("private source PDF route", () => {
  it("authenticates before probing private source metadata", async () => {
    const getPastPaperAsset =
      vi.fn(async () => descriptor);
    const handler =
      createSourcePdfGetHandler({
        loadBytes: async () =>
          new Uint8Array([1]),
        repository: {
          getPastPaperAsset,
        },
        resolveUserId: async () => {
          throw new AuthenticationError(
            "invalid session",
          );
        },
      });

    const response = await handler(
      new Request(
        "http://localhost/api/source-pdf?questionId=physics-m25-q1",
      ),
    );

    expect(response.status).toBe(401);
    expect(
      getPastPaperAsset,
    ).not.toHaveBeenCalled();
  });

  it("returns a private no-store PDF with page metadata but no server path", async () => {
    const handler =
      createSourcePdfGetHandler({
        loadBytes: async () =>
          new Uint8Array([
            0x25,
            0x50,
            0x44,
            0x46,
          ]),
        repository: {
          getPastPaperAsset: async () =>
            descriptor,
        },
        resolveUserId: async () =>
          "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      });

    const response = await handler(
      new Request(
        "http://localhost/api/source-pdf?questionId=physics-m25-q1",
      ),
    );

    expect(response.status).toBe(200);
    expect(
      response.headers.get(
        "Content-Type",
      ),
    ).toBe("application/pdf");
    expect(
      response.headers.get(
        "Cache-Control",
      ),
    ).toContain("no-store");
    expect(
      response.headers.get(
        "X-Source-Page-Start",
      ),
    ).toBe("6");
    expect(
      response.headers.get(
        "X-Source-Page-End",
      ),
    ).toBe("7");
    expect(
      JSON.stringify([
        ...response.headers,
      ]),
    ).not.toContain(
      "physics/private-paper.pdf",
    );
  });

  it("does not expose whether an invalid question exists before authentication", async () => {
    const handler =
      createSourcePdfGetHandler({
        loadBytes: async () =>
          new Uint8Array([]),
        repository: {
          getPastPaperAsset:
            vi.fn(async () => null),
        },
        resolveUserId: async () => {
          throw new AuthenticationError(
            "sign in required",
          );
        },
      });

    const response = await handler(
      new Request(
        "http://localhost/api/source-pdf?questionId=../../secret",
      ),
    );

    expect(response.status).toBe(401);
  });
});
