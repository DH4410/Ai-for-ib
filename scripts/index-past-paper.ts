import {
  mkdir,
  writeFile,
} from "node:fs/promises";
import {
  basename,
  resolve,
} from "node:path";

import { createClient } from "@supabase/supabase-js";

import {
  assessExtractedPage,
} from "../lib/ingestion/chunks";
import { materializeLocalSource } from "../lib/ingestion/materialize";
import { extractPdfPages } from "../lib/ingestion/pdf";
import type { ExtractedPageInput } from "../lib/ingestion/types";
import type {
  PaperLevel,
  PaperSession,
  PastPaperDocument,
} from "../lib/past-papers/metadata";
import {
  buildPastPaperQuestionRecords,
} from "../lib/past-papers/records";
import {
  SupabasePastPaperIndexRepository,
  type PastPaperVersionMetadata,
} from "../lib/past-papers/repository";
import {
  readManifestEvents,
} from "../lib/study-source/manifest";
import type {
  ManifestEvent,
  SourceDocument,
  SourceProvider,
} from "../lib/study-source/types";
import type { Subject } from "../types/study";

type CliArguments = {
  language: string;
  level: PaperLevel;
  markschemePath?: string;
  paper: string;
  provider: SourceProvider;
  questionPath: string;
  session: PaperSession;
  subject: Subject;
  syllabusVersion: string;
  timezone: string;
  year: number;
};

type MaterializedEvent = Extract<
  ManifestEvent,
  { eventType: "materialized" }
>;

const SUBJECTS: Subject[] = [
  "physics",
  "chemistry",
  "mathematics",
];
const PROVIDERS: SourceProvider[] = [
  "manual",
  "ibdocs",
  "managebac",
];

function usage(): string {
  return [
    "Usage:",
    "  npm run paper:index -- --question <local-question.pdf> --subject <physics|chemistry|mathematics> --year <YYYY> --session <may|november> --timezone <TZ> --level <HL|SL> --paper <p1a|p1b|p1|p2|p3> [options]",
    "",
    "Options:",
    "  --markscheme <local-markscheme.pdf>",
    "  --language English",
    "  --syllabus-version 2025",
    "  --provider manual|ibdocs|managebac",
    "",
    "The command uses only authorized local PDFs, copies them into ignored private-sources/, extracts structured questions, and indexes them through the private Supabase server RPC.",
  ].join("\n");
}

function requireValue(
  values: Map<string, string>,
  key: string,
): string {
  const value = values.get(key)?.trim();
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
}

function readCliArguments(args: string[]): CliArguments {
  const values = new Map<string, string>();

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("--")) {
      throw new Error(`unexpected argument: ${argument}`);
    }

    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`missing value for ${argument}`);
    }

    values.set(argument, value);
    index += 1;
  }

  const subject = requireValue(values, "--subject") as Subject;
  if (!SUBJECTS.includes(subject)) {
    throw new Error(
      "--subject must be physics, chemistry, or mathematics",
    );
  }

  const year = Number(requireValue(values, "--year"));
  if (
    !Number.isSafeInteger(year) ||
    year < 2000 ||
    year > 2100
  ) {
    throw new Error("--year must be a four-digit IB paper year");
  }

  const session = requireValue(
    values,
    "--session",
  ).toLocaleLowerCase() as PaperSession;
  if (!["may", "november"].includes(session)) {
    throw new Error("--session must be may or november");
  }

  const timezone = requireValue(
    values,
    "--timezone",
  ).toLocaleUpperCase();
  if (!/^[A-Z0-9-]{1,16}$/.test(timezone)) {
    throw new Error("--timezone must be a short identifier such as TZ2");
  }

  const level = requireValue(
    values,
    "--level",
  ).toLocaleUpperCase() as PaperLevel;
  if (!["HL", "SL"].includes(level)) {
    throw new Error("--level must be HL or SL");
  }

  const paper = requireValue(
    values,
    "--paper",
  ).toLocaleLowerCase();
  if (!/^p(?:1a|1b|[123])$/.test(paper)) {
    throw new Error(
      "--paper must be p1a, p1b, p1, p2, or p3",
    );
  }

  const provider = (
    values.get("--provider")?.toLocaleLowerCase() ??
    "manual"
  ) as SourceProvider;
  if (!PROVIDERS.includes(provider)) {
    throw new Error(
      "--provider must be manual, ibdocs, or managebac",
    );
  }

  const language =
    values.get("--language")?.trim() ?? "English";
  if (!language || language.length > 80) {
    throw new Error("--language must be a short language label");
  }

  const syllabusVersion =
    values.get("--syllabus-version")?.trim() ?? "2025";
  if (!/^[0-9A-Za-z._-]{1,32}$/.test(syllabusVersion)) {
    throw new Error("--syllabus-version is invalid");
  }

  return {
    language,
    level,
    markschemePath: values.get("--markscheme"),
    paper,
    provider,
    questionPath: requireValue(values, "--question"),
    session,
    subject,
    syllabusVersion,
    timezone,
    year,
  };
}

function stablePaperId(
  args: CliArguments,
  kind: "qp" | "ms",
): string {
  const year = String(args.year).slice(-2);
  const session = args.session === "may" ? "m" : "n";
  const language =
    args.language.toLocaleLowerCase() === "english"
      ? ""
      : `-${args.language
          .toLocaleLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")}`;

  return [
    args.subject,
    `${session}${year}`,
    args.level.toLocaleLowerCase(),
    args.timezone.toLocaleLowerCase(),
    args.paper,
  ].join("-") + language + `-${kind}`;
}

function createSource(
  args: CliArguments,
  kind: "question-paper" | "markscheme",
  inputPath: string,
): SourceDocument {
  const suffix = kind === "question-paper" ? "qp" : "ms";
  const id = stablePaperId(args, suffix);

  return {
    author: null,
    copyrightStatus: "private-licensed",
    documentType: kind,
    filename: basename(inputPath),
    id,
    publisher: null,
    sourceProvider: args.provider,
    sourceReference: `authorized-local/${id}`,
    subject: args.subject,
    title: [
      args.subject[0].toLocaleUpperCase() +
        args.subject.slice(1),
      args.session === "may" ? "May" : "November",
      String(args.year),
      args.level,
      args.timezone,
      args.paper.toLocaleUpperCase(),
      kind === "markscheme" ? "Markscheme" : "Question Paper",
    ].join(" "),
    usefulForKnowledgeBase: true,
  };
}

function createPaperDocument(
  args: CliArguments,
  source: SourceDocument,
  kind: "question-paper" | "markscheme",
): PastPaperDocument {
  return {
    documentKind: kind,
    id: source.id,
    language: args.language,
    level: args.level,
    paper: args.paper,
    session: args.session,
    subject: args.subject,
    syllabusVersion: args.syllabusVersion,
    timezone: args.timezone,
    year: args.year,
  };
}

function materializedEvent(
  events: ManifestEvent[],
  checksumSha256: string,
): MaterializedEvent {
  const event = [...events].reverse().find(
    (candidate): candidate is MaterializedEvent =>
      candidate.eventType === "materialized" &&
      candidate.checksumSha256 === checksumSha256,
  );

  if (!event) {
    throw new Error(
      "the materialized source version could not be found in the local manifest",
    );
  }

  return event;
}

function versionMetadata(
  event: MaterializedEvent,
): PastPaperVersionMetadata {
  return {
    acquiredAt: event.occurredAt,
    byteCount: event.byteCount,
    checksumSha256: event.checksumSha256,
    mimeType: event.mimeType,
    storagePath: event.localRelativePath,
  };
}

async function usablePages(
  privateSourcesRoot: string,
  relativePath: string,
): Promise<{
  pages: ExtractedPageInput[];
  ocrRequiredPageCount: number;
}> {
  const extracted = await extractPdfPages(
    resolve(privateSourcesRoot, relativePath),
  );
  const assessed = extracted.map(assessExtractedPage);

  return {
    ocrRequiredPageCount: assessed.filter(
      ({ extractionMethod }) =>
        extractionMethod === "ocr_required",
    ).length,
    pages: assessed
      .filter(
        ({ extractionMethod }) =>
          extractionMethod === "text",
      )
      .map(({ pageNumber, text }) => ({
        pageNumber,
        text,
      })),
  };
}

function serverKey(): string {
  const value =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!value) {
    throw new Error(
      "set SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY)",
    );
  }
  return value;
}

async function main(): Promise<void> {
  if (process.argv.includes("--help")) {
    console.log(usage());
    return;
  }

  const args = readCliArguments(process.argv.slice(2));
  const root = process.cwd();
  const manifestPath = resolve(
    root,
    "data",
    "source-manifest.jsonl",
  );
  const privateSourcesRoot = resolve(
    root,
    "private-sources",
  );
  const questionSource = createSource(
    args,
    "question-paper",
    args.questionPath,
  );
  const questionMaterialized = await materializeLocalSource({
    inputPath: args.questionPath,
    manifestPath,
    privateSourcesRoot,
    source: questionSource,
  });
  const questionPages = await usablePages(
    privateSourcesRoot,
    questionMaterialized.relativePath,
  );

  let markschemeSource: SourceDocument | undefined;
  let markschemeMaterialized:
    | Awaited<ReturnType<typeof materializeLocalSource>>
    | undefined;
  let markschemePages:
    | Awaited<ReturnType<typeof usablePages>>
    | undefined;

  if (args.markschemePath) {
    markschemeSource = createSource(
      args,
      "markscheme",
      args.markschemePath,
    );
    markschemeMaterialized =
      await materializeLocalSource({
        inputPath: args.markschemePath,
        manifestPath,
        privateSourcesRoot,
        source: markschemeSource,
      });
    markschemePages = await usablePages(
      privateSourcesRoot,
      markschemeMaterialized.relativePath,
    );
  }

  const questionDocument = createPaperDocument(
    args,
    questionSource,
    "question-paper",
  );
  const markschemeDocument = markschemeSource
    ? createPaperDocument(
        args,
        markschemeSource,
        "markscheme",
      )
    : undefined;
  const structured = buildPastPaperQuestionRecords({
    markschemeDocument,
    markschemePages: markschemePages?.pages,
    questionDocument,
    questionPages: questionPages.pages,
  });

  if (structured.questions.length === 0) {
    throw new Error(
      "no unambiguous question candidates were extracted; inspect the PDF/OCR state before indexing",
    );
  }

  const manifestEvents = await readManifestEvents(manifestPath);
  const questionEvent = materializedEvent(
    manifestEvents,
    questionMaterialized.checksumSha256,
  );
  const markschemeEvent = markschemeMaterialized
    ? materializedEvent(
        manifestEvents,
        markschemeMaterialized.checksumSha256,
      )
    : undefined;

  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  if (!supabaseUrl) {
    throw new Error("set SUPABASE_URL");
  }

  const client = createClient(
    supabaseUrl,
    serverKey(),
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
  const repository =
    new SupabasePastPaperIndexRepository(client);
  const result = await repository.replacePaper({
    markschemeDocument,
    markschemeSource,
    markschemeVersion: markschemeEvent
      ? versionMetadata(markschemeEvent)
      : undefined,
    questionDocument,
    questions: structured.questions,
    questionSource,
    questionVersion: versionMetadata(questionEvent),
  });

  const report = {
    markschemeOcrRequiredPageCount:
      markschemePages?.ocrRequiredPageCount ?? 0,
    pairedQuestionCount: result.pairedQuestionCount,
    questionCount: result.questionCount,
    questionOcrRequiredPageCount:
      questionPages.ocrRequiredPageCount,
    skippedAmbiguousQuestionCount:
      structured.skippedAmbiguousQuestionIds.length,
    sourceId: questionSource.id,
    unmatchedMarkschemeCandidateCount:
      structured.unmatchedMarkschemeCandidateIds.length,
  };
  const reportRoot = resolve(
    root,
    "data",
    "ingestion-reports",
    "past-papers",
  );
  await mkdir(reportRoot, { recursive: true });
  await writeFile(
    resolve(
      reportRoot,
      `${questionSource.id}--${questionMaterialized.checksumSha256}.json`,
    ),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        ...report,
        questionChecksumSha256:
          questionMaterialized.checksumSha256,
        status: "indexed",
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "past-paper indexing failed",
  );
  process.exitCode = 1;
});
