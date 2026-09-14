"use client";

import { FormEvent, useMemo, useState } from "react";

import { CapabilityStatus } from "@/components/CapabilityStatus";
import {
  ProgressPanel,
  type ProgressStudyTarget,
} from "@/components/ProgressPanel";
import { RecordResult } from "@/components/RecordResult";
import { SourceLibraryPanel } from "@/components/SourceLibraryPanel";
import { getBrowserSupabaseClient } from "@/lib/database/supabase-browser";
import { IBDP_TOPICS } from "@/lib/taxonomy/ibdp";
import type {
  ChatTurn,
  SourceCitation,
  StudyMode,
  Subject,
  TutorResponse,
} from "@/types/study";

const subjectOptions: Array<{
  id: Subject;
  label: string;
  short: string;
}> = [
  { id: "physics", label: "Physics", short: "PH" },
  { id: "chemistry", label: "Chemistry", short: "CH" },
  { id: "mathematics", label: "Mathematics", short: "MA" },
];

const modeOptions: Array<{ id: StudyMode; label: string }> = [
  { id: "learn", label: "Learn" },
  { id: "practice", label: "Practice" },
  { id: "mark", label: "Mark my work" },
  { id: "revise", label: "Revise" },
];

const paperOptionsBySubject: Record<
  Subject,
  Array<{ value: string; label: string }>
> = {
  physics: [
    { value: "p1a", label: "Paper 1A" },
    { value: "p1b", label: "Paper 1B" },
    { value: "p2", label: "Paper 2" },
  ],
  chemistry: [
    { value: "p1a", label: "Paper 1A" },
    { value: "p1b", label: "Paper 1B" },
    { value: "p2", label: "Paper 2" },
  ],
  mathematics: [
    { value: "p1", label: "Paper 1" },
    { value: "p2", label: "Paper 2" },
    { value: "p3", label: "Paper 3" },
  ],
};

const paperYears = Array.from(
  { length: 7 },
  (_, index) => 2026 - index,
);

type VisibleTurn = ChatTurn & {
  sources?: TutorResponse["sources"];
  mode: StudyMode;
  subject: Subject;
};

function progressSource(
  turn: VisibleTurn,
): SourceCitation | undefined {
  return turn.sources?.find(
    (source) => (source.topicIds?.length ?? 0) > 0,
  );
}

export function TutorShell() {
  const [subject, setSubject] = useState<Subject>("physics");
  const [mode, setMode] = useState<StudyMode>("learn");
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<VisibleTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const [modelName, setModelName] = useState("not connected");
  const [realPastPapers, setRealPastPapers] = useState(false);
  const [paperFilter, setPaperFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [explanationLevel, setExplanationLevel] =
    useState<"simple" | "standard" | "full">("standard");
  const [hintsFirst, setHintsFirst] = useState(true);
  const [focusedTopicId, setFocusedTopicId] = useState("");
  const [selectedMarkSource, setSelectedMarkSource] =
    useState<SourceCitation | null>(null);

  function prepareRevision(target: ProgressStudyTarget) {
    setSelectedMarkSource(null);
    setFocusedTopicId(target.topicId);
    setMode("revise");
    const mistakeFocus =
      target.misconceptionTags.length > 0
        ? ` Focus especially on my recurring mistakes: ${target.misconceptionTags.join(", ")}.`
        : "";
    setInput(
      `Revise ${target.label} with me. Start with a short active-recall check, then explain the parts I get wrong and finish with a few IB-style questions.${mistakeFocus}`,
    );
  }

  const subjectTopics = useMemo(
    () =>
      IBDP_TOPICS.filter(
        (topic) => topic.subject === subject,
      ),
    [subject],
  );

  const focusedTopic = subjectTopics.find(
    (topic) => topic.id === focusedTopicId,
  );
  const subjectTurns = turns.filter(
    (turn) => turn.subject === subject,
  );

  const placeholder = useMemo(() => {
    if (mode === "mark") {
      return selectedMarkSource?.locator
        ? `Paste your answer to ${selectedMarkSource.locator}…`
        : "Paste your answer and the question you answered…";
    }
    if (mode === "practice") {
      return realPastPapers
        ? "Ask for a real past-paper question on a topic…"
        : "Give me practice on thermal physics…";
    }
    if (mode === "revise") {
      return "Revise atomic structure with me…";
    }
    return "Explain a topic, equation or question…";
  }, [mode, realPastPapers, selectedMarkSource]);

  async function submit(event: FormEvent) {
    event.preventDefault();

    const message = input.trim();
    if (!message || loading) {
      return;
    }

    const history: ChatTurn[] = subjectTurns.map(
      ({ role, content }) => ({
        role,
        content,
      }),
    );
    const filters = {
      explanationLevel,
      ...(focusedTopicId
        ? { topicIds: [focusedTopicId] }
        : {}),
      ...(mode === "mark" && selectedMarkSource
        ? {
            pastPaperQuestionId: selectedMarkSource.id,
          }
        : {}),
      ...(mode === "practice"
        ? {
            hintsFirst,
            ...(realPastPapers
              ? {
                  documentTypes: ["question-paper"],
                  paper: paperFilter || undefined,
                  realPastPapersOnly: true,
                  years: yearFilter
                    ? [Number(yearFilter)]
                    : undefined,
                }
              : {}),
          }
        : {}),
    };

    setTurns((current) => [
      ...current,
      {
        role: "user",
        content: message,
        mode,
        subject,
      },
    ]);
    setInput("");
    setLoading(true);

    try {
      const supabase = getBrowserSupabaseClient();
      const session = supabase
        ? (await supabase.auth.getSession()).data.session
        : null;
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token
            ? {
                Authorization: `Bearer ${session.access_token}`,
              }
            : {}),
        },
        body: JSON.stringify({
          subject,
          mode,
          message,
          history,
          filters,
        }),
      });

      const payload = (await response.json()) as
        | TutorResponse
        | { error: string };

      if (!response.ok || "error" in payload) {
        throw new Error(
          "error" in payload
            ? payload.error
            : "Tutor request failed.",
        );
      }

      setModelName(payload.model);
      setTurns((current) => [
        ...current,
        {
          role: "assistant",
          content: payload.answer,
          sources: payload.sources,
          mode,
          subject,
        },
      ]);
    } catch (error) {
      setTurns((current) => [
        ...current,
        {
          role: "assistant",
          content:
            "I could not reach the model backend. " +
            (error instanceof Error
              ? error.message
              : "Unknown error."),
          mode,
          subject,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="appShell">
      <aside className="sidebar">
        <div>
          <div className="brandMark">IB</div>
          <h1>Study AI</h1>
          <p className="muted">Private tutor workspace</p>
        </div>

        <section className="sideSection">
          <span className="eyebrow">Subject</span>
          <div className="subjectList">
            {subjectOptions.map((option) => (
              <button
                className={
                  subject === option.id
                    ? "subject active"
                    : "subject"
                }
                key={option.id}
                onClick={() => {
                  setSubject(option.id);
                  setPaperFilter("");
                  setFocusedTopicId("");
                  setSelectedMarkSource(null);
                }}
                type="button"
              >
                <span>{option.short}</span>
                {option.label}
              </button>
            ))}
          </div>
        </section>

        <ProgressPanel
          onReviseTopic={prepareRevision}
          subject={subject}
        />
        <SourceLibraryPanel subject={subject} />
        <CapabilityStatus />

        <div className="modelStatus">
          <span className="statusDot" />
          <div>
            <strong>Model</strong>
            <p>{modelName}</p>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <span className="eyebrow">Current workspace</span>
            <h2>
              {
                subjectOptions.find(
                  (item) => item.id === subject,
                )?.label
              }
            </h2>
          </div>

          <div className="modes">
            {modeOptions.map((option) => (
              <button
                className={
                  mode === option.id
                    ? "mode active"
                    : "mode"
                }
                key={option.id}
                onClick={() => setMode(option.id)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </header>

        <div className="learningToolbar">
          <label className="topicFocusControl">
            <span>Topic</span>
            <select
              aria-label="Focus topic"
              onChange={(event) =>
                setFocusedTopicId(event.target.value)
              }
              value={focusedTopicId}
            >
              <option value="">Any topic</option>
              {subjectTopics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.parentId ? "↳ " : ""}
                  {topic.label}
                </option>
              ))}
            </select>
          </label>

          <div className="explanationControl">
            <span>Explanation</span>
            {(["simple", "standard", "full"] as const).map(
              (level) => (
                <button
                  className={
                    explanationLevel === level
                      ? "learningChoice active"
                      : "learningChoice"
                  }
                  key={level}
                  onClick={() => setExplanationLevel(level)}
                  type="button"
                >
                  {level[0].toUpperCase() + level.slice(1)}
                </button>
              ),
            )}
          </div>
          {mode === "practice" ? (
            <button
              aria-pressed={hintsFirst}
              className={
                hintsFirst
                  ? "hintsToggle active"
                  : "hintsToggle"
              }
              onClick={() =>
                setHintsFirst((current) => !current)
              }
              type="button"
            >
              Hints first {hintsFirst ? "on" : "off"}
            </button>
          ) : null}
        </div>

        {focusedTopic && mode !== "mark" ? (
          <div className="topicFocusBanner">
            <span>
              Focused retrieval: <strong>{focusedTopic.label}</strong>
            </span>
            <button
              onClick={() => setFocusedTopicId("")}
              type="button"
            >
              Clear
            </button>
          </div>
        ) : null}

        {mode === "mark" && selectedMarkSource ? (
          <div className="markingToolbar">
            <div>
              <span className="eyebrow">Pinned paper question</span>
              <strong>
                {selectedMarkSource.title}
                {selectedMarkSource.locator
                  ? ` · ${selectedMarkSource.locator}`
                  : ""}
              </strong>
            </div>
            <button
              onClick={() => setSelectedMarkSource(null)}
              type="button"
            >
              Clear
            </button>
          </div>
        ) : null}

        {mode === "practice" ? (
          <div className="practiceToolbar">
            <button
              aria-pressed={realPastPapers}
              className={
                realPastPapers
                  ? "paperToggle active"
                  : "paperToggle"
              }
              onClick={() =>
                setRealPastPapers((current) => !current)
              }
              type="button"
            >
              <span className="paperToggleDot" />
              Real past papers
            </button>

            {realPastPapers ? (
              <div className="paperFilters">
                <label>
                  <span>Paper</span>
                  <select
                    aria-label="Past-paper component"
                    onChange={(event) =>
                      setPaperFilter(event.target.value)
                    }
                    value={paperFilter}
                  >
                    <option value="">Any paper</option>
                    {paperOptionsBySubject[subject].map(
                      (option) => (
                        <option
                          key={option.value}
                          value={option.value}
                        >
                          {option.label}
                        </option>
                      ),
                    )}
                  </select>
                </label>

                <label>
                  <span>Year</span>
                  <select
                    aria-label="Past-paper year"
                    onChange={(event) =>
                      setYearFilter(event.target.value)
                    }
                    value={yearFilter}
                  >
                    <option value="">Any year</option>
                    {paperYears.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </label>

                <span className="verifiedSourceNote">
                  Indexed real questions only
                </span>
              </div>
            ) : (
              <span className="generatedPracticeNote">
                Generated practice is allowed
              </span>
            )}
          </div>
        ) : null}

        <div className="conversation">
          {subjectTurns.length === 0 ? (
            <div className="emptyState">
              <span className="eyebrow">
                Standalone IB tutor
              </span>
              <h3>What are you studying?</h3>
              <p>
                Ask for an explanation, practise a topic, paste an
                answer to mark, or start a revision session.
              </p>
              <div className="suggestions">
                <button
                  onClick={() =>
                    setInput(
                      "Teach me this topic from the beginning.",
                    )
                  }
                >
                  Teach a topic
                </button>
                <button
                  onClick={() =>
                    setInput(
                      "Give me 5 questions, easy to hard.",
                    )
                  }
                >
                  Start practice
                </button>
                <button
                  onClick={() =>
                    setInput(
                      "Make me a concise revision sheet with equations and common mistakes.",
                    )
                  }
                >
                  Build revision notes
                </button>
              </div>
            </div>
          ) : (
            <div className="turnList">
              {subjectTurns.map((turn, index) => (
                <article
                  className={`turn ${turn.role}`}
                  key={index}
                >
                  <span className="turnLabel">
                    {turn.role === "user"
                      ? "You"
                      : "IB AI"}
                  </span>
                  <div className="turnText">
                    {turn.content}
                  </div>
                  {turn.sources &&
                  turn.sources.length > 0 ? (
                    <div className="sources">
                      {turn.sources.map((source) => (
                        <div className="sourceCitation" key={source.id}>
                          <span>
                            {source.title}
                            {source.locator
                              ? ` · ${source.locator}`
                              : ""}
                            {source.marks !== undefined &&
                            source.marks !== null
                              ? ` · ${source.marks} marks`
                              : ""}
                          </span>
                          {turn.mode === "practice" &&
                          source.documentType ===
                            "question-paper" ? (
                            <button
                              onClick={() => {
                                setSelectedMarkSource(source);
                                setMode("mark");
                                setInput("");
                              }}
                              type="button"
                            >
                              {source.pairingStatus === "paired"
                                ? "Mark this"
                                : "Mark (no scheme)"}
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {turn.role === "assistant" &&
                  turn.mode === "mark" &&
                  turn.subject ? (
                    <RecordResult
                      source={progressSource(turn)}
                      subject={turn.subject}
                    />
                  ) : null}
                </article>
              ))}
              {loading ? (
                <article className="turn assistant loadingTurn">
                  <span className="turnLabel">IB AI</span>
                  <div className="thinking">
                    <span />
                    <span />
                    <span />
                  </div>
                </article>
              ) : null}
            </div>
          )}
        </div>

        <form className="composer" onSubmit={submit}>
          <textarea
            aria-label="Ask your IB tutor"
            onChange={(event) =>
              setInput(event.target.value)
            }
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey
              ) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={placeholder}
            rows={3}
            value={input}
          />
          <div className="composerFooter">
            <span>
              Enter to send · Shift+Enter for a new line
            </span>
            <button
              disabled={!input.trim() || loading}
              type="submit"
            >
              {loading ? "Thinking…" : "Send"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
