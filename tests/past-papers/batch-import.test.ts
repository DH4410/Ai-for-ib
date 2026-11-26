import { mkdtemp, mkdir, rm, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  prepareBatch,
  scanPastPaperDirectory,
  summarizeInventory,
  type ImportInventory,
  type ReviewedPaper,
} from "@/lib/past-papers/batch-import";

let root: string;
const row: ReviewedPaper = {
  question: "Physics/physics_m25_hl_tz2_p2_qp.PDF",
  markscheme: "Physics/physics_m25_hl_tz2_p2_ms.pdf",
  reviewed: true,
  subject: "physics",
  year: 2025,
  session: "may",
  timezone: "TZ2",
  level: "HL",
  paper: "p2",
  language: "English",
  syllabusVersion: "2025",
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "ib-batch-"));
  await mkdir(join(root, "Physics"));
  await mkdir(join(root, "Math"));
  await writeFile(join(root, row.question), "synthetic question bytes");
  await writeFile(join(root, row.markscheme!), "synthetic scheme bytes");
  await writeFile(join(root, "Math", "review-me.pdf"), "synthetic other bytes");
  await writeFile(join(root, "Math", "copy.pdf"), "synthetic other bytes");
  await writeFile(join(root, "notes.txt"), "not a PDF");
});

afterEach(async () => { await rm(root, { recursive: true, force: true }); });

async function reviewed(): Promise<ImportInventory> {
  const inventory = await scanPastPaperDirectory(root);
  return { ...inventory, papers: [row] };
}

describe("private past-paper batch", () => {
  it("recursively inventories PDFs and identifies copies without assuming metadata", async () => {
    const inventory = await scanPastPaperDirectory(root);
    expect(summarizeInventory(inventory)).toEqual({ pdfCount: 4, uniqueFileCount: 3, duplicateCopyCount: 1 });
    expect(inventory.papers).toEqual([]);
    expect(inventory.files.find((f) => f.path === row.question)?.hints).toMatchObject({
      subject: "physics", year: 2025, paper: "p2", documentKind: "question-paper",
    });
    expect(inventory.files.find((f) => f.path === "Math/review-me.pdf")?.hints.subject).toBeUndefined();
  });

  it("builds explicit arguments for a reviewed pair without using file hints as authority", async () => {
    const plan = await reviewed();
    const result = prepareBatch(plan, await scanPastPaperDirectory(root), root);
    expect(result.unassignedPdfCount).toBe(2);
    expect(result.papers[0].args).toEqual(expect.arrayContaining(["--question", "--markscheme", "--syllabus-version", "2025"]));
    expect(result.papers[0].markscheme?.path).toBe(row.markscheme);
  });

  it("allows question-only practice and refuses unreviewed metadata", async () => {
    const plan = await reviewed();
    const current = await scanPastPaperDirectory(root);
    const noScheme = { ...row, markscheme: undefined };
    expect(prepareBatch({ ...plan, papers: [noScheme] }, current, root).papers[0].markscheme).toBeUndefined();
    expect(() => prepareBatch({ ...plan, papers: [{ ...row, reviewed: false }] }, current, root)).toThrow("reviewed paper metadata");
  });

  it("rejects changed files and paths outside the scanned folder", async () => {
    const plan = await reviewed();
    await writeFile(join(root, row.question), "changed bytes");
    const current = await scanPastPaperDirectory(root);
    expect(() => prepareBatch(plan, current, root)).toThrow("missing or changed PDF");
    expect(() => prepareBatch({ ...plan, papers: [{ ...row, question: "../external.pdf" }] }, current, root)).toThrow("missing or changed PDF");
  });

  it("refuses duplicate paper identities even when syllabus labels differ", async () => {
    const plan = await reviewed();
    const current = await scanPastPaperDirectory(root);
    const repeated = { ...row, question: "Math/review-me.pdf", markscheme: undefined, syllabusVersion: "2024" };
    expect(() => prepareBatch({ ...plan, papers: [row, repeated] }, current, root)).toThrow("duplicate paper identity");
  });

  it("refuses assigning copies of the same bytes to separate identities", async () => {
    const plan = await reviewed();
    const current = await scanPastPaperDirectory(root);
    const a = { ...row, question: "Math/review-me.pdf", markscheme: undefined };
    const b = { ...a, question: "Math/copy.pdf", paper: "p1" };
    expect(() => prepareBatch({ ...plan, papers: [a, b] }, current, root)).toThrow("reused PDF or duplicate copy");
  });

  it.skipIf(process.platform === "win32")("does not follow symbolic links", async () => {
    await symlink(join(root, "Physics"), join(root, "alias"), "dir");
    await symlink(join(root, row.question), join(root, "alias.pdf"));
    expect((await scanPastPaperDirectory(root)).files).toHaveLength(4);
  });
});
