import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";

import {
  parseEvaluationJsonl,
  scoreEvaluationResponse,
  type EvaluationCase,
  type MechanicalEvaluation,
} from "../training/evaluation";

type ModelConfig = {
  label: "baseline" | "candidate";
  baseUrl: string;
  model: string;
  apiKey: string;
};

type ModelCaseResult = {
  model: string;
  latencyMs: number;
  text: string;
  mechanical: MechanicalEvaluation;
};

type CaseReport = {
  id: string;
  subject: EvaluationCase["subject"];
  mode: EvaluationCase["mode"];
  baseline: ModelCaseResult;
  candidate: ModelCaseResult;
};

function usage(): string {
  return [
    "Usage:",
    "  npm run training:evaluate -- <private-benchmark-jsonl> [training/outputs/report.json]",
    "",
    "Required environment variables:",
    "  EVAL_BASE_URL, EVAL_BASE_MODEL",
    "  EVAL_CANDIDATE_URL, EVAL_CANDIDATE_MODEL",
    "",
    "Optional API keys:",
    "  EVAL_BASE_API_KEY, EVAL_CANDIDATE_API_KEY",
  ].join("\n");
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`missing environment variable: ${name}`);
  }
  return value;
}

function modelConfig(label: "baseline" | "candidate"): ModelConfig {
  const prefix = label === "baseline" ? "EVAL_BASE" : "EVAL_CANDIDATE";

  return {
    label,
    baseUrl: requiredEnvironment(`${prefix}_URL`).replace(/\/$/, ""),
    model: requiredEnvironment(`${prefix}_MODEL`),
    apiKey: process.env[`${prefix}_API_KEY`]?.trim() ?? "",
  };
}

function assertPrivateOutputPath(outputPath: string): string {
  const root = resolve(process.cwd(), "training", "outputs");
  const resolvedOutput = resolve(process.cwd(), outputPath);
  const fromRoot = relative(root, resolvedOutput);

  if (
    fromRoot.length === 0 ||
    fromRoot.startsWith("..") ||
    fromRoot.includes(":")
  ) {
    throw new Error("comparison output must be a file under training/outputs/");
  }

  return resolvedOutput;
}

async function generate(
  config: ModelConfig,
  evaluationCase: EvaluationCase,
): Promise<ModelCaseResult> {
  const startedAt = Date.now();
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      messages: evaluationCase.prompt,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `${config.label} model returned ${response.status}: ${body.slice(0, 300)}`,
    );
  }

  const payload = (await response.json()) as {
    model?: string;
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = payload.choices?.[0]?.message?.content?.trim();

  if (!text) {
    throw new Error(`${config.label} model returned an empty response`);
  }

  return {
    model: payload.model ?? config.model,
    latencyMs: Date.now() - startedAt,
    text,
    mechanical: scoreEvaluationResponse(text, evaluationCase.rubric),
  };
}

function average(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function aggregate(
  reports: CaseReport[],
  key: "baseline" | "candidate",
): Record<string, number> {
  const results = reports.map((report) => report[key]);

  return {
    averageConceptCoverage: average(
      results.map(({ mechanical }) => mechanical.conceptCoverage),
    ),
    guardrailPassRate:
      results.filter(({ mechanical }) => mechanical.guardrailsPassed).length /
      results.length,
    averageLatencyMs: average(results.map(({ latencyMs }) => latencyMs)),
  };
}

async function main(): Promise<void> {
  const benchmarkPath = process.argv[2];
  if (!benchmarkPath || benchmarkPath === "--help") {
    console.log(usage());
    if (!benchmarkPath) {
      process.exitCode = 1;
    }
    return;
  }

  const outputPath = assertPrivateOutputPath(
    process.argv[3] ?? "training/outputs/model-comparison.json",
  );
  const contents = await readFile(resolve(process.cwd(), benchmarkPath), "utf8");
  const cases = parseEvaluationJsonl(contents);
  const baseline = modelConfig("baseline");
  const candidate = modelConfig("candidate");

  const reports: CaseReport[] = [];
  for (const evaluationCase of cases) {
    const baselineResult = await generate(baseline, evaluationCase);
    const candidateResult = await generate(candidate, evaluationCase);

    reports.push({
      id: evaluationCase.id,
      subject: evaluationCase.subject,
      mode: evaluationCase.mode,
      baseline: baselineResult,
      candidate: candidateResult,
    });

    console.log(
      `completed ${reports.length}/${cases.length}: ${evaluationCase.id}`,
    );
  }

  const report = {
    generatedAt: new Date().toISOString(),
    datasetFile: basename(benchmarkPath),
    note:
      "Mechanical metrics are deterministic comparison aids, not a substitute for human correctness and pedagogy review.",
    summary: {
      baseline: aggregate(reports, "baseline"),
      candidate: aggregate(reports, "candidate"),
    },
    cases: reports,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`wrote private comparison report: ${relative(process.cwd(), outputPath)}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "model comparison failed");
  process.exitCode = 1;
});
