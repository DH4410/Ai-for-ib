import { execFileSync } from "node:child_process";

import { assertPrivateBoundary } from "../lib/security/private-boundary";

function listRepositoryPaths(): string[] {
  const output = execFileSync(
    "git",
    [
      "-c",
      "core.excludesFile=",
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
    ],
    { encoding: "utf8" },
  );

  return output.split(/\r?\n/).filter(Boolean);
}

assertPrivateBoundary(listRepositoryPaths());
