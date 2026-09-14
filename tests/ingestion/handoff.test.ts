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
          "cff510ce2bba7f07a55e538395cbcc8b25abf055ff9ca0e797db1f4a0731826a",
      }),
    ).resolves.toEqual({
      byteCount: 18,
      checksumSha256:
        "cff510ce2bba7f07a55e538395cbcc8b25abf055ff9ca0e797db1f4a0731826a",
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
