"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Session } from "@supabase/supabase-js";

import {
  getBrowserSupabaseClient,
  isBrowserSupabaseConfigured,
} from "@/lib/database/supabase-browser";
import type { Subject } from "@/types/study";

type ProgressItem = {
  attemptCount: number;
  label: string;
  masteryEstimate: number;
  misconceptionTags: string[];
  nextReviewAt: string;
  subject: Subject;
  topicId: string;
  updatedAt: string;
};

export function ProgressPanel({ subject }: { subject: Subject }) {
  const configured = isBrowserSupabaseConfigured();
  const client = useMemo(
    () => getBrowserSupabaseClient(),
    [],
  );
  const [session, setSession] = useState<Session | null>(null);
  const [progress, setProgress] = useState<ProgressItem[]>([]);
  const [loadingProgress, setLoadingProgress] = useState(false);
  const [email, setEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  const loadProgress = useCallback(
    async (accessToken: string) => {
      setLoadingProgress(true);

      try {
        const response = await fetch(
          `/api/progress?subject=${encodeURIComponent(subject)}`,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          },
        );

        if (!response.ok) {
          throw new Error("Could not load progress.");
        }

        const payload = (await response.json()) as {
          progress?: ProgressItem[];
        };
        setProgress(payload.progress ?? []);
      } catch {
        setProgress([]);
      } finally {
        setLoadingProgress(false);
      }
    },
    [subject],
  );

  useEffect(() => {
    if (!client) {
      return;
    }

    let active = true;
    void client.auth.getSession().then(({ data }) => {
      if (!active) {
        return;
      }
      setSession(data.session);
    });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [client]);

  useEffect(() => {
    if (!session?.access_token) {
      setProgress([]);
      return;
    }

    void loadProgress(session.access_token);
  }, [loadProgress, session?.access_token]);

  useEffect(() => {
    function refreshProgress() {
      if (session?.access_token) {
        void loadProgress(session.access_token);
      }
    }

    window.addEventListener(
      "ib-progress-updated",
      refreshProgress,
    );
    return () => {
      window.removeEventListener(
        "ib-progress-updated",
        refreshProgress,
      );
    };
  }, [loadProgress, session?.access_token]);

  async function requestMagicLink(event: FormEvent) {
    event.preventDefault();

    if (!client || !email.trim()) {
      return;
    }

    setAuthLoading(true);
    setAuthMessage("");

    try {
      const { error } = await client.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: window.location.origin,
        },
      });

      if (error) {
        throw error;
      }

      setAuthMessage("Check your email for the sign-in link.");
    } catch (error) {
      setAuthMessage(
        error instanceof Error
          ? error.message
          : "Could not send the sign-in link.",
      );
    } finally {
      setAuthLoading(false);
    }
  }

  if (!configured || !client) {
    return (
      <section className="progressPanel">
        <span className="eyebrow">Progress</span>
        <p className="progressHint">
          Progress sync will activate after the dedicated Supabase
          project is configured.
        </p>
      </section>
    );
  }

  if (!session) {
    return (
      <section className="progressPanel">
        <span className="eyebrow">Progress</span>
        <strong>Save your weak topics</strong>
        <form
          className="progressLogin"
          onSubmit={requestMagicLink}
        >
          <input
            aria-label="Email for progress sign in"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            required
            type="email"
            value={email}
          />
          <button disabled={authLoading} type="submit">
            {authLoading ? "Sending…" : "Sign in"}
          </button>
        </form>
        {authMessage ? (
          <p className="progressHint">{authMessage}</p>
        ) : null}
      </section>
    );
  }

  return (
    <section className="progressPanel">
      <div className="progressHeader">
        <div>
          <span className="eyebrow">Progress</span>
          <strong>{session.user.email ?? "Signed in"}</strong>
        </div>
        <button
          className="progressSignOut"
          onClick={() => void client.auth.signOut()}
          type="button"
        >
          Sign out
        </button>
      </div>

      {loadingProgress ? (
        <p className="progressHint">Loading mastery…</p>
      ) : progress.length === 0 ? (
        <p className="progressHint">
          No saved {subject} attempts yet. Mark work and record the
          result to start building mastery.
        </p>
      ) : (
        <div className="progressTopics">
          {progress.slice(0, 4).map((item) => {
            const masteryPercent = Math.round(
              item.masteryEstimate * 100,
            );
            const due =
              Date.parse(item.nextReviewAt) <= Date.now();

            return (
              <div className="progressTopic" key={item.topicId}>
                <div>
                  <strong>{item.label}</strong>
                  <span>
                    {item.attemptCount} attempt
                    {item.attemptCount === 1 ? "" : "s"}
                    {due ? " · review due" : ""}
                    {item.misconceptionTags.length > 0
                      ? ` · ${item.misconceptionTags.join(", ")}`
                      : ""}
                  </span>
                </div>
                <b>{masteryPercent}%</b>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
