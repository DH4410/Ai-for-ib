type Mechanical = {
  conceptCoverage?: number;
  guardrailsPassed?: boolean;
};

type ModelCase = {
  text?: string;
  mechanical?: Mechanical;
};

type ComparisonCase = {
  id?: string;
  subject?: string;
  mode?: string;
  classification?: string;
  reviewPriority?: string;
  prompt?: Array<{
    role?: string;
    content?: string;
  }>;
  rubric?: {
    requiredConceptGroups?: string[][];
    forbiddenPhrases?: string[];
    maxWords?: number;
    shouldAskLearnerQuestion?: boolean;
  };
  base?: ModelCase;
  adapter?: ModelCase;
};

export type AdapterComparisonReport = {
  baseModel?: string;
  adapter?: string;
  benchmarkCaseCount?: number;
  promotionGate?: {
    mechanicalPassed?: boolean;
    humanReviewRequired?: boolean;
    reasons?: string[];
  };
  summary?: unknown;
  manualReviewQueue?: string[];
  cases?: ComparisonCase[];
};

export function escapeHtml(
  value: unknown,
): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function promptHtml(
  prompt: ComparisonCase["prompt"],
): string {
  if (!Array.isArray(prompt)) {
    return "<p class=\"muted\">Prompt unavailable.</p>";
  }

  return prompt
    .map(
      ({ role, content }) =>
        `<div class="message"><b>${escapeHtml(
          role,
        )}</b><pre>${escapeHtml(content)}</pre></div>`,
    )
    .join("");
}

function rubricHtml(
  rubric: ComparisonCase["rubric"],
): string {
  if (!rubric) {
    return "<p class=\"muted\">Rubric unavailable.</p>";
  }

  const groups = (
    rubric.requiredConceptGroups ?? []
  )
    .map(
      (group) =>
        `<li>${escapeHtml(group.join(" / "))}</li>`,
    )
    .join("");
  const forbidden = (
    rubric.forbiddenPhrases ?? []
  )
    .map((value) => `<code>${escapeHtml(value)}</code>`)
    .join(" ");

  return [
    groups
      ? `<p><b>Required concepts</b></p><ul>${groups}</ul>`
      : "",
    forbidden
      ? `<p><b>Forbidden phrases</b> ${forbidden}</p>`
      : "",
    rubric.maxWords
      ? `<p><b>Max words</b> ${escapeHtml(
          rubric.maxWords,
        )}</p>`
      : "",
    `<p><b>Should ask learner question</b> ${rubric.shouldAskLearnerQuestion ? "yes" : "no"}</p>`,
  ].join("");
}

function modelPanel(
  label: string,
  result: ModelCase | undefined,
): string {
  const coverage =
    typeof result?.mechanical?.conceptCoverage ===
    "number"
      ? (
          result.mechanical.conceptCoverage * 100
        ).toFixed(0) + "%"
      : "n/a";
  const guardrails =
    result?.mechanical?.guardrailsPassed === true
      ? "pass"
      : result?.mechanical?.guardrailsPassed === false
        ? "fail"
        : "n/a";

  return `
    <section class="responsePanel">
      <div class="panelHeader">
        <h4>${escapeHtml(label)}</h4>
        <span>Concept ${coverage} · Guardrails ${guardrails}</span>
      </div>
      <pre>${escapeHtml(result?.text)}</pre>
    </section>
  `;
}

function choiceGroup(
  caseId: string,
  field: string,
  label: string,
): string {
  return `
    <fieldset>
      <legend>${escapeHtml(label)}</legend>
      ${["base", "adapter", "tie"].map(
        (choice) => `
          <label>
            <input
              type="radio"
              name="${escapeHtml(caseId)}-${escapeHtml(field)}"
              value="${choice}"
              data-case="${escapeHtml(caseId)}"
              data-field="${escapeHtml(field)}"
            />
            ${choice === "base" ? "Base better" : choice === "adapter" ? "Adapter better" : "Tie"}
          </label>
        `,
      ).join("")}
    </fieldset>
  `;
}

function caseHtml(
  comparisonCase: ComparisonCase,
): string {
  const id = comparisonCase.id ?? "unknown-case";
  const classification =
    comparisonCase.classification ?? "unknown";
  const priority =
    comparisonCase.reviewPriority ?? "standard";

  return `
    <article class="caseCard" id="case-${escapeHtml(id)}">
      <header>
        <div>
          <span class="priority ${escapeHtml(priority)}">${escapeHtml(priority)}</span>
          <span class="classification ${escapeHtml(classification)}">${escapeHtml(classification)}</span>
        </div>
        <h2>${escapeHtml(id)}</h2>
        <p>${escapeHtml(comparisonCase.subject)} · ${escapeHtml(comparisonCase.mode)}</p>
      </header>

      <details open>
        <summary>Prompt and rubric</summary>
        <div class="promptGrid">
          <section>
            <h3>Prompt</h3>
            ${promptHtml(comparisonCase.prompt)}
          </section>
          <section>
            <h3>Rubric</h3>
            ${rubricHtml(comparisonCase.rubric)}
          </section>
        </div>
      </details>

      <div class="responseGrid">
        ${modelPanel("Base", comparisonCase.base)}
        ${modelPanel("Adapter", comparisonCase.adapter)}
      </div>

      <section class="humanReview">
        <h3>Human review</h3>
        <div class="reviewGrid">
          ${choiceGroup(id, "correctness", "Correctness")}
          ${choiceGroup(id, "pedagogy", "Pedagogy")}
          ${choiceGroup(id, "ibRelevance", "IB relevance")}
          ${choiceGroup(id, "overall", "Overall preference")}
        </div>
        <label class="notes">
          Notes
          <textarea
            rows="4"
            data-case="${escapeHtml(id)}"
            data-field="notes"
            placeholder="What improved, regressed, or needs fixing?"
          ></textarea>
        </label>
      </section>
    </article>
  `;
}

export function renderAdapterReviewHtml(
  report: AdapterComparisonReport,
): string {
  const byId = new Map(
    (report.cases ?? []).map((item) => [
      item.id,
      item,
    ]),
  );
  const orderedCases = [
    ...(report.manualReviewQueue ?? [])
      .map((id) => byId.get(id))
      .filter(
        (value): value is ComparisonCase =>
          Boolean(value),
      ),
    ...(report.cases ?? []).filter(
      (item) =>
        !(report.manualReviewQueue ?? []).includes(
          item.id ?? "",
        ),
    ),
  ];

  const gate = report.promotionGate;
  const gateText = gate?.mechanicalPassed
    ? "Mechanical gate passed — human review still required"
    : "Mechanical gate not passed";
  const reasons = (gate?.reasons ?? [])
    .map((reason) => `<li>${escapeHtml(reason)}</li>`)
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>AI for IB · Adapter Review</title>
<style>
:root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
body { margin: 0; background: #0c1016; color: #e7edf5; }
main { width: min(1180px, calc(100% - 32px)); margin: 32px auto 80px; }
h1,h2,h3,h4,p { margin-top: 0; }
.top { padding: 24px; border: 1px solid #273140; border-radius: 16px; background: #111722; margin-bottom: 20px; }
.top code { color: #b9c9dc; }
.gate { display: inline-block; border: 1px solid #48634f; border-radius: 999px; padding: 5px 9px; font-size: 12px; }
.caseCard { border: 1px solid #273140; border-radius: 16px; background: #111722; padding: 20px; margin: 18px 0; }
.caseCard header { border-bottom: 1px solid #222c39; margin-bottom: 16px; padding-bottom: 12px; }
.priority,.classification { display: inline-block; border: 1px solid #38465a; border-radius: 999px; padding: 4px 7px; margin-right: 6px; font-size: 11px; text-transform: uppercase; }
.priority.high,.classification.regression { border-color: #7f4444; color: #f0aaaa; }
.classification.improvement { border-color: #3e6b50; color: #9fd1ae; }
.promptGrid,.responseGrid,.reviewGrid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 14px; }
.promptGrid { margin: 12px 0 18px; }
.responsePanel { border: 1px solid #263140; background: #0d131d; border-radius: 12px; padding: 14px; min-width: 0; }
.panelHeader { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; color: #9aa9bb; font-size: 12px; }
pre { white-space: pre-wrap; overflow-wrap: anywhere; font: inherit; line-height: 1.55; color: #dce5ef; }
.message { border-left: 2px solid #34445a; padding-left: 10px; margin: 10px 0; }
.message b { color: #8fa9c6; text-transform: uppercase; font-size: 10px; }
details { border: 1px solid #222c39; border-radius: 12px; padding: 12px; margin-bottom: 14px; }
summary { cursor: pointer; color: #aebfd2; }
.humanReview { margin-top: 18px; border-top: 1px solid #222c39; padding-top: 16px; }
fieldset { border: 1px solid #293544; border-radius: 10px; display: grid; gap: 7px; }
fieldset label { font-size: 13px; color: #b9c5d4; }
.notes { display: grid; gap: 6px; margin-top: 12px; color: #b9c5d4; }
textarea { width: 100%; box-sizing: border-box; background: #0b1119; color: #e7edf5; border: 1px solid #2d3a4b; border-radius: 9px; padding: 10px; }
.actions { position: sticky; bottom: 14px; display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }
button { border: 1px solid #3a4d63; background: #182233; color: #e7edf5; border-radius: 9px; padding: 10px 14px; cursor: pointer; }
.muted { color: #7f8da0; }
@media (max-width: 800px) { .promptGrid,.responseGrid,.reviewGrid { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<main>
<section class="top">
  <h1>AI for IB · Adapter human review</h1>
  <p><b>Base:</b> <code>${escapeHtml(report.baseModel)}</code></p>
  <p><b>Adapter:</b> <code>${escapeHtml(report.adapter)}</code></p>
  <p><b>Cases:</b> ${escapeHtml(report.benchmarkCaseCount ?? orderedCases.length)}</p>
  <span class="gate">${escapeHtml(gateText)}</span>
  ${reasons ? `<ul>${reasons}</ul>` : ""}
  <p class="muted">Mechanical metrics only prioritize review. Correctness, pedagogy and IB suitability require human judgment.</p>
</section>

${orderedCases.map(caseHtml).join("\n")}

<div class="actions">
  <button id="clearReview" type="button">Clear saved review</button>
  <button id="exportReview" type="button">Export review JSON</button>
</div>
</main>
<script>
const STORAGE_KEY = "ai-for-ib-adapter-review";
let review = {};
try { review = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { review = {}; }

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(review));
}
function setValue(caseId, field, value) {
  review[caseId] = review[caseId] || {};
  review[caseId][field] = value;
  save();
}
document.querySelectorAll("[data-case][data-field]").forEach((input) => {
  const caseId = input.dataset.case;
  const field = input.dataset.field;
  const saved = review?.[caseId]?.[field];
  if (input.type === "radio") {
    input.checked = saved === input.value;
    input.addEventListener("change", () => {
      if (input.checked) setValue(caseId, field, input.value);
    });
  } else {
    input.value = saved || "";
    input.addEventListener("input", () => setValue(caseId, field, input.value));
  }
});
document.getElementById("clearReview").addEventListener("click", () => {
  if (!confirm("Clear all locally saved review choices?")) return;
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
});
document.getElementById("exportReview").addEventListener("click", () => {
  const payload = {
    exportedAt: new Date().toISOString(),
    baseModel: ${JSON.stringify(report.baseModel ?? "")},
    adapter: ${JSON.stringify(report.adapter ?? "")},
    review,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "adapter-human-review.json";
  link.click();
  URL.revokeObjectURL(url);
});
</script>
</body>
</html>`;
}
