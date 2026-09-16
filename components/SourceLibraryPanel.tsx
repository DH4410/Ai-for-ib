"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Session } from "@supabase/supabase-js";

import {
  getBrowserSupabaseClient,
  isBrowserSupabaseConfigured,
} from "@/lib/database/supabase-browser";
import type { SafeStudySourceSummary } from "@/lib/sources/repository";
import type { Subject } from "@/types/study";

function sourceCountLabel(source: SafeStudySourceSummary): string {
  if (source.questionCount > 0) {
    const questions =
      `${source.questionCount} question${source.questionCount === 1 ? "" : "s"}`;
    return source.pairedQuestionCount > 0
      ? `${questions} · ${source.pairedQuestionCount} paired`
      : questions;
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
}: {
  subject: Subject;
}) {
  const configured = isBrowserSupabaseConfigured();
  const client = useMemo(
    () => getBrowserSupabaseClient(),
    [],
  );
  const [session, setSession] = useState<Session | null>(null);
  const [sources, setSources] = useState<SafeStudySourceSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const loadSources = useCallback(
    async (accessToken: string) => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/sources?subject=${encodeURIComponent(subject)}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            cache: "no-store",
          },
        );

        if (!response.ok) {
          throw new Error("Could not load sources.");
        }

        const payload = (await response.json()) as {
          sources?: SafeStudySourceSummary[];
        };
        setSources(payload.sources ?? []);
      } catch {
        setSources([]);
      } finally {
        setLoading(false);
      }
    },
    [subject],
  );

  useEffect(() => {
    if (!client) {
      return;
    }

    let active = true;
    void client.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session);
      }
    });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [client]);

  useEffect(() => {
    if (!session?.access_token) {
      setSources([]);
      return;
    }

    void loadSources(session.access_token);
  }, [loadSources, session?.access_token]);

  if (!configured || !client || !session) {
    return null;
  }

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
