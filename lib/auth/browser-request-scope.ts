/**
 * Cancels superseded browser work and rejects late completions, even if a
 * fetch implementation does not respect AbortSignal.
 */
export function createLatestRequestScope() {
  let current: AbortController | null = null;
  return {
    begin(): AbortController {
      current?.abort();
      current = new AbortController();
      return current;
    },
    pending(): boolean {
      return current !== null && !current.signal.aborted;
    },
    isCurrent(request: AbortController): boolean {
      return current === request && !request.signal.aborted;
    },
    finish(request: AbortController): boolean {
      if (current !== request || request.signal.aborted) return false;
      current = null;
      return true;
    },
    cancel(): void {
      const previous = current;
      current = null;
      previous?.abort();
    },
  };
}

export function workspaceAccountKey(
  configured: boolean,
  userId?: string | null,
  revision = 0,
): string {
  const identity = !configured ? "local" : userId ? "account:" + userId : "signed-out";
  return identity + ":" + revision;
}
