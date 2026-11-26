import { mkdtemp, mkdir, rm, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  prepareBatch,
  scanPastPaperDirectory,
  summarizeInventory,
  summarizeReviewCandidates,
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
  it("suggests a filename-only match without marking the pair as reviewed", async () => {
    const inventory = await scanPastPaperDirectory(root);
    expect(inventory.candidates).toEqual([
      expect.objectContaining({
        questionPaths: [row.question],
        markschemePaths: [row.markscheme],
        status: "possible_pair",
      }),
    ]);
    expect(inventory.papers).toEqual([]);
    expect(summarizeReviewCandidates(inventory)).toEqual({
      possiblePairCount: 1, ambiguousCandidateCount: 0, noSchemeHintCount: 0, pdfsWithoutCandidateCount: 2,
    });
    expect(() => prepareBatch(inventory, inventory, root)).toThrow("add at least one reviewed paper");
  });

  it("keeps duplicate scheme candidates ambiguous and distinguishes math courses", async () => {
    await writeFile(join(root, "Physics", "physics_m25_hl_tz2_p2_ms_2.pdf"), "alternative scheme bytes");
    await writeFile(join(root, "Math", "math_aa_m25_hl_tz2_p2_qp.pdf"), "aa question bytes");
    await writeFile(join(root, "Math", "math_ai_m25_hl_tz2_p2_ms.pdf"), "ai scheme bytes");
    const inventory = await scanPastPaperDirectory(root);
    expect(inventory.candidates.find((c) => c.hints.subject === "physics")?.status).toBe("ambiguous");
    const math = inventory.candidates.find((c) => c.hints.subject === "mathematics");
    expect(math?.status).toBe("no_scheme_hint");
    expect(math?.markschemePaths).toEqual([]);
  });

  it("does not treat exact copies as distinct competing schemes", async () => {
    await writeFile(join(root, "Physics", "physics_m25_hl_tz2_p2_ms_copy.pdf"), "synthetic scheme bytes");
    const inventory = await scanPastPaperDirectory(root);
    expect(inventory.candidates[0].markschemePaths).toHaveLength(1);
    expect(inventory.candidates[0].status).toBe("possible_pair");
  });

  it("withholds a copied PDF when its filenames imply conflicting identities", async () => {
    await writeFile(join(root, "Physics", "physics_m24_hl_tz2_p2_ms.pdf"), "synthetic scheme bytes");
    const inventory = await scanPastPaperDirectory(root);
    expect(inventory.candidates[0].status).toBe("no_scheme_hint");
  });

  it("does not pair files with different explicit languages or unknown math courses", async () => {
    await writeFile(join(root, "Physics", "physics_m26_hl_tz2_p2_qp_English.pdf"), "English paper bytes");
    await writeFile(join(root, "Physics", "physics_m26_hl_tz2_p2_ms_French.pdf"), "French scheme bytes");
    await writeFile(join(root, "Math", "math_m25_hl_tz2_p2_qp.pdf"), "unknown math course");
    const inventory = await scanPastPaperDirectory(root);
    expect(inventory.candidates.find((c) => c.hints.year === 2026)?.status).toBe("no_scheme_hint");
    expect(inventory.candidates.some((c) => c.hints.subject === "mathematics")).toBe(false);
  });

});
