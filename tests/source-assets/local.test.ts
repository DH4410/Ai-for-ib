import {
  describe,
  expect,
  it,
} from "vitest";

import {
  resolvePrivateSourceAssetPath,
} from "@/lib/source-assets/local";

const asset = {
  mimeType: "application/pdf",
  pageEnd: 4,
  pageStart: 4,
  storagePath:
    "physics/private-paper.pdf",
  title: "Physics paper",
};

describe("private source asset paths", () => {
  it("resolves a relative storage path under the private root", () => {
    const result =
      resolvePrivateSourceAssetPath(
        "/srv/private-sources",
        asset,
      );

    expect(result).toContain(
      "private-sources",
    );
    expect(result).toContain(
      "private-paper.pdf",
    );
  });

  it("rejects path traversal, absolute paths and URLs", () => {
    for (const storagePath of [
      "../outside.pdf",
      "/tmp/outside.pdf",
      "https://example.com/private.pdf",
    ]) {
      expect(() =>
        resolvePrivateSourceAssetPath(
          "/srv/private-sources",
          {
            ...asset,
            storagePath,
          },
        ),
      ).toThrow();
    }
  });
});
