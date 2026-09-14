import {
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  afterEach,
  describe,
  expect,
  it,
} from "vitest";

import {
  verifyLocalFileHandoff,
} from "@/lib/ingestion/handoff";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {
        force: true,
        recursive: true,
      }),
    ),
  );
});

describe("private local file handoff", () => {
  it("verifies an expected byte count and SHA-256 before ingestion", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "ai-for-ib-handoff-"),
    );
    temporaryDirectories.push(directory);
    const inputPath = join(directory, "book.pdf");
    await writeFile(inputPath, "authorized fixture", "utf8");

    await expect(
      verifyLocalFileHandoff(inputPath, {
        byteCount: 18,
        checksumSha256:
          "9368a0a6d109fe307a6bbb50e0c4620c07fd35237a975f1180bad5e6c384ae09",
      }),
    ).resolves.toEqual({
      byteCount: 18,
      checksumSha256:
        "9368a0a6d109fe307a6bbb50e0c4620c07fd35237a975f1180bad5e6c384ae09",
    });
  });

  it("rejects a file that does not match the claimed ManageBac handoff", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "ai-for-ib-handoff-"),
    );
    temporaryDirectories.push(directory);
    const inputPath = join(directory, "book.pdf");
    await writeFile(inputPath, "authorized fixture", "utf8");

    await expect(
      verifyLocalFileHandoff(inputPath, {
        byteCount: 17,
      }),
    ).rejects.toThrow("handoff byte count mismatch");
  });
});
