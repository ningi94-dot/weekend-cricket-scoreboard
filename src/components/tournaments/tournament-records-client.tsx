"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { type DeliveryRow, type InningsRow, type MatchRow, type PlayerRow } from "@/lib/cricket/stats";
import { formatTournamentDate, tournamentLeaders, type PerformanceRow, type SquadRow, type TournamentRow } from "@/lib/cricket/tournament-stats";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function TournamentRecordsClient({ tournamentId }: { tournamentId: string }) {
  const [tournament, setTournament] = useState<TournamentRow | null>(null);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [squads, setSquads] = useState<SquadRow[]>([]);
  const [innings, setInnings] = useState<InningsRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => { void load(); }, [tournamentId]);

  async function load() {
    try {
      const supabase = getSupabaseBrowserClient();
      const [tournamentResult, matchResult, playerResult] = await Promise.all([
        supabase.from("tournaments").select("*").eq("id", tournamentId).single(),
        supabase.from("matches").select("*").eq("tournament_id", tournamentId).order("match_date", { ascending: false }),
        supabase.from("players").select("*").order("name"),
      ]);
      if (tournamentResult.error) throw tournamentResult.error;
      if (matchResult.error) throw matchResult.error;
      if (playerResult.error) throw playerResult.error;

      const matchRows = matchResult.data ?? [];
      const matchIds = matchRows.map((match) => match.id);
      let squadRows: SquadRow[] = [];
      let inningsRows: InningsRow[] = [];
      let deliveryRows: DeliveryRow[] = [];

      if (matchIds.length) {
        const squadResult = await supabase.from("match_squads").select("*").in("match_id", matchIds);
        if (squadResult.error) throw squadResult.error;
        squadRows = squadResult.data ?? [];

        const inningsResult = await supabase.from("innings").select("*").in("match_id", matchIds);
        if (inningsResult.error) throw inningsResult.error;
        inningsRows = inningsResult.data ?? [];

        const inningsIds = inningsRows.map((inningsRow) => inningsRow.id);
        if (inningsIds.length) {
          const deliveryResult = await supabase.from("deliveries").select("*").in("innings_id", inningsIds).order("sequence_number");
          if (deliveryResult.error) throw deliveryResult.error;
          deliveryRows = deliveryResult.data ?? [];
        }
      }

      setTournament(tournamentResult.data);
      setMatches(matchRows);
      setPlayers(playerResult.data ?? []);
      setSquads(squadRows);
      setInnings(inningsRows);
      setDeliveries(deliveryRows);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load tournament records.");
    } finally {
      setIsLoading(false);
    }
  }

  const leaders = useMemo(() => tournamentLeaders(matches, players, squads, innings, deliveries), [matches, players, squads, innings, deliveries]);

  if (isLoading) return <p className="text-sm text-[var(--muted)]">Loading tournament records...</p>;
  if (!tournament) return <EmptyState title="Tournament not found" description={message || "Open the tournament hub and choose an existing tournament."} />;

  return (
    <section className="space-y-4">
      <Link href="/history" className="text-sm font-bold text-[var(--brand)]">Back to tournaments</Link>
      {message && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</p>}
      <header className="rounded-lg bg-white p-4 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--brand)]">Tournament records</p>
        <h1 className="mt-1 text-2xl font-black">{tournament.name}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{tournament.location ?? "Tournament"}{tournament.start_date ? ` - ${formatTournamentDate(tournament.start_date)}` : ""}</p>
      </header>
      <div className="grid gap-4">
        <RecordSection title="Most runs in a game" rows={leaders.records.mostRuns} />
        <RecordSection title="Best strike rate in a game" rows={leaders.records.bestStrikeRate} />
        <RecordSection title="Most wickets in a game" rows={leaders.records.mostWickets} />
        <RecordSection title="Best economy in a game" rows={leaders.records.bestEconomy} />
      </div>
    </section>
  );
}

function RecordSection({ title, rows }: { title: string; rows: PerformanceRow[] }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const visibleRows = isExpanded ? rows : rows.slice(0, 1);
  return (
    <section className="rounded-lg border border-[var(--line)] bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-black">{title}</h2>
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          disabled={rows.length <= 1}
          aria-expanded={isExpanded}
          className="grid size-9 shrink-0 place-items-center rounded-full border border-[var(--line)] text-lg font-black text-[var(--brand)] disabled:opacity-40"
        >
          {isExpanded ? "−" : "+"}
        </button>
      </div>
      <ul className="mt-3 space-y-2 text-sm">
        {visibleRows.length ? visibleRows.map((row) => <RecordRow key={row.id} row={row} />) : <li className="rounded-lg bg-stone-50 p-3 text-[var(--muted)]">No data yet.</li>}
      </ul>
    </section>
  );
}

function RecordRow({ row }: { row: PerformanceRow }) {
  return (
    <li className={`flex items-center justify-between gap-3 rounded-lg p-3 ${row.isLeader ? "bg-amber-50 ring-2 ring-amber-200" : "bg-stone-50"}`}>
      <span className="min-w-0">
        <span className="block truncate font-black">{row.rank}. {row.name}</span>
        <span className="block text-xs text-[var(--muted)]">{row.detail}</span>
      </span>
      <span className="shrink-0 text-right text-base font-black text-[var(--brand)]">{row.value}</span>
    </li>
  );
}
