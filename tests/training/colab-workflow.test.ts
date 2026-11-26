import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("Colab training workflow", () => {
  it("keeps SFT validation separate from the rubric benchmark", async () => {
    const [trainer, benchmarker, notebookText] =
      await Promise.all([
        readFile("training/colab_train.py", "utf8"),
        readFile("training/benchmark_models.py", "utf8"),
        readFile(
          "training/AI_for_IB_Colab.ipynb",
          "utf8",
        ),
      ]);

    expect(trainer).toContain("--validation");
    expect(trainer).not.toContain(
      'add_argument("--eval"',
    );
    expect(benchmarker).toContain("--benchmark");
    expect(benchmarker).not.toContain(
      'add_argument("--eval"',
    );

    expect(notebookText).toContain(
      "VALIDATION_JSONL",
    );
    expect(notebookText).toContain(
      "BENCHMARK_JSONL",
    );
    expect(notebookText).toContain(
      "training:validate-benchmark",
    );
    expect(notebookText).toContain(
      "benchmark.example.jsonl",
    );
    expect(notebookText).not.toContain(
      "eval.jsonl",
    );
    expect(notebookText).not.toContain(
      "--eval",
    );
  });

  it("contains every required Colab stage without embedded private credentials", async () => {
    const raw = await readFile(
      "training/AI_for_IB_Colab.ipynb",
      "utf8",
    );
    const notebook = JSON.parse(raw) as {
      cells?: Array<{ source?: string[] }>;
    };
    const content = (notebook.cells ?? [])
      .flatMap(({ source }) => source ?? [])
      .join("");

    for (const required of [
      "colab_preflight.py",
      "benchmark_models.py",
      "training:validate",
      "training:audit-split",
      "training:plan",
      "colab_train.py",
      "smoke_adapter.py",
    ]) {
      expect(content).toContain(required);
    }

    expect(content).not.toContain(
      "SUPABASE_SECRET_KEY=",
    );
    expect(content).not.toContain(
      "MANAGEBAC_PASSWORD=",
    );
    expect(content).not.toMatch(
      /hf_[A-Za-z0-9]{20,}/,
    );
  });
  it("includes validation in the blocking split audit and runs the quality audit", async () => {
    const raw = await readFile("training/AI_for_IB_Colab.ipynb", "utf8");
    const notebook = JSON.parse(raw) as { cells: Array<{ source: string[] }> };
    const auditCell = notebook.cells.map((c) => c.source.join("")).find((c) => c.includes("training:audit-split"));
    expect(auditCell).toContain("audit_cmd += ['--validation', VALIDATION_JSONL]");
    expect(auditCell).toContain("subprocess.run(audit_cmd, check=True)");
    expect(auditCell).toContain("training:audit-quality");
  });

});
