const PROTECTED_DIRECTORY_PREFIXES = [
  "private-sources/",
  "private-index/",
  "data/ingestion-reports/",
  "training/private-data/",
  "training/outputs/",
  "training/checkpoints/",
];

const PROTECTED_EXACT_PATHS = new Set(["data/source-manifest.jsonl"]);

const PROTECTED_EXTENSIONS = new Set([
  ".pdf",
  ".ppt",
  ".pptx",
  ".doc",
  ".docx",
  ".epub",
  ".gguf",
  ".safetensors",
]);

const ALLOWED_PATHS = new Set([
  ".env.example",
  "data/source-manifest.example.jsonl",
  "training/dataset.example.jsonl",
]);

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function isProtectedDotenvPath(path: string): boolean {
  return path === ".env" || (path.startsWith(".env.") && path !== ".env.example");
}

function hasProtectedExtension(path: string): boolean {
  const lowerCasePath = path.toLowerCase();

  return [...PROTECTED_EXTENSIONS].some((extension) => lowerCasePath.endsWith(extension));
}

function isProtectedTrainingDataset(path: string): boolean {
  return path.startsWith("training/") && path.toLowerCase().endsWith(".jsonl");
}

/**
 * Returns paths that must not be added to the public repository.
 *
 * The function deliberately operates on paths only. It never reads or logs the
 * content of a licensed source, manifest, environment file, or training set.
 */
export function findPrivateBoundaryViolations(paths: string[]): string[] {
  return paths.filter((path) => {
    const normalizedPath = normalizePath(path);

    if (ALLOWED_PATHS.has(normalizedPath)) {
      return false;
    }

    return (
      PROTECTED_EXACT_PATHS.has(normalizedPath) ||
      PROTECTED_DIRECTORY_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix)) ||
      isProtectedDotenvPath(normalizedPath) ||
      isProtectedTrainingDataset(normalizedPath) ||
      hasProtectedExtension(normalizedPath)
    );
  });
}

export function assertPrivateBoundary(paths: string[]): void {
  const violations = findPrivateBoundaryViolations(paths);

  if (violations.length > 0) {
    throw new Error(
      [
        "Private study boundary violation. Remove these paths from Git tracking:",
        ...violations.map((path) => `- ${path}`),
      ].join("\n"),
    );
  }
}
