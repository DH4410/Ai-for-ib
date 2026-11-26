"use client";

import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getBrowserSupabaseClient } from "@/lib/database/supabase-browser";

export function useBrowserSession() {
  const client = useMemo(() => getBrowserSupabaseClient(), []);
  const [state, setState] = useState<{
    ready: boolean;
    session: Session | null;
    revision: number;
  }>({ ready: !client, session: null, revision: 0 });

  useEffect(() => {
    if (!client) return;
    let active = true;
    let receivedAuthEvent = false;
    function publish(session: Session | null) {
      if (!active) return;
      setState((previous) => ({
        ready: true,
        session,
        revision: previous.revision +
          (previous.ready && previous.session?.user.id !== session?.user.id ? 1 : 0),
      }));
    }

    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION" && receivedAuthEvent) return;
      receivedAuthEvent = true;
      publish(session);
    });
    void client.auth.getSession().then(({ data }) => {
      if (!receivedAuthEvent) publish(data.session);
    }).catch(() => {
      if (!receivedAuthEvent) publish(null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [client]);

  return { client, ...state };
}
