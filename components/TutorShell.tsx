"use client";

import { FormEvent, useMemo, useState } from "react";

import { CapabilityStatus } from "@/components/CapabilityStatus";
import {
  ProgressPanel,
  type ProgressStudyTarget,
} from "@/components/ProgressPanel";
import { PrivateSourcePdf } from "@/components/PrivateSourcePdf";
import { RecordResult } from "@/components/RecordResult";
import { SourceLibraryPanel } from "@/components/SourceLibraryPanel";
import { getBrowserSupabaseClient } from "@/lib/database/supabase-browser";
import {
  recordableMarkSuggestion,
  stripMarkSuggestion,
} from "@/lib/marking/score";
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

function markSuggestion(
  turn: VisibleTurn,
) {
  if (
    turn.role !== "assistant" ||
    turn.mode !== "mark"
  ) {
    return null;
  }

  return recordableMarkSuggestion(
    turn.content,
    progressSource(turn),
  );
}
