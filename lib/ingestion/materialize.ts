import { constants, createReadStream } from "node:fs";
import { access, copyFile, lstat, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { extname, relative, resolve } from "node:path";

import {
  appendManifestEvent,
  findDuplicateByChecksum,
} from "@/lib/study-source/manifest";
import type {
  MaterializeLocalSourceRequest,
  MaterializeLocalSourceResult,
} from "@/lib/ingestion/types";

const MIME_TYPES: Record<string, string> = {
  ".csv": "text/csv",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".md": "text/markdown",
  ".pdf": "application/pdf",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

async function calculateFileChecksum(inputPath: string): Promise<{ checksumSha256: string; byteCount: number }> {
  const hash = createHash("sha256");
  let byteCount = 0;

  for await (const chunk of createReadStream(inputPath)) {
    hash.update(chunk);
    byteCount += chunk.length;
  }

  return { byteCount, checksumSha256: hash.digest("hex") };
}

function assertLocalFilePath(inputPath: string): void {
  if (/^(?:https?|ftp):\/\//i.test(inputPath)) {
    throw new Error("materialization accepts a local file path, not a URL");
  }
}

function safeErrorSummary(error: unknown): string {
  const code = (error as NodeJS.ErrnoException).code;

  return code ? `materialization filesystem error: ${code}` : "materialization failed";
}

function relativePathFor(sourceId: string, subject: string, extension: string): string {
  return `${subject}/${sourceId}${extension}`;
}

function assertDestinationInsideRoot(root: string, destination: string): void {
  const pathFromRoot = relative(root, destination);

  if (pathFromRoot.startsWith("..") || pathFromRoot.includes(":") || pathFromRoot.length === 0) {
    throw new Error("materialization destination escapes the private source root");
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function chooseDestination(
  root: string,
  relativePath: string,
  checksumSha256: string,
): Promise<string> {
  const initialDestination = resolve(root, relativePath);
  assertDestinationInsideRoot(root, initialDestination);

  if (!(await pathExists(initialDestination))) {
    return initialDestination;
  }

  const extension = extname(relativePath);
  const base = relativePath.slice(0, relativePath.length - extension.length);

  for (let index = 0; index < 1000; index += 1) {
    const suffix = index === 0 ? checksumSha256.slice(0, 12) : `${checksumSha256.slice(0, 12)}-${index + 1}`;
    const destination = resolve(root, `${base}--${suffix}${extension}`);
    assertDestinationInsideRoot(root, destination);

    if (!(await pathExists(destination))) {
      return destination;
    }
  }

  throw new Error("could not allocate an immutable private source path");
}

export async function materializeLocalSource(
  request: MaterializeLocalSourceRequest,
): Promise<MaterializeLocalSourceResult> {
  const { inputPath, manifestPath, privateSourcesRoot, source } = request;

  await appendManifestEvent(manifestPath, {
    eventType: "materialization_started",
    occurredAt: new Date().toISOString(),
    sourceId: source.id,
    sourceProvider: source.sourceProvider,
    sourceReference: source.sourceReference,
  });

  try {
    assertLocalFilePath(inputPath);
    const inputStats = await lstat(inputPath);
    if (!inputStats.isFile()) {
      throw new Error("materialization input must be a regular file");
    }

    const extension = extname(source.filename).toLowerCase();
    const mimeType = MIME_TYPES[extension];
    if (!mimeType) {
      throw new Error(`unsupported source file extension: ${extension || "none"}`);
    }

    const { byteCount, checksumSha256 } = await calculateFileChecksum(inputPath);
    const duplicate = await findDuplicateByChecksum(manifestPath, checksumSha256);
    if (duplicate) {
      await appendManifestEvent(manifestPath, {
        checksumSha256,
        duplicateOfSourceId: duplicate.sourceId,
        eventType: "duplicate",
        occurredAt: new Date().toISOString(),
        sourceId: source.id,
      });

      return {
        byteCount,
        checksumSha256,
        mimeType,
        relativePath: duplicate.localRelativePath,
        status: "duplicate",
      };
    }

    const root = resolve(privateSourcesRoot);
    const relativePath = relativePathFor(source.id, source.subject, extension);
    const destination = await chooseDestination(root, relativePath, checksumSha256);
    const destinationRelativePath = relative(root, destination).replaceAll("\\", "/");
    await mkdir(resolve(root, source.subject), { recursive: true });
    await copyFile(inputPath, destination, constants.COPYFILE_EXCL);

    await appendManifestEvent(manifestPath, {
      byteCount,
      checksumSha256,
      eventType: "materialized",
      localRelativePath: destinationRelativePath,
      mimeType,
      occurredAt: new Date().toISOString(),
      sourceId: source.id,
    });

    return {
      byteCount,
      checksumSha256,
      mimeType,
      relativePath: destinationRelativePath,
      status: "materialized",
    };
  } catch (error) {
    await appendManifestEvent(manifestPath, {
      eventType: "failed",
      failureStage: "materialization",
      occurredAt: new Date().toISOString(),
      safeErrorSummary: safeErrorSummary(error),
      sourceId: source.id,
    });
    throw error;
  }
}
