export type ModelEndpointCheckConfig = {
  apiKey?: string;
  baseUrl: string;
  model: string;
  rejectThinkingBlocks?: boolean;
  timeoutMs?: number;
};

export type ModelEndpointCheckResult = {
  chatLatencyMs: number;
  listedModelCount: number;
  model: string;
  modelListed: true;
  responseCharacters: number;
  responseModel: string;
  thinkingBlockDetected: false;
};

type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

type UnknownRecord = Record<string, unknown>;

function isRecord(
  value: unknown,
): value is UnknownRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function normalizedBaseUrl(
  baseUrl: string,
): string {
  const value = baseUrl.trim().replace(/\/$/, "");
  if (!/^https?:\/\//i.test(value)) {
    throw new Error(
      "model base URL must start with http:// or https://",
    );
  }
  return value;
}

function authorizationHeaders(
  apiKey: string | undefined,
): Record<string, string> {
  const key = apiKey?.trim();
  return key
    ? { Authorization: `Bearer ${key}` }
    : {};
}

function modelIdsFrom(
  payload: unknown,
): string[] {
  if (
    !isRecord(payload) ||
    !Array.isArray(payload.data)
  ) {
    throw new Error(
      "model server returned an invalid /models payload",
    );
  }

  return payload.data
    .map((entry) =>
      isRecord(entry) &&
      typeof entry.id === "string"
        ? entry.id
        : undefined,
    )
    .filter(
      (value): value is string =>
        Boolean(value?.trim()),
    );
}

function chatResultFrom(
  payload: unknown,
): {
  model?: string;
  text: string;
} {
  if (!isRecord(payload)) {
    throw new Error(
      "model server returned an invalid chat payload",
    );
  }

  const choices = payload.choices;
  if (!Array.isArray(choices)) {
    throw new Error(
      "model server returned chat without choices",
    );
  }

  const first = choices[0];
  const message =
    isRecord(first) && isRecord(first.message)
      ? first.message
      : undefined;
  const text =
    message &&
    typeof message.content === "string"
      ? message.content.trim()
      : "";

  if (!text) {
    throw new Error(
      "model server returned an empty chat response",
    );
  }

  return {
    model:
      typeof payload.model === "string"
        ? payload.model
        : undefined,
    text,
  };
}

async function responseJson(
  response: Response,
  label: string,
): Promise<unknown> {
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `${label} returned ${response.status}: ${body.slice(
        0,
        300,
      )}`,
    );
  }

  try {
    return await response.json();
  } catch {
    throw new Error(
      `${label} returned invalid JSON`,
    );
  }
}

export async function checkModelEndpoint(
  config: ModelEndpointCheckConfig,
  fetchImpl: FetchLike = fetch,
): Promise<ModelEndpointCheckResult> {
  const baseUrl = normalizedBaseUrl(
    config.baseUrl,
  );
  const model = config.model.trim();
  if (!model) {
    throw new Error("model name is required");
  }

  const timeoutMs =
    config.timeoutMs ?? 120_000;
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1_000 ||
    timeoutMs > 600_000
  ) {
    throw new Error(
      "model timeout must be 1000-600000 ms",
    );
  }

  const commonHeaders = {
    Accept: "application/json",
    ...authorizationHeaders(config.apiKey),
  };

  const modelsResponse = await fetchImpl(
    `${baseUrl}/models`,
    {
      headers: commonHeaders,
      signal: AbortSignal.timeout(timeoutMs),
    },
  );
  const modelIds = modelIdsFrom(
    await responseJson(
      modelsResponse,
      "model listing",
    ),
  );

  if (!modelIds.includes(model)) {
    throw new Error(
      `configured model alias is not exposed by the server: ${model}`,
    );
  }

  const startedAt = Date.now();
  const chatResponse = await fetchImpl(
    `${baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: {
        ...commonHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        max_tokens: 64,
        messages: [
          {
            role: "system",
            content:
              "You are running a deployment smoke test. Answer briefly and do not include private data.",
          },
          {
            role: "user",
            content:
              "Reply with a short confirmation that the IB tutor model endpoint is ready.",
          },
        ],
        model,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    },
  );
  const chat = chatResultFrom(
    await responseJson(
      chatResponse,
      "chat completion",
    ),
  );
  const thinkingBlockDetected =
    /<think>[\s\S]*?<\/think>/i.test(
      chat.text,
    ) ||
    /<think>/i.test(chat.text);

  if (
    (config.rejectThinkingBlocks ?? true) &&
    thinkingBlockDetected
  ) {
    throw new Error(
      "model endpoint exposed a <think> block; use the normal non-thinking tutor serving configuration",
    );
  }

  return {
    chatLatencyMs:
      Date.now() - startedAt,
    listedModelCount: modelIds.length,
    model,
    modelListed: true,
    responseCharacters: chat.text.length,
    responseModel: chat.model ?? model,
    thinkingBlockDetected: false,
  };
}
