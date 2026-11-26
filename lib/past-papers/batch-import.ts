import { lstat, readdir } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";

import { verifyLocalFileHandoff } from "@/lib/ingestion/handoff";
import { parsePaperMetadata, type PastPaperDocument } from "@/lib/past-papers/metadata";

export type InventoryFile = {
  path: string;
  byteCount: number;
  checksumSha256: string;
  hints: ReturnType<typeof parsePaperMetadata>;
};

type PaperIdentity = Omit<PastPaperDocument, "id" | "documentKind">;

export type ReviewedPaper = PaperIdentity & {
  question: string;
  markscheme?: string;
  reviewed: true;
};

export type ImportInventory = {
  version: 1;
  files: InventoryFile[];
  papers: ReviewedPaper[];
};

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("invalid batch review object");
  }
  return value as Record<string, unknown>;
}

export async function scanPastPaperDirectory(rootPath: string): Promise<ImportInventory> {
  if (/^[a-z]+:\/\//i.test(rootPath)) throw new Error("use an extracted local folder, not a URL");
  const root = resolve(rootPath);
  if (!(await lstat(root)).isDirectory()) throw new Error("expected a regular local directory");
  const files: InventoryFile[] = [];

  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile() && /\.pdf$/i.test(entry.name)) {
        const relativePath = relative(root, path).split(sep).join("/");
        const verified = await verifyLocalFileHandoff(path, {});
        files.push({
          path: relativePath,
          ...verified,
          hints: parsePaperMetadata(basename(path)),
        });
      }
    }
  }

  await walk(root);
  return { version: 1, files, papers: [] };
}

export function summarizeInventory(inventory: ImportInventory) {
  return {
    pdfCount: inventory.files.length,
    uniqueFileCount: new Set(inventory.files.map((f) => f.checksumSha256)).size,
    duplicateCopyCount: inventory.files.length -
      new Set(inventory.files.map((f) => f.checksumSha256)).size,
  };
}

export type PreparedPaper = {
  args: string[];
  question: InventoryFile;
  markscheme?: InventoryFile;
};

// Check the complete reviewed plan against a fresh local scan before any
// indexing begins. Filenames are only hints; the operator verifies metadata
// and question/markscheme identity against the actual PDF cover pages.
export function prepareBatch(
  raw: unknown,
  current: ImportInventory,
  rootPath: string,
): { papers: PreparedPaper[]; unassignedPdfCount: number } {
  const plan = record(raw);
  if (plan.version !== 1 || !Array.isArray(plan.files) || !Array.isArray(plan.papers)) {
    throw new Error("invalid batch review version or structure");
  }
  if (plan.papers.length === 0) throw new Error("add at least one reviewed paper to the inventory");

  const available = new Map(current.files.map((file) => [file.path, file]));
  const snapshot = new Map<string, { checksumSha256: unknown; byteCount: unknown }>();
  for (const item of plan.files) {
    const f = record(item);
    if (typeof f.path !== "string" || snapshot.has(f.path)) {
      throw new Error("invalid or duplicate inventory path");
    }
    snapshot.set(f.path, { checksumSha256: f.checksumSha256, byteCount: f.byteCount });
  }
  const usedPaths = new Set<string>();
  const usedHashes = new Set<string>();
  const identities = new Set<string>();

  function select(path: unknown, row: number): InventoryFile {
    if (typeof path !== "string") throw new Error("invalid file reference in row " + row);
    const file = available.get(path);
    const saved = snapshot.get(path);
    if (!file || !saved || saved.checksumSha256 !== file.checksumSha256 ||
        saved.byteCount !== file.byteCount) {
      throw new Error("missing or changed PDF in row " + row + "; rescan and review");
    }
    if (usedPaths.has(file.path) || usedHashes.has(file.checksumSha256)) {
      throw new Error("reused PDF or duplicate copy in row " + row);
    }
    usedPaths.add(file.path);
    usedHashes.add(file.checksumSha256);
    return file;
  }

  const papers = plan.papers.map((value: unknown, index: number): PreparedPaper => {
    const row = index + 1;
    const paper = record(value);
    const { subject, syllabusVersion, year, session, timezone, level, language } = paper;
    const component = paper.paper;
    if (paper.reviewed !== true ||
        (subject !== "physics" && subject !== "chemistry" && subject !== "mathematics") ||
        typeof syllabusVersion !== "string" || !/^[0-9A-Za-z._-]{1,32}$/.test(syllabusVersion) ||
        typeof year !== "number" || !Number.isInteger(year) || year < 2000 || year > 2099 ||
        (session !== "may" && session !== "november") ||
        typeof timezone !== "string" || !/^[A-Z0-9-]{1,16}$/.test(timezone) ||
        (level !== "HL" && level !== "SL") ||
        typeof component !== "string" || !/^p(?:1a|1b|[123])$/.test(component) ||
        typeof language !== "string" || !/^[A-Za-z][A-Za-z -]{0,79}$/.test(language) ||
        language !== language.trim()) {
      throw new Error("missing or invalid reviewed paper metadata in row " + row);
    }

    // The single-paper indexer keys by this identity, without syllabus
    // version. Reject a collision instead of overwriting a prior row.
    const languageKey = language.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const identity = JSON.stringify([subject, year, session, timezone, level, component, languageKey]);
    if (identities.has(identity)) throw new Error("duplicate paper identity in row " + row);
    identities.add(identity);

    const question = select(paper.question, row);
    const markscheme = paper.markscheme === undefined ? undefined : select(paper.markscheme, row);
    const args = [
      "--question", resolve(rootPath, question.path),
      "--subject", subject,
      "--year", String(year),
      "--session", session,
      "--timezone", timezone,
      "--level", level,
      "--paper", component,
      "--language", language,
      "--syllabus-version", syllabusVersion,
      "--provider", "manual",
    ];
    if (markscheme) args.push("--markscheme", resolve(rootPath, markscheme.path));
    return { args, question, markscheme };
  });

  return { papers, unassignedPdfCount: current.files.length - usedPaths.size };
}
