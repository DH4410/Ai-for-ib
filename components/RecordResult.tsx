"use client";

import {
  FormEvent,
  useMemo,
  useState,
} from "react";

import {
  getBrowserSupabaseClient,
  isBrowserSupabaseConfigured,
} from "@/lib/database/supabase-browser";
import { IBDP_TOPICS } from "@/lib/taxonomy/ibdp";
import type {
  SourceCitation,
  Subject,
} from "@/types/study";

const MISTAKE_OPTIONS = [
  { id: "concept", label: "Concept" },
  { id: "formula", label: "Formula" },
  { id: "units", label: "Units" },
  { id: "algebra", label: "Algebra" },
  {
    id: "significant-figures",
    label: "Sig. figures",
  },
  { id: "method", label: "Method" },
] as const;

export function RecordResult({
  source,
  subject,
  suggestedScore,
  suggestedMaximumMarks,
}: {
  source?: SourceCitation;
  subject: Subject;
  suggestedScore?: number;
  suggestedMaximumMarks?: number;
}) {
  const topics = useMemo(
    () =>
      IBDP_TOPICS.filter(
        (topic) => topic.subject === subject,
      ),
    [subject],
  );
  const defaultTopicId =
    source?.topicIds?.find((topicId) =>
      topics.some((topic) => topic.id === topicId),
    ) ?? "";
  const [expanded, setExpanded] = useState(false);
  const [topicId, setTopicId] =
    useState(defaultTopicId);
  const sourceMaximum = source?.marks;
  const suggestionMatchesSource =
    suggestedScore !== undefined &&
    suggestedMaximumMarks !== undefined &&
    (sourceMaximum === undefined ||
      sourceMaximum === null ||
      sourceMaximum === suggestedMaximumMarks);
  const [score, setScore] = useState(
    suggestionMatchesSource
      ? suggestedScore.toString()
      : "",
  );
  const [maximumMarks, setMaximumMarks] = useState(
    (
      sourceMaximum ??
      suggestedMaximumMarks
    )?.toString() ?? "",
  );
  const [hintsUsed, setHintsUsed] = useState("0");
  const [confidence, setConfidence] = useState("");
  const [mistakes, setMistakes] = useState<string[]>(
    [],
  );
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const configured = isBrowserSupabaseConfigured();
  const client = useMemo(
    () => getBrowserSupabaseClient(),
    [],
  );

  const selectedTopic = topics.find(
    (topic) => topic.id === topicId,
  );

  function toggleMistake(id: string) {
    setMistakes((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }

  async function saveResult(event: FormEvent) {
    event.preventDefault();

    if (!topicId) {
      setStatus("Choose the topic this attempt tested.");
      return;
    }

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
          misconceptionTags: mistakes,
          pastPaperQuestionId:
            source?.documentType === "question-paper"
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
          {suggestionMatchesSource
            ? `Record ${suggestedScore}/${sourceMaximum ?? suggestedMaximumMarks}`
            : "Record result"}
        </button>
        {status ? <span>{status}</span> : null}
      </div>
    );
  }

  return (
    <form className="recordResult" onSubmit={saveResult}>
      <label className="recordTopic">
        <span>Topic</span>
        <select
          onChange={(event) =>
            setTopicId(event.target.value)
          }
          required
          value={topicId}
        >
          <option value="">Choose topic…</option>
          {topics.map((topic) => (
            <option key={topic.id} value={topic.id}>
              {topic.label}
            </option>
          ))}
        </select>
      </label>

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

      <fieldset className="mistakeTags">
        <legend>What went wrong?</legend>
        <div>
          {MISTAKE_OPTIONS.map((option) => (
            <button
              aria-pressed={mistakes.includes(option.id)}
              className={
                mistakes.includes(option.id)
                  ? "mistakeTag active"
                  : "mistakeTag"
              }
              key={option.id}
              onClick={() =>
                toggleMistake(option.id)
              }
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="recordResultFooter">
        <span>
          {selectedTopic
            ? `Tracking ${selectedTopic.label}`
            : "Choose a topic to track"}
        </span>
        <div>
          <button
            className="recordCancel"
            onClick={() => setExpanded(false)}
            type="button"
          >
            Cancel
          </button>
          <button
            disabled={saving || !topicId}
            type="submit"
          >
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
