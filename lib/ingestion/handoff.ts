import { createReadStream } from "node:fs";
import { lstat } from "node:fs/promises";
import { createHash } from "node:crypto";

export type LocalHandoffExpectation = {
  checksumSha256?: string;
  byteCount?: number;
};

export type VerifiedLocalHandoff = {
  checksumSha256: string;
  byteCount: number;
};

function assertChecksum(value: string): string {
  const normalized = value.trim().toLocaleLowerCase();

  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error(
      "expected handoff SHA-256 must contain exactly 64 hexadecimal characters",
    );
  }

  return normalized;
}

export async function verifyLocalFileHandoff(
  inputPath: string,
  expectation: LocalHandoffExpectation,
): Promise<VerifiedLocalHandoff> {
  if (/^(?:https?|ftp):\/\//i.test(inputPath)) {
    throw new Error("handoff verification accepts a local file path, not a URL");
  }

  const stats = await lstat(inputPath);
  if (!stats.isFile()) {
    throw new Error("handoff input must be a regular file");
  }

  if (
    expectation.byteCount !== undefined &&
    (!Number.isSafeInteger(expectation.byteCount) ||
      expectation.byteCount < 0)
  ) {
    throw new Error(
      "expected handoff byte count must be a non-negative integer",
    );
  }

  if (
    expectation.byteCount !== undefined &&
    stats.size !== expectation.byteCount
  ) {
    throw new Error(
      `handoff byte count mismatch: expected ${expectation.byteCount}, got ${stats.size}`,
    );
  }

  const hash = createHash("sha256");
  let byteCount = 0;

  for await (const chunk of createReadStream(inputPath)) {
    hash.update(chunk);
    byteCount += chunk.length;
  }

  const checksumSha256 = hash.digest("hex");

  if (expectation.checksumSha256 !== undefined) {
    const expected = assertChecksum(
      expectation.checksumSha256,
    );
    if (checksumSha256 !== expected) {
      throw new Error(
        `handoff SHA-256 mismatch: expected ${expected}, got ${checksumSha256}`,
      );
    }
  }

  return {
    byteCount,
    checksumSha256,
  };
}
