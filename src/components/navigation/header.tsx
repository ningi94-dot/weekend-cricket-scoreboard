"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { MatchRow } from "@/lib/cricket/stats";

export function Header() {
  const pathname = usePathname();
  const matchId = useMemo(() => {
    const match = pathname.match(/^\/matches\/([^/]+)/);
    return match?.[1] ?? null;
  }, [pathname]);
  const [match, setMatch] = useState<MatchRow | null>(null);
  const visibleMatch = match?.id === matchId ? match : null;

  useEffect(() => {
    if (!matchId) return;
    let isActive = true;
    const selectedMatchId = matchId;
    async function loadMatch() {
      try {
        const { data } = await getSupabaseBrowserClient().from("matches").select("*").eq("id", selectedMatchId).single();
        if (isActive) setMatch(data ?? null);
      } catch {
        if (isActive) setMatch(null);
      }
    }
    void loadMatch();
    return () => {
      isActive = false;
    };
  }, [matchId]);

  return (
    <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-white/95 px-4 py-2 backdrop-blur sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <Link href="/" className="flex shrink-0 items-center gap-3" aria-label="Let's Play Cricket home">
          <span className="grid size-9 place-items-center rounded-lg bg-[var(--brand)] text-sm font-black text-white" aria-hidden>LPC</span>
          <span>
            <strong className="block text-sm leading-none">Let&apos;s Play</strong>
            <span className="text-xs text-[var(--muted)]">Cricket</span>
          </span>
        </Link>
        {visibleMatch && (
          <div className="min-w-0 flex-1 text-right">
            <p className="truncate text-xs font-black text-stone-900">{visibleMatch.team_a_name} vs {visibleMatch.team_b_name}</p>
            <p className="truncate text-[11px] font-medium text-[var(--muted)]">{formatDate(visibleMatch.match_date)} · {visibleMatch.location}</p>
          </div>
        )}
      </div>
    </header>
  );
}

function formatDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
