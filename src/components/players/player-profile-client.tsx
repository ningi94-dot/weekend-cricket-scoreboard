"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { formatOvers, formatRate, summarizePlayer, type DeliveryRow, type InningsRow, type MatchRow, type PlayerRow } from "@/lib/cricket/stats";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Tab = "overview" | "statistics" | "matches";
const tabs: { id: Tab; label: string }[] = [{ id: "overview", label: "Overview" }, { id: "statistics", label: "Statistics" }, { id: "matches", label: "Matches" }];

export function PlayerProfileClient({ playerId }: { playerId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedTab = (searchParams.get("tab") ?? "overview") as Tab;
  const [player, setPlayer] = useState<PlayerRow | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [innings, setInnings] = useState<InningsRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function load() {
    try {
      const supabase = getSupabaseBrowserClient();
      const [playerResult, allPlayersResult, matchResult, inningsResult, deliveryResult] = await Promise.all([
        supabase.from("players").select("*").eq("id", playerId).single(),
        supabase.from("players").select("*"),
        supabase.from("matches").select("*").order("match_date", { ascending: false }),
        supabase.from("innings").select("*"),
        supabase.from("deliveries").select("*").order("sequence_number"),
      ]);
      if (playerResult.error) throw playerResult.error;
      if (allPlayersResult.error) throw allPlayersResult.error;
      if (matchResult.error) throw matchResult.error;
      if (inningsResult.error) throw inningsResult.error;
      if (deliveryResult.error) throw deliveryResult.error;
      setPlayer(playerResult.data);
      setPlayers(allPlayersResult.data ?? []);
      setMatches(matchResult.data ?? []);
      setInnings(inningsResult.data ?? []);
      setDeliveries(deliveryResult.data ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load player profile.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [playerId]);

  const stats = useMemo(() => summarizePlayer(playerId, { players, innings, deliveries }), [playerId, players, innings, deliveries]);
  const playedMatchIds = new Set(innings.filter((item) => deliveries.some((delivery) => delivery.innings_id === item.id && (delivery.striker_id === playerId || delivery.non_striker_id === playerId || delivery.bowler_id === playerId || delivery.fielder_id === playerId))).map((item) => item.match_id));
  const playedMatches = matches.filter((match) => playedMatchIds.has(match.id));

  if (isLoading) return <p className="text-sm text-[var(--muted)]">Loading player profile...</p>;
  if (!player) return <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{message || "Player not found."}</p>;

  return (
    <section className="space-y-4">
      <Link href="/players" className="text-sm font-bold text-[var(--brand)]">Back to players</Link>
      {message && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</p>}
      <header className="rounded-lg bg-white p-5 text-center shadow-sm">
        <span className="mx-auto grid size-20 place-items-center rounded-full bg-emerald-100 text-2xl font-black text-[var(--brand-dark)]">{initials(player.name)}</span>
        <h1 className="mt-3 text-2xl font-bold">{player.name}</h1>
        <p className="mt-1 text-sm capitalize text-[var(--muted)]">{player.player_type ? `${player.player_type} player - ` : "Unspecified player - "}{player.batting_style.replaceAll("_", " ")} - {player.bowling_style.replaceAll("_", " ")}</p>
      </header>
      <div className="flex gap-2 overflow-x-auto border-b border-[var(--line)] pb-2">
        {tabs.map((tab) => <button key={tab.id} onClick={() => router.push(`/players/${playerId}?tab=${tab.id}`)} className={`min-h-10 shrink-0 rounded-lg px-3 text-sm font-bold ${selectedTab === tab.id ? "bg-[var(--brand)] text-white" : "bg-white text-[var(--muted)]"}`}>{tab.label}</button>)}
      </div>
      {selectedTab === "overview" && <Overview stats={stats} />}
      {selectedTab === "statistics" && <Statistics stats={stats} />}
      {selectedTab === "matches" && <Matches matches={playedMatches} />}
    </section>
  );
}

function Overview({ stats }: { stats: ReturnType<typeof summarizePlayer> }) {
  return <div className="space-y-4"><div className="grid grid-cols-3 gap-3"><ColorCard title="Batting" value={stats.runs} label="Runs" tone="bg-rose-100" /><ColorCard title="Bowling" value={stats.wickets} label="Wickets" tone="bg-emerald-100" /><ColorCard title="Fielding" value={stats.fieldingDismissals} label="Dismissals" tone="bg-sky-100" /></div><section className="rounded-lg bg-white p-4"><h2 className="font-bold">Recent form</h2><p className="mt-2 text-sm text-[var(--muted)]">Recent performance chips will appear after several scored matches.</p></section></div>;
}

function Statistics({ stats }: { stats: ReturnType<typeof summarizePlayer> }) {
  return <div className="space-y-4"><StatSection title="Batting" rows={[["Matches", stats.matches], ["Innings", stats.innings], ["Runs", stats.runs], ["Balls", stats.balls], ["Highest Score", `${stats.highest.runs}${stats.highest.notOut ? "*" : ""}`], ["Average", formatRate(stats.average)], ["Strike Rate", formatRate(stats.strikeRate)], ["Not Outs", stats.notOuts], ["4s", stats.fours], ["6s", stats.sixes]]} /><StatSection title="Bowling" rows={[["Innings", stats.bowlingInnings], ["Balls", stats.bowlingBalls], ["Overs", formatOvers(stats.bowlingBalls)], ["Runs Conceded", stats.runsConceded], ["Extras Conceded", stats.extrasConceded], ["Wide Deliveries", stats.wideDeliveries], ["Wide Runs", stats.wideRuns], ["No-ball Deliveries", stats.noBallDeliveries], ["No-ball Runs", stats.noBallRuns], ["Wickets", stats.wickets], ["Bowling Average", formatRate(stats.bowlingAverage)], ["Economy", formatRate(stats.economy)], ["Bowling Strike Rate", formatRate(stats.bowlingStrikeRate)], ["Best Bowling", stats.bestBowling ? `${stats.bestBowling.wickets}-${stats.bestBowling.runs}` : "-"]]} /><StatSection title="Fielding" rows={[["Catches", stats.catches], ["Stumpings", stats.stumpings], ["Run-outs", stats.runOuts]]} /></div>;
}

function Matches({ matches }: { matches: MatchRow[] }) {
  return <div className="space-y-3">{matches.length ? matches.map((match) => <Link key={match.id} href={`/matches/${match.id}`} className="block rounded-lg border border-[var(--line)] bg-white p-4"><h2 className="font-bold">{match.team_a_name} vs {match.team_b_name}</h2><p className="mt-1 text-sm text-[var(--muted)]">{formatDate(match.match_date)} - {match.location}</p></Link>) : <p className="rounded-lg border border-dashed border-[var(--line)] bg-white p-5 text-sm text-[var(--muted)]">This player has not appeared in a scored match yet.</p>}</div>;
}

function ColorCard({ title, value, label, tone }: { title: string; value: string | number; label: string; tone: string }) {
  return <div className={`rounded-lg p-4 text-center ${tone}`}><p className="text-xs font-bold uppercase tracking-[0.12em] text-stone-700">{title}</p><p className="mt-3 text-2xl font-black">{value}</p><p className="text-xs text-stone-700">{label}</p></div>;
}

function StatSection({ title, rows }: { title: string; rows: (string | number)[][] }) {
  return <section className="rounded-lg bg-white p-4"><h2 className="font-bold">{title}</h2><dl className="mt-3 grid grid-cols-2 gap-3 text-sm">{rows.map(([label, value]) => <div key={String(label)} className="rounded-lg bg-stone-50 p-3"><dt className="text-xs text-[var(--muted)]">{label}</dt><dd className="mt-1 font-bold">{value}</dd></div>)}</dl></section>;
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function formatDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
