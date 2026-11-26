"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import type { Session } from "@supabase/supabase-js";
import { createLatestRequestScope } from "@/lib/auth/browser-request-scope";
import type {
  SourceCitation,
} from "@/types/study";

export function PrivateSourcePdf({
  source,
  configured,
  session,
}: {
  source: SourceCitation;
  configured: boolean;
  session: Session | null;
}) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [requests] = useState(createLatestRequestScope);
  const urlRef = useRef<string | null>(null);

  useEffect(() => () => {
    requests.cancel();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  }, [requests]);

  async function openSource() {
    if (!configured) {
      setStatus("Private source viewing is not configured.");
      return;
    }
    if (!session?.access_token) {
      setStatus("Sign in from the Progress panel to view private source pages.");
      return;
    }
    if (requests.pending()) return;

    const request = requests.begin();
    setLoading(true);
    setStatus("");

    try {
      const response = await fetch(
        "/api/source-pdf?questionId=" + encodeURIComponent(source.id),
        {
          headers: { Authorization: "Bearer " + session.access_token },
          cache: "no-store",
          signal: request.signal,
        },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? "Could not load the private source PDF.");
      }

      const blob = await response.blob();
      if (!requests.isCurrent(request)) return;
      const nextUrl = URL.createObjectURL(blob);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = nextUrl;
      setPdfUrl(nextUrl);
    } catch (error) {
      if (!requests.isCurrent(request)) return;
      setStatus(error instanceof Error ? error.message : "Could not load the private source PDF.");
    } finally {
      if (requests.finish(request)) setLoading(false);
    }
  }

  function closeSource() {
    requests.cancel();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    setPdfUrl(null);
    setStatus("");
    setLoading(false);
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
