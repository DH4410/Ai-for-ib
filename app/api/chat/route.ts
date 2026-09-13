import { NextResponse } from "next/server";

import { generateTutorAnswer } from "@/lib/model";
import { buildSystemPrompt } from "@/lib/prompt";
import { formatRetrievedContext, retrieveStudyContext } from "@/lib/retrieval";
import type { StudyMode, Subject, TutorRequest, TutorResponse } from "@/types/study";

export const runtime = "nodejs";

const subjects = new Set<Subject>(["physics", "chemistry", "mathematics"]);
const modes = new Set<StudyMode>(["learn", "practice", "mark", "revise"]);

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<TutorRequest>;

    if (!body.subject || !subjects.has(body.subject)) {
      return NextResponse.json({ error: "Invalid subject." }, { status: 400 });
    }

    if (!body.mode || !modes.has(body.mode)) {
      return NextResponse.json({ error: "Invalid study mode." }, { status: 400 });
    }

    if (!body.message || typeof body.message !== "string" || !body.message.trim()) {
      return NextResponse.json({ error: "A message is required." }, { status: 400 });
    }

    const history = Array.isArray(body.history)
      ? body.history
          .filter(
            (turn): turn is { role: "user" | "assistant"; content: string } =>
              (turn?.role === "user" || turn?.role === "assistant") &&
              typeof turn?.content === "string",
          )
          .slice(-12)
      : [];

    const sources = await retrieveStudyContext({
      subject: body.subject,
      query: body.message,
      limit: 8,
    });

    const system = buildSystemPrompt({
      subject: body.subject,
      mode: body.mode,
      retrievedContext: formatRetrievedContext(sources),
    });

    const result = await generateTutorAnswer({
      system,
      messages: [...history, { role: "user", content: body.message }],
    });

    const response: TutorResponse = {
      answer: result.text,
      model: result.model,
      sources: sources.map(({ id, title, locator }) => ({ id, title, locator })),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected error while generating the tutor response.",
      },
      { status: 500 },
    );
  }
}
