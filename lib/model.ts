import type { ChatTurn } from "@/types/study";

type GenerateArgs = {
  system: string;
  messages: ChatTurn[];
};

type ModelResult = {
  text: string;
  model: string;
};

function modelConfig() {
  return {
    baseUrl: (process.env.MODEL_BASE_URL ?? "http://localhost:8000/v1").replace(/\/$/, ""),
    model: process.env.MODEL_NAME ?? "ib-tutor-model",
    apiKey: process.env.MODEL_API_KEY ?? "",
    useMock: process.env.USE_MOCK_MODEL === "true",
  };
}

export async function generateTutorAnswer(args: GenerateArgs): Promise<ModelResult> {
  const config = modelConfig();

  if (config.useMock) {
    const latest = [...args.messages].reverse().find((message) => message.role === "user");
    return {
      model: "mock-development-model",
      text:
        "The standalone tutor is running in mock mode. I received your question: \"" +
        (latest?.content ?? "") +
        "\"\n\nConnect MODEL_BASE_URL and MODEL_NAME to a self-hosted model server to get real tutoring responses.",
    };
  }

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.25,
      messages: [
        { role: "system", content: args.system },
        ...args.messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      ],
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Model server returned ${response.status}: ${body.slice(0, 500)}`);
  }

  const payload = (await response.json()) as {
    model?: string;
    choices?: Array<{ message?: { content?: string } }>;
  };

  const text = payload.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("Model server returned an empty response.");
  }

  return {
    text,
    model: payload.model ?? config.model,
  };
}
