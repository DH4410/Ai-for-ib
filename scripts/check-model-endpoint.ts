import {
  checkModelEndpoint,
} from "../lib/model-endpoint";

type Arguments = {
  allowThinking: boolean;
  baseUrl?: string;
  model?: string;
};

function readArgs(args: string[]): Arguments {
  const result: Arguments = {
    allowThinking: false,
  };

  for (
    let index = 0;
    index < args.length;
    index += 1
  ) {
    const key = args[index];

    if (key === "--allow-thinking") {
      result.allowThinking = true;
      continue;
    }

    if (
      key !== "--base-url" &&
      key !== "--model"
    ) {
      throw new Error(
        `unexpected argument: ${key}`,
      );
    }

    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(
        `missing value for ${key}`,
      );
    }

    if (key === "--base-url") {
      result.baseUrl = value;
    } else {
      result.model = value;
    }
    index += 1;
  }

  return result;
}

async function main(): Promise<void> {
  if (process.argv.includes("--help")) {
    console.log(
      [
        "Usage:",
        "  npm run model:check -- [--base-url <url>] [--model <name>] [--allow-thinking]",
        "",
        "Falls back to MODEL_BASE_URL and MODEL_NAME.",
        "MODEL_API_KEY is read from the environment only.",
        "The smoke prompt is synthetic and contains no private study data.",
      ].join("\n"),
    );
    return;
  }

  const args = readArgs(
    process.argv.slice(2),
  );
  const baseUrl =
    args.baseUrl ??
    process.env.MODEL_BASE_URL;
  const model =
    args.model ??
    process.env.MODEL_NAME;

  if (!baseUrl || !model) {
    throw new Error(
      "MODEL_BASE_URL and MODEL_NAME are required, either as environment variables or CLI arguments",
    );
  }

  const result =
    await checkModelEndpoint({
      apiKey:
        process.env.MODEL_API_KEY,
      baseUrl,
      model,
      rejectThinkingBlocks:
        !args.allowThinking,
    });

  console.log(
    JSON.stringify(result, null, 2),
  );
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "model endpoint check failed",
  );
  process.exitCode = 1;
});
