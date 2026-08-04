"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { chooseFeaturedMatch, formatRate, summarizeInnings, summarizePlayer, teamName, type DeliveryRow, type InningsRow, type MatchRow, type PlayerRow } from "@/lib/cricket/stats";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function HomeClient() {
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [innings, setInnings] = useState<InningsRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => { void load(); }, []);

  async function load() {
    try {
      const supabase = getSupabaseBrowserClient();
      const [matchResult, playerResult, inningsResult, deliveryResult] = await Promise.all([
        supabase.from("matches").select("*").order("match_date", { ascending: true }),
        supabase.from("players").select("*").order("name"),
        supabase.from("innings").select("*").order("innings_number"),
        supabase.from("deliveries").select("*").order("sequence_number"),
      ]);
      if (matchResult.error) throw matchResult.error;
      if (playerResult.error) throw playerResult.error;
      if (inningsResult.error) throw inningsResult.error;
      if (deliveryResult.error) throw deliveryResult.error;
      setMatches(matchResult.data ?? []);
      setPlayers(playerResult.data ?? []);
      setInnings(inningsResult.data ?? []);
      setDeliveries(deliveryResult.data ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load the home page.");
    } finally {
      setIsLoading(false);
    }
  }

  const featured = useMemo(() => chooseFeaturedMatch(matches), [matches]);
  const featuredInnings = featured ? innings.filter((item) => item.match_id === featured.id).sort((a, b) => b.innings_number - a.innings_number)[0] : null;
  const featuredScore = featuredInnings ? summarizeInnings(featuredInnings, deliveries, players) : null;
  const completedMatches = matches.filter((match) => match.status === "completed").sort((a, b) => b.match_date.localeCompare(a.match_date)).slice(0, 4);

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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {players.slice(0, 6).map((player) => {
            const stats = summarizePlayer(player.id, { players, innings, deliveries });
            return (
              <Link key={player.id} href={`/players/${player.id}`} className="rounded-lg border border-[var(--line)] bg-white p-4">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-full bg-emerald-100 font-bold text-[var(--brand-dark)]">{initials(player.name)}</span>
                  <div className="min-w-0">
                    <h3 className="truncate font-bold">{player.name}</h3>
                    <p className="text-xs capitalize text-[var(--muted)]">{player.batting_style.replaceAll("_", " ")} - {player.bowling_style.replaceAll("_", " ")}</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
                  <Stat label="Runs" value={stats.runs} />
                  <Stat label="Wkts" value={stats.wickets} />
                  <Stat label="SR" value={formatRate(stats.strikeRate)} />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Past Matches / Tournaments</h2>
          <Link href="/history" className="text-sm font-bold text-[var(--brand)]">History</Link>
        </div>
        <div className="space-y-3">
          {completedMatches.length ? completedMatches.map((match) => (
            <Link key={match.id} href={`/matches/${match.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--line)] bg-white p-4">
              <div>
                <h3 className="font-bold">{match.team_a_name} vs {match.team_b_name}</h3>
                <p className="mt-1 text-sm text-[var(--muted)]">{formatDate(match.match_date)} - {match.location}</p>
              </div>
              <span className="text-sm font-bold text-[var(--brand)]">Open</span>
            </Link>
          )) : <p className="rounded-lg border border-dashed border-[var(--line)] bg-white p-5 text-sm text-[var(--muted)]">Completed matches will appear here after your first result.</p>}
        </div>
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: MatchRow["status"] }) {
  const label = status === "live" ? "Live" : status === "completed" ? "Completed" : "Upcoming";
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${status === "live" ? "bg-red-500 text-white" : status === "completed" ? "bg-white/20 text-white" : "bg-amber-300 text-stone-950"}`}>{label}</span>;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-lg bg-stone-50 p-2"><p className="font-bold">{value}</p><p className="text-[11px] text-[var(--muted)]">{label}</p></div>;
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function formatDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
