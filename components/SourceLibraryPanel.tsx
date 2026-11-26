"use client";

import {
  useEffect,
  useState,
} from "react";
import type { Session } from "@supabase/supabase-js";

import { createLatestRequestScope } from "@/lib/auth/browser-request-scope";
import type { SafeStudySourceSummary } from "@/lib/sources/repository";
import type { Subject } from "@/types/study";

function sourceCountLabel(source: SafeStudySourceSummary): string {
  if (source.questionCount > 0) {
    const questions =
      `${source.questionCount} question${source.questionCount === 1 ? "" : "s"}`;
    const paired =
      source.pairedQuestionCount > 0
        ? ` · ${source.pairedQuestionCount} paired`
        : "";
    const visual =
      source.visualDependentQuestionCount > 0
        ? ` · ${source.visualDependentQuestionCount} requiring visual context`
        : "";
    return questions + paired + visual;
  }
  if (source.chunkCount > 0) {
    const chunks =
      `${source.chunkCount} chunk${source.chunkCount === 1 ? "" : "s"}`;
    const classified =
      source.classifiedChunkCount > 0
        ? ` · ${source.classifiedChunkCount} trusted-topic`
        : "";
    const ocr =
      source.ocrRequiredPageCount > 0
        ? ` · ${source.ocrRequiredPageCount} OCR`
        : "";
    return chunks + classified + ocr;
  }
  return "Indexed metadata";
}

function documentTypeLabel(source: SafeStudySourceSummary): string {
  switch (source.documentType) {
    case "question-paper":
      return "Paper";
    case "markscheme":
      return "Markscheme";
    case "study-guide":
      return "Study guide";
    default:
      return source.documentType
        .split("-")
        .map((part) => part[0]?.toUpperCase() + part.slice(1))
        .join(" ");
  }
}

export function SourceLibraryPanel({
  subject,
  session,
}: {
  subject: Subject;
  session: Session | null;
}) {
  const [requests] = useState(createLatestRequestScope);
  const [sources, setSources] = useState<SafeStudySourceSummary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const accessToken = session?.access_token;
    if (!accessToken) {
      setSources([]);
      setLoading(false);
      return;
    }

    const request = requests.begin();
    setLoading(true);
    async function loadSources() {
      try {
        const response = await fetch(
          "/api/sources?subject=" + encodeURIComponent(subject),
          {
            headers: { Authorization: "Bearer " + accessToken },
            cache: "no-store",
            signal: request.signal,
          },
        );
        if (!response.ok) throw new Error("Could not load sources.");
        const payload = (await response.json()) as {
          sources?: SafeStudySourceSummary[];
        };
        if (requests.isCurrent(request)) setSources(payload.sources ?? []);
      } catch {
        if (requests.isCurrent(request)) setSources([]);
      } finally {
        if (requests.finish(request)) setLoading(false);
      }
    }

    void loadSources();
    return () => requests.cancel();
  }, [requests, subject, session?.access_token]);

  if (!session) return null;

  return (
    <section className="sourceLibraryPanel">
      <div className="sourceLibraryHeader">
        <span className="eyebrow">Source library</span>
        <b>{sources.length}</b>
      </div>

      {loading ? (
        <p className="sourceLibraryHint">Loading sources…</p>
      ) : sources.length === 0 ? (
        <p className="sourceLibraryHint">
          No indexed {subject} sources yet.
        </p>
      ) : (
        <div className="sourceLibraryList">
          {sources.slice(0, 5).map((source) => (
            <div
              className="sourceLibraryItem"
              key={source.sourceId}
              title={source.title}
            >
              <div>
                <strong>{source.title}</strong>
                <span>
                  {documentTypeLabel(source)}
                  {" · "}
                  {sourceCountLabel(source)}
                </span>
              </div>
              {source.versionCount > 1 ? (
                <b>{source.versionCount}v</b>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
