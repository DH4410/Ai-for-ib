import type { SupabaseClient } from "@supabase/supabase-js";

import { getPrivateSupabaseServerClient } from "@/lib/database/supabase-server";
import type {
  LearningAttempt,
  TopicMasteryState,
} from "@/lib/learning/mastery";
import type { Subject } from "@/types/study";

export type LearningEventInput = LearningAttempt & {
  pastPaperQuestionId?: string | null;
  attemptNumber?: number;
};

export type LearningProgressRow = TopicMasteryState & {
  label: string;
};

export interface LearningProgressRepository {
  recordAttempt(
    studentId: string,
    attempt: LearningEventInput,
    mastery: TopicMasteryState,
  ): Promise<void>;
  listTopicMastery(
    studentId: string,
    subject?: Subject,
  ): Promise<LearningProgressRow[]>;
}

type RpcClient = {
  rpc: (
    name: string,
    parameters: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

type ProgressRpcRow = {
  subject: Subject;
  topic_id: string;
  label: string;
  mastery_estimate: number;
  attempt_count: number;
  next_review_at: string;
  updated_at: string;
};

function assertStudentId(studentId: string): void {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      studentId,
    )
  ) {
    throw new Error("studentId must be a UUID");
  }
}

export class SupabaseLearningProgressRepository
  implements LearningProgressRepository
{
  private readonly client: RpcClient;

  constructor(client: SupabaseClient = getPrivateSupabaseServerClient()) {
    this.client = client as unknown as RpcClient;
  }

  async recordAttempt(
    studentId: string,
    attempt: LearningEventInput,
    mastery: TopicMasteryState,
  ): Promise<void> {
    assertStudentId(studentId);

    const { error } = await this.client.rpc(
      "record_private_learning_attempt",
      {
        p_attempt: {
          attempt_number: attempt.attemptNumber ?? 1,
          confidence: attempt.confidence ?? null,
          elapsed_seconds: null,
          hints_used: attempt.hintsUsed,
          maximum_marks: attempt.maximumMarks,
          misconception_tags: attempt.misconceptionTags ?? [],
          occurred_at: attempt.occurredAt,
          past_paper_question_id:
            attempt.pastPaperQuestionId ?? null,
          score: attempt.score,
          subject: attempt.subject,
          topic_id: attempt.topicId,
        },
        p_mastery: {
          attempt_count: mastery.attemptCount,
          mastery_estimate: mastery.masteryEstimate,
          next_review_at: mastery.nextReviewAt,
          topic_id: mastery.topicId,
          updated_at: mastery.updatedAt,
        },
        p_student_id: studentId,
      },
    );

    if (error) {
      throw new Error(
        `recording learning progress failed: ${error.message}`,
      );
    }
  }

  async listTopicMastery(
    studentId: string,
    subject?: Subject,
  ): Promise<LearningProgressRow[]> {
    assertStudentId(studentId);

    const { data, error } = await this.client.rpc(
      "get_private_learning_progress",
      {
        p_student_id: studentId,
        p_subject: subject ?? null,
      },
    );

    if (error) {
      throw new Error(
        `loading learning progress failed: ${error.message}`,
      );
    }

    return ((data ?? []) as ProgressRpcRow[]).map((row) => ({
      attemptCount: row.attempt_count,
      label: row.label,
      masteryEstimate: row.mastery_estimate,
      nextReviewAt: row.next_review_at,
      subject: row.subject,
      topicId: row.topic_id,
      updatedAt: row.updated_at,
    }));
  }
}

export class InMemoryLearningProgressRepository
  implements LearningProgressRepository
{
  private readonly rows = new Map<string, LearningProgressRow>();

  async recordAttempt(
    studentId: string,
    attempt: LearningEventInput,
    mastery: TopicMasteryState,
  ): Promise<void> {
    const key = `${studentId}:${attempt.topicId}`;
    const current = this.rows.get(key);

    this.rows.set(key, {
      ...mastery,
      label: current?.label ?? attempt.topicId,
    });
  }

  async listTopicMastery(
    studentId: string,
    subject?: Subject,
  ): Promise<LearningProgressRow[]> {
    return [...this.rows.entries()]
      .filter(
        ([key, row]) =>
          key.startsWith(`${studentId}:`) &&
          (!subject || row.subject === subject),
      )
      .map(([, row]) => row)
      .sort(
        (left, right) =>
          left.masteryEstimate - right.masteryEstimate ||
          left.topicId.localeCompare(right.topicId),
      );
  }
}
