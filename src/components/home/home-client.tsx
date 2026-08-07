"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { chooseFeaturedMatch, formatRate, getChaseInfo, summarizeInnings, teamName, type DeliveryRow, type InningsRow, type MatchRow, type PlayerRow } from "@/lib/cricket/stats";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type TournamentRow = { id: string; name: string; start_date: string | null; location: string | null; status: string };

export function HomeClient() {
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [innings, setInnings] = useState<InningsRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function load() {
    try {
      const supabase = getSupabaseBrowserClient();
      const today = new Date().toISOString().slice(0, 10);
      const [liveResult, upcomingResult, completedResult, playerResult, tournamentResult] = await Promise.all([
        supabase.from("matches").select("*").eq("status", "live").order("updated_at", { ascending: false }).limit(1),
        supabase.from("matches").select("*").eq("status", "upcoming").gte("match_date", today).order("match_date", { ascending: true }).limit(5),
        supabase.from("matches").select("*").eq("status", "completed").order("match_date", { ascending: false }).limit(1),
        supabase.from("players").select("*").eq("is_active", true).order("name").limit(1),
        supabase.from("tournaments").select("*").order("start_date", { ascending: false }).limit(1),
      ]);
      if (liveResult.error) throw liveResult.error;
      if (upcomingResult.error) throw upcomingResult.error;
      if (completedResult.error) throw completedResult.error;
      if (playerResult.error) throw playerResult.error;
      if (tournamentResult.error) throw tournamentResult.error;

      const loadedMatches = [...(liveResult.data ?? []), ...(upcomingResult.data ?? []), ...(completedResult.data ?? [])];
      const featuredMatch = chooseFeaturedMatch(loadedMatches);
      setPlayers(playerResult.data ?? []);
      setTournaments(tournamentResult.data ?? []);

      if (!featuredMatch) {
        setMatches([]);
        setInnings([]);
        setDeliveries([]);
        return;
      }

      setMatches(loadedMatches);
      const { data: inningsRows, error: inningsError } = await supabase.from("innings").select("*").eq("match_id", featuredMatch.id).order("innings_number");
      if (inningsError) throw inningsError;
      setInnings(inningsRows ?? []);

      const inningsIds = (inningsRows ?? []).map((innings) => innings.id);
      if (!inningsIds.length) {
        setDeliveries([]);
        return;
      }

      const { data: deliveryRows, error: deliveryError } = await supabase.from("deliveries").select("*").in("innings_id", inningsIds).order("sequence_number");
      if (deliveryError) throw deliveryError;
      setDeliveries(deliveryRows ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load the home page.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const featured = useMemo(() => chooseFeaturedMatch(matches), [matches]);
  const featuredInnings = featured ? innings.filter((item) => item.match_id === featured.id).sort((a, b) => b.innings_number - a.innings_number)[0] : null;
  const featuredScore = featuredInnings ? summarizeInnings(featuredInnings, deliveries, players) : null;
  const featuredChase = featured && featuredScore ? getChaseInfo(featured, featuredScore) : null;
  const featuredTournament = tournaments[0] ?? null;

  if (isLoading) return <p className="text-sm text-[var(--muted)]">Loading cricket hub...</p>;

  return (
    <div className="space-y-8">
      {message && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</p>}
      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--brand)]">Upcoming Match</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Let&apos;s Play Cricket</h1>
          </div>
          <Link href="/matches" className="text-sm font-bold text-[var(--brand)]">All matches</Link>
        </div>
        {featured ? (
          <Link href={`/matches/${featured.id}`} className="block rounded-lg bg-[var(--brand-dark)] p-5 text-white shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <StatusBadge status={featured.status} />
              <span className="text-xs text-emerald-50">{formatDate(featured.match_date)}{featured.start_time ? `, ${featured.start_time.slice(0, 5)}` : ""}</span>
            </div>
            <h2 className="mt-4 text-2xl font-bold">{featured.team_a_name} vs {featured.team_b_name}</h2>
            <p className="mt-2 text-sm text-emerald-50">{featured.location} - {featured.overs_per_innings} overs</p>
            <div className="mt-5 rounded-lg bg-white/10 p-4">
              {featuredScore ? (
                <>
                  <p className="text-xs uppercase tracking-[0.16em] text-amber-200">{teamName(featured, featuredScore.innings.batting_team_side)} batting</p>
                  <p className="mt-1 text-4xl font-bold">{featuredScore.runs}-{featuredScore.wickets}</p>
                  <p className="text-sm text-emerald-50">Overs {featuredScore.overs} - CRR {formatRate(featuredScore.runRate)}</p>
                  {featuredChase && <p className="mt-2 rounded-lg bg-white/10 p-2 text-sm font-bold text-amber-100">{featuredChase.sentence} · Req RR {formatRate(featuredChase.requiredRunRate)}</p>}
                </>
              ) : (
                <p className="text-sm text-emerald-50">Teams and score will appear here once the match starts.</p>
              )}
            </div>
          </Link>
        ) : (
          <div className="rounded-lg border border-dashed border-[var(--line)] bg-white p-6">
            <p className="font-bold">No matches yet</p>
            <p className="mt-2 text-sm text-[var(--muted)]">Create your first fixture and it will become the main card here.</p>
            <Link href="/matches" className="mt-4 inline-flex rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-bold text-white">Create match</Link>
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Player Profiles</h2>
          <Link href="/players" className="text-sm font-bold text-[var(--brand)]">View squad</Link>
        </div>
        <div className="grid gap-3">
          {players.map((player) => (
            <Link key={player.id} href={`/players/${player.id}`} className="rounded-lg border border-[var(--line)] bg-white p-4">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-full bg-emerald-100 font-bold text-[var(--brand-dark)]">{initials(player.name)}</span>
                <div className="min-w-0">
                  <h3 className="truncate font-bold">{player.name}</h3>
                  <p className="text-xs capitalize text-[var(--muted)]">{player.batting_style.replaceAll("_", " ")} - {player.bowling_style.replaceAll("_", " ")}</p>
                </div>
              </div>
              <p className="mt-4 rounded-lg bg-stone-50 p-3 text-sm text-[var(--muted)]">Featured active squad member. Open the full profile for career stats.</p>
            </Link>
          ))}
          {!players.length && <p className="rounded-lg border border-dashed border-[var(--line)] bg-white p-5 text-sm text-[var(--muted)]">Active player profiles will appear here.</p>}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Tournaments</h2>
          <Link href="/history" className="text-sm font-bold text-[var(--brand)]">View tournaments</Link>
        </div>
        {featuredTournament ? (
          <Link href="/history" className="block rounded-lg border border-[var(--line)] bg-white p-4">
            <h3 className="font-bold">{featuredTournament.name}</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">{featuredTournament.location ?? "Tournament"}{featuredTournament.start_date ? ` - ${formatDate(featuredTournament.start_date)}` : ""}</p>
            <span className="mt-3 inline-flex text-sm font-bold text-[var(--brand)]">Open tournament</span>
          </Link>
        ) : <p className="rounded-lg border border-dashed border-[var(--line)] bg-white p-5 text-sm text-[var(--muted)]">Create a tournament to group matches and track caps.</p>}
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: MatchRow["status"] }) {
  const label = status === "live" ? "Live" : status === "completed" ? "Completed" : "Upcoming";
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${status === "live" ? "bg-red-500 text-white" : status === "completed" ? "bg-white/20 text-white" : "bg-amber-300 text-stone-950"}`}>{label}</span>;
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function formatDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
