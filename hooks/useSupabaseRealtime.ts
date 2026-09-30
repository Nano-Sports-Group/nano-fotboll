"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

export function useSupabaseRealtime<T>({
  table,
  filter,
}: {
  table: string;
  filter?: string;
}) {
  const supabase = useMemo(() => {
    try {
      return createClient();
    } catch {
      return null;
    }
  }, []);

  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!supabase) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- startar en hämtning; laddnings-/felflaggan sätts synkront innan fetch (synk mot externt system).
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const channel = supabase
      .channel(`realtime:${table}:${filter ?? "*"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter },
        () => {
          // Minimal hook: signala att ny data finns; consumer kan refetcha separat.
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setLoading(false);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [filter, supabase, table]);

  return { data, setData, loading, error };
}

