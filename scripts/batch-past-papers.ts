import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { resolveServerDatabaseKey } from "../lib/database/server-key";
import { verifyLocalFileHandoff } from "../lib/ingestion/handoff";
import {
  prepareBatch,
  scanPastPaperDirectory,
  summarizeInventory,
  summarizeReviewCandidates,
} from "../lib/past-papers/batch-import";

const usage = [
  "npm run paper:batch -- scan <local-folder>",
  "npm run paper:batch -- check <local-folder>",
  "npm run paper:batch -- apply <local-folder>",
  "Scan writes private-index/paper-batch.json with filename-only candidates; review and fill its papers array.",
  "Check is a dry run. Apply writes to the configured private database.",
].join("\n");

async function main(): Promise<void> {
  const [command, root, ...extra] = process.argv.slice(2);
  if (command === "--help") { console.log(usage); return; }
  if (!root || extra.length || !["scan", "check", "apply"].includes(command)) {
    console.log(usage);
    process.exitCode = 1;
    return;
  }

  const inventory = await scanPastPaperDirectory(root);
  const reviewPath = resolve("private-index", "paper-batch.json");
  if (command === "scan") {
    await mkdir(resolve("private-index"), { recursive: true });
    // Never overwrite a completed review automatically.
    await writeFile(reviewPath, JSON.stringify(inventory, null, 2) + "\n", { flag: "wx" });
    console.log(JSON.stringify({ status: "scanned", ...summarizeInventory(inventory), ...summarizeReviewCandidates(inventory) }, null, 2));
    return;
  }

  const raw: unknown = JSON.parse(await readFile(reviewPath, "utf8"));
  const batch = prepareBatch(raw, inventory, root);
  const summary = {
    ...summarizeInventory(inventory),
    reviewedPaperCount: batch.papers.length,
    pairedPaperCount: batch.papers.filter((paper) => paper.markscheme).length,
    questionOnlyPaperCount: batch.papers.filter((paper) => !paper.markscheme).length,
    unassignedPdfCount: batch.unassignedPdfCount,
  };
  console.log(JSON.stringify({ status: "checked", ...summary }, null, 2));
  if (command === "check") return;

  if (!process.env.SUPABASE_URL?.trim() || !resolveServerDatabaseKey(process.env).key) {
    throw new Error("configure the dedicated private Supabase project before applying");
  }

  let completed = 0;
  for (const paper of batch.papers) {
    // Recheck the selected inputs just before the single-paper loader runs.
    await verifyLocalFileHandoff(resolve(root, paper.question.path), paper.question);
    if (paper.markscheme) {
      await verifyLocalFileHandoff(resolve(root, paper.markscheme.path), paper.markscheme);
    }
    const child = spawnSync(process.execPath, [
      "--import", "tsx", resolve("scripts/index-past-paper.ts"), ...paper.args,
    ], { shell: false, stdio: "ignore" });
    if (child.error || child.status !== 0) {
      console.error(JSON.stringify({ status: "stopped", completed, failedRow: completed + 1 }));
      process.exitCode = 2;
      return;
    }
    completed += 1;
    console.log(JSON.stringify({ status: "indexed", completed, total: batch.papers.length }));
  }
  console.log(JSON.stringify({ status: "complete", completed }));
}

main().catch(() => {
  // Do not echo local paths, JSON parser snippets, or upstream credentials.
  console.error("Batch operation failed. Check the local folder, review file, and private database configuration. Scan will not overwrite an existing review.");
  process.exitCode = 1;
});
