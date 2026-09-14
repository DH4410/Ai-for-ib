import { describe, expect, it } from "vitest";

import {
  parseTrainingExample,
  parseTrainingJsonl,
  summarizeTrainingExamples,
} from "@/training/schema";

const validExample = {
  id: "physics-guided-hint-001",
  subject: "physics",
  mode: "learn",
  dataOrigin: "synthetic",
  prompt: [
    {
      role: "system",
      content: "Guide the student with short steps.",
    },
    {
      role: "user",
      content: "Help me understand what the symbols mean in q = mcΔT.",
    },
  ],
  completion: [
    {
      role: "assistant",
      content: "Start by matching each symbol to the unit you would expect.",
    },
  ],
  tags: ["guided-hint"],
};

describe("training dataset schema", () => {
  it("accepts a behavior-focused conversational prompt/completion example", () => {
    expect(parseTrainingExample(validExample)).toEqual(validExample);
  });

  it("requires explicit permission/origin metadata", () => {
    const { dataOrigin: _dataOrigin, ...withoutOrigin } = validExample;

    expect(() => parseTrainingExample(withoutOrigin)).toThrow(
      "dataOrigin must be a non-empty string",
    );
  });

  it("requires the prompt to end with the learner and completion with the tutor", () => {
    expect(() =>
      parseTrainingExample({
        ...validExample,
        prompt: [
          ...validExample.prompt,
          { role: "assistant", content: "This should not be the final prompt message." },
        ],
      }),
    ).toThrow("prompt must end with a user message");

    expect(() =>
      parseTrainingExample({
        ...validExample,
        completion: [{ role: "user", content: "Wrong role" }],
      }),
    ).toThrow("completion must use the assistant role");
  });

  it("reports JSONL line numbers and duplicate ids", () => {
    const validLine = JSON.stringify(validExample);

    expect(() => parseTrainingJsonl(`${validLine}\n{bad json}`)).toThrow(
      "invalid training JSON on line 2",
    );
    expect(() => parseTrainingJsonl(`${validLine}\n${validLine}`)).toThrow(
      "duplicate training example id",
    );
  });

  it("validates optional IB topic metadata against the example subject", () => {
    expect(
      parseTrainingExample({
        ...validExample,
        topicIds: [
          "physics.b.thermal-energy-transfers",
        ],
      }),
    ).toMatchObject({
      topicIds: [
        "physics.b.thermal-energy-transfers",
      ],
    });

    expect(() =>
      parseTrainingExample({
        ...validExample,
        topicIds: [
          "chemistry.structure.models",
        ],
      }),
    ).toThrow(
      "contains a chemistry topic for a physics example",
    );
  });

  it("summarizes subject, mode and origin coverage", () => {
    const examples = parseTrainingJsonl(JSON.stringify(validExample));

    expect(summarizeTrainingExamples(examples)).toMatchObject({
      total: 1,
      bySubject: { physics: 1 },
      byMode: { learn: 1 },
      byDataOrigin: { synthetic: 1 },
      taggedWithTopics: 0,
      uniqueTopicIds: [],
    });
  });
});
