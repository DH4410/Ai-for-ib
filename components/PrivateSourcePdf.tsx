"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  getBrowserSupabaseClient,
  isBrowserSupabaseConfigured,
} from "@/lib/database/supabase-browser";
import type {
  SourceCitation,
} from "@/types/study";

export function PrivateSourcePdf({
  source,
}: {
  source: SourceCitation;
}) {
  const [pdfUrl, setPdfUrl] =
    useState<string | null>(null);
  const [status, setStatus] =
    useState("");
  const [loading, setLoading] =
    useState(false);
  const client = useMemo(
    () => getBrowserSupabaseClient(),
    [],
  );

  useEffect(
    () => () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
    },
    [pdfUrl],
  );

  async function openSource() {
    if (
      !isBrowserSupabaseConfigured() ||
      !client
    ) {
      setStatus(
        "Private source viewing is not configured.",
      );
      return;
    }

    setLoading(true);
    setStatus("");

    try {
      const {
        data: { session },
      } = await client.auth.getSession();

      if (!session?.access_token) {
        setStatus(
          "Sign in from the Progress panel to view private source pages.",
        );
        return;
      }

      const response = await fetch(
        `/api/source-pdf?questionId=${encodeURIComponent(
          source.id,
        )}`,
        {
          headers: {
            Authorization:
              `Bearer ${session.access_token}`,
          },
        },
      );

      if (!response.ok) {
        const payload =
          (await response
            .json()
            .catch(() => ({}))) as {
            error?: string;
          };
        throw new Error(
          payload.error ??
            "Could not load the private source PDF.",
        );
      }

      const blob = await response.blob();
      const nextUrl =
        URL.createObjectURL(blob);

      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl);
      }
      setPdfUrl(nextUrl);
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Could not load the private source PDF.",
      );
    } finally {
      setLoading(false);
    }
  }

  function closeSource() {
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
    }
    setPdfUrl(null);
    setStatus("");
  }

  const page = source.pageStart ?? 1;
  const viewerUrl = pdfUrl
    ? `${pdfUrl}#page=${page}&zoom=page-width`
    : "";

  return (
    <>
      <button
        className="viewSourceButton"
        disabled={loading}
        onClick={openSource}
        type="button"
      >
        {loading ? "Loading…" : "View source"}
      </button>
      {status ? (
        <span className="sourceViewStatus">
          {status}
        </span>
      ) : null}
      {pdfUrl ? (
        <div
          aria-label="Private source PDF viewer"
          aria-modal="true"
          className="sourcePdfBackdrop"
          role="dialog"
        >
          <section className="sourcePdfModal">
            <header>
              <div>
                <span className="eyebrow">
                  Private source
                </span>
                <strong>
                  {source.title}
                </strong>
                <small>
                  {source.locator ??
                    `Page ${page}`}
                </small>
              </div>
              <div className="sourcePdfActions">
                <a
                  href={viewerUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open PDF
                </a>
                <button
                  onClick={closeSource}
                  type="button"
                >
                  Close
                </button>
              </div>
            </header>
            <iframe
              src={viewerUrl}
              title={`${source.title} source PDF`}
            />
            <footer>
              This viewer is for you to inspect
              the original page. The tutor still
              treats visual-dependent questions as
              unavailable until a verified vision
              path is added.
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
