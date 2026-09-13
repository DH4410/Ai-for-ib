"use client";

import { FormEvent, useMemo, useState } from "react";

import {
  getBrowserSupabaseClient,
  isBrowserSupabaseConfigured,
} from "@/lib/database/supabase-browser";
import type {
  SourceCitation,
  Subject,
} from "@/types/study";

export function RecordResult({
  source,
  subject,
}: {
  source: SourceCitation;
  subject: Subject;
}) {
  const topicId = source.topicIds?.[0];
  const [expanded, setExpanded] = useState(false);
  const [score, setScore] = useState("");
  const [maximumMarks, setMaximumMarks] = useState(
    source.marks?.toString() ?? "",
  );
  const [hintsUsed, setHintsUsed] = useState("0");
  const [confidence, setConfidence] = useState("");
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const configured = isBrowserSupabaseConfigured();
  const client = useMemo(
    () => getBrowserSupabaseClient(),
    [],
  );

  if (!topicId) {
    return null;
  }

  async function saveResult(event: FormEvent) {
    event.preventDefault();

    if (!configured || !client) {
      setStatus("Progress sync is not configured yet.");
      return;
    }

    const {
      data: { session },
    } = await client.auth.getSession();

    if (!session?.access_token) {
      setStatus("Sign in from the Progress panel first.");
      return;
    }

    setSaving(true);
    setStatus("");

    try {
      const response = await fetch("/api/progress", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          confidence: confidence
            ? Number(confidence)
            : undefined,
          hintsUsed: Number(hintsUsed),
          maximumMarks: Number(maximumMarks),
          pastPaperQuestionId:
            source.documentType === "question-paper"
              ? source.id
              : undefined,
          score: Number(score),
          subject,
          topicId,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(
          payload.error ?? "Could not save progress.",
        );
      }

      setStatus("Saved to mastery.");
      setExpanded(false);
      window.dispatchEvent(
        new CustomEvent("ib-progress-updated"),
      );
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Could not save progress.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!expanded) {
    return (
      <div className="recordResultCollapsed">
        <button
          onClick={() => setExpanded(true)}
          type="button"
        >
          Record result
        </button>
        {status ? <span>{status}</span> : null}
      </div>
    );
  }

  return (
    <form className="recordResult" onSubmit={saveResult}>
      <div className="recordResultFields">
        <label>
          <span>Score</span>
          <input
            min="0"
            onChange={(event) =>
              setScore(event.target.value)
            }
            required
            step="0.5"
            type="number"
            value={score}
          />
        </label>
        <label>
          <span>Out of</span>
          <input
            min="0.5"
            onChange={(event) =>
              setMaximumMarks(event.target.value)
            }
            required
            step="0.5"
            type="number"
            value={maximumMarks}
          />
        </label>
        <label>
          <span>Hints</span>
          <input
            min="0"
            onChange={(event) =>
              setHintsUsed(event.target.value)
            }
            step="1"
            type="number"
            value={hintsUsed}
          />
        </label>
        <label>
          <span>Confidence</span>
          <select
            onChange={(event) =>
              setConfidence(event.target.value)
            }
            value={confidence}
          >
            <option value="">—</option>
            <option value="0.3">Low</option>
            <option value="0.6">Medium</option>
            <option value="0.9">High</option>
          </select>
        </label>
      </div>
      <div className="recordResultFooter">
        <span title={topicId}>Topic tracked automatically</span>
        <div>
          <button
            className="recordCancel"
            onClick={() => setExpanded(false)}
            type="button"
          >
            Cancel
          </button>
          <button disabled={saving} type="submit">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      {status ? (
        <p className="recordResultStatus">{status}</p>
      ) : null}
    </form>
  );
}
