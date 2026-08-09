"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { formatOvers, formatRate, oversAsNumber, summarizeInnings, teamName, type DeliveryRow, type InningsRow, type MatchRow, type PlayerRow } from "@/lib/cricket/stats";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type TournamentRow = { id: string; name: string; start_date: string | null; location: string | null; status: "active" | "completed"; created_at: string; updated_at: string };
type TournamentForm = { name: string; startDate: string; location: string };
type SquadRow = { match_id: string; player_id: string; team_side: "a" | "b"; is_captain: boolean; sort_order: number };
type CapTone = "orange" | "purple";
type CapDisplayRow = { id: string; rank: number; name: string; value: string; detail: string; isLeader: boolean };
type PerformanceRow = { id: string; rank: number; name: string; value: string; detail: string; isLeader: boolean };

const emptyForm: TournamentForm = { name: "", startDate: "", location: "" };

export function TournamentsClient() {
  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [squads, setSquads] = useState<SquadRow[]>([]);
  const [innings, setInnings] = useState<InningsRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => { void load(); }, []);

  async function load() {
    try {
      const supabase = getSupabaseBrowserClient();
      const [tournamentResult, matchResult, playerResult] = await Promise.all([
        supabase.from("tournaments").select("*").order("start_date", { ascending: false }),
        supabase.from("matches").select("*").not("tournament_id", "is", null).order("match_date", { ascending: false }),
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

      setTournaments(tournamentResult.data ?? []);
      setMatches(matchRows);
      setPlayers(playerResult.data ?? []);
      setSquads(squadRows);
      setInnings(inningsRows);
      setDeliveries(deliveryRows);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load tournaments.");
    } finally {
      setIsLoading(false);
    }
  }

  async function submitTournament(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim()) return;
    const { error } = await getSupabaseBrowserClient().from("tournaments").insert({
      name: form.name.trim(),
      start_date: form.startDate || null,
      location: form.location.trim() || null,
    });
    if (error) setMessage(error.message);
    else {
      setForm(emptyForm);
      setIsFormOpen(false);
      await load();
    }
  }

  if (isLoading) return <p className="text-sm text-[var(--muted)]">Loading tournaments...</p>;

  return (
    <section className="space-y-4">
      {message && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</p>}
      <div className="rounded-lg bg-white p-4 shadow-sm">
        <button onClick={() => setIsFormOpen(true)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-4 text-sm font-black text-white"><span aria-hidden>＋</span>Create Tournament</button>
      </div>
      {tournaments.length ? tournaments.map((tournament) => <TournamentCard key={tournament.id} tournament={tournament} matches={matches.filter((match) => match.tournament_id === tournament.id)} players={players} squads={squads} innings={innings} deliveries={deliveries} />) : <EmptyState title="No tournaments yet" description="Create a tournament, then attach matches to it from the New Match form." />}
      {isFormOpen && <div className="fixed inset-0 z-30 flex items-end bg-black/35 sm:items-center sm:justify-center sm:p-4"><form onSubmit={(event) => void submitTournament(event)} className="w-full rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-3xl"><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-bold">Create tournament</h2><button type="button" onClick={() => setIsFormOpen(false)} className="p-2 text-[var(--muted)]">Close</button></div><Field label="Tournament name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} placeholder="e.g. Summer Cup" /><Field label="Start date" type="date" value={form.startDate} onChange={(value) => setForm({ ...form, startDate: value })} required={false} /><Field label="Location" value={form.location} onChange={(value) => setForm({ ...form, location: value })} placeholder="Optional" required={false} /><button className="mt-6 min-h-11 w-full rounded-lg bg-[var(--brand)] text-sm font-bold text-white">Save tournament</button></form></div>}
    </section>
  );
}

function TournamentCard({ tournament, matches, players, squads, innings, deliveries }: { tournament: TournamentRow; matches: MatchRow[]; players: PlayerRow[]; squads: SquadRow[]; innings: InningsRow[]; deliveries: DeliveryRow[] }) {
  const leaders = useMemo(() => tournamentLeaders(matches, players, squads, innings, deliveries), [matches, players, squads, innings, deliveries]);
  return (
    <article className="rounded-lg border border-[var(--line)] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black">{tournament.name}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{tournament.location ?? "Tournament"}{tournament.start_date ? ` - ${formatDate(tournament.start_date)}` : ""}</p>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold capitalize text-[var(--brand)]">{tournament.status}</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <CapTable title="Orange cap" tone="orange" rows={leaders.batting.map((row, index) => ({ id: row.playerId, rank: index + 1, name: row.name, value: `${row.runs} runs`, detail: `SR ${formatRate(row.strikeRate)}`, isLeader: index === 0 }))} />
        <CapTable title="Purple cap" tone="purple" rows={leaders.bowling.map((row, index) => ({ id: row.playerId, rank: index + 1, name: row.name, value: `${row.wickets} wkts`, detail: `Econ ${formatRate(row.economy)}`, isLeader: index === 0 }))} />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <LeaderList title="Best batting average" rows={leaders.battingAverage.map((row, index) => ({ id: row.playerId, rank: index + 1, name: row.name, value: formatRate(row.average), detail: `${row.runs} runs / ${row.innings} innings`, isLeader: index === 0 }))} />
        <LeaderList title="Best economy" rows={leaders.bestEconomy.map((row, index) => ({ id: row.playerId, rank: index + 1, name: row.name, value: formatRate(row.economy), detail: `${formatOversLabel(row.legalBalls)} overs`, isLeader: index === 0 }))} />
        <LeaderList title="Most wins as captain" rows={leaders.captainWins.map((row, index) => ({ id: row.playerId, rank: index + 1, name: row.name, value: `${row.wins} win${row.wins === 1 ? "" : "s"}`, detail: "Winning captain", isLeader: index === 0 }))} />
        <LeaderList title="Most catches" rows={leaders.catches.map((row, index) => ({ id: row.playerId, rank: index + 1, name: row.name, value: `${row.catches} catch${row.catches === 1 ? "" : "es"}`, detail: "Fielding", isLeader: index === 0 }))} />
      </div>
      <TournamentRecords records={leaders.records} />
      <div className="mt-4 space-y-2">
        <h3 className="text-sm font-bold">Matches</h3>
        {matches.length ? matches.slice(0, 4).map((match) => <Link key={match.id} href={`/matches/${match.id}`} className="block rounded-lg bg-stone-50 p-3 text-sm font-semibold">{match.team_a_name} vs {match.team_b_name}<span className="ml-2 text-[var(--muted)]">{formatDate(match.match_date)}</span></Link>) : <p className="text-sm text-[var(--muted)]">No matches attached yet.</p>}
      </div>
    </article>
  );
}

function tournamentLeaders(matches: MatchRow[], players: PlayerRow[], squads: SquadRow[], inningsRows: InningsRow[], deliveries: DeliveryRow[]) {
  const matchIds = new Set(matches.map((match) => match.id));
  const matchById = new Map(matches.map((match) => [match.id, match]));
  const summaries = inningsRows.filter((innings) => matchIds.has(innings.match_id)).map((innings) => summarizeInnings(innings, deliveries, players));
  const playerNames = new Map(players.map((player) => [player.id, player.name]));
  const batting = new Map<string, { playerId: string; name: string; runs: number; balls: number; innings: number; strikeRate: number | null; average: number | null }>();
  const bowling = new Map<string, { playerId: string; name: string; wickets: number; runs: number; legalBalls: number; economy: number | null }>();
  const captainWins = new Map<string, { playerId: string; name: string; wins: number }>();
  const catches = new Map<string, { playerId: string; name: string; catches: number }>();
  const records = {
    mostRuns: [] as PerformanceRow[],
    bestStrikeRate: [] as PerformanceRow[],
    mostWickets: [] as PerformanceRow[],
    bestEconomy: [] as PerformanceRow[],
  };

  for (const summary of summaries) {
    const match = matchById.get(summary.innings.match_id);
    if (!match) continue;
    const team = teamName(match, summary.innings.batting_team_side);
    const matchDetail = `${formatDate(match.match_date)} - ${team}`;

    for (const batter of summary.batters) {
      const row = batting.get(batter.playerId) ?? { playerId: batter.playerId, name: batter.name, runs: 0, balls: 0, innings: 0, strikeRate: null, average: null };
      row.runs += batter.runs;
      row.balls += batter.balls;
      row.innings += 1;
      row.strikeRate = row.balls ? (row.runs * 100) / row.balls : null;
      row.average = row.innings ? row.runs / row.innings : null;
      batting.set(batter.playerId, row);

      records.mostRuns.push({
        id: `${summary.innings.id}-runs-${batter.playerId}`,
        rank: 0,
        name: `${batter.name}${batter.dismissed ? "" : "*"}`,
        value: `${batter.runs}`,
        detail: `${matchDetail} - ${batter.balls} ball${batter.balls === 1 ? "" : "s"}`,
        isLeader: false,
      });
      if (batter.strikeRate !== null && (batter.balls >= 10 || batter.runs > 20)) {
        records.bestStrikeRate.push({
          id: `${summary.innings.id}-sr-${batter.playerId}`,
          rank: 0,
          name: batter.name,
          value: formatRate(batter.strikeRate),
          detail: `${batter.runs} off ${batter.balls} - ${matchDetail}`,
          isLeader: false,
        });
      }
    }

    for (const bowler of summary.bowlers) {
      const row = bowling.get(bowler.playerId) ?? { playerId: bowler.playerId, name: bowler.name, wickets: 0, runs: 0, legalBalls: 0, economy: null };
      row.wickets += bowler.wickets;
      row.runs += bowler.runs;
      row.legalBalls += bowler.legalBalls;
      row.economy = row.legalBalls ? row.runs / oversAsNumber(row.legalBalls) : null;
      bowling.set(bowler.playerId, row);

      if (bowler.wickets > 0) {
        records.mostWickets.push({
          id: `${summary.innings.id}-wickets-${bowler.playerId}`,
          rank: 0,
          name: bowler.name,
          value: `${bowler.wickets}-${bowler.runs}`,
          detail: `${formatOversLabel(bowler.legalBalls)} overs - ${formatDate(match.match_date)} - ${teamName(match, oppositeSide(summary.innings.batting_team_side))}`,
          isLeader: false,
        });
      }
      if (bowler.legalBalls >= 12 && bowler.economy !== null) {
        records.bestEconomy.push({
          id: `${summary.innings.id}-econ-${bowler.playerId}`,
          rank: 0,
          name: bowler.name,
          value: formatRate(bowler.economy),
          detail: `${formatOversLabel(bowler.legalBalls)} overs, ${bowler.runs} runs - ${formatDate(match.match_date)} - ${teamName(match, oppositeSide(summary.innings.batting_team_side))}`,
          isLeader: false,
        });
      }
    }

    for (const delivery of summary.deliveries) {
      if (delivery.dismissal !== "caught" || !delivery.fielder_id) continue;
      const row = catches.get(delivery.fielder_id) ?? { playerId: delivery.fielder_id, name: playerNames.get(delivery.fielder_id) ?? "Unknown player", catches: 0 };
      row.catches += 1;
      catches.set(delivery.fielder_id, row);
    }
  }

  for (const match of matches) {
    if (match.status !== "completed" || !match.winner || match.winner === "Tie") continue;
    const winningSide = match.winner === match.team_a_name ? "a" : match.winner === match.team_b_name ? "b" : null;
    if (!winningSide) continue;
    const captains = squads.filter((row) => row.match_id === match.id && row.team_side === winningSide && row.is_captain);
    for (const captain of captains) {
      const row = captainWins.get(captain.player_id) ?? { playerId: captain.player_id, name: playerNames.get(captain.player_id) ?? "Unknown player", wins: 0 };
      row.wins += 1;
      captainWins.set(captain.player_id, row);
    }
  }

  const rankedRecords = {
    mostRuns: rankPerformances(records.mostRuns, (a, b) => Number.parseInt(b.value, 10) - Number.parseInt(a.value, 10)),
    bestStrikeRate: rankPerformances(records.bestStrikeRate, (a, b) => Number(b.value) - Number(a.value)),
    mostWickets: rankPerformances(records.mostWickets, (a, b) => Number.parseInt(b.value, 10) - Number.parseInt(a.value, 10)),
    bestEconomy: rankPerformances(records.bestEconomy, (a, b) => Number(a.value) - Number(b.value)),
  };

  return {
    batting: [...batting.values()].sort((a, b) => b.runs - a.runs || (b.strikeRate ?? 0) - (a.strikeRate ?? 0)).slice(0, 3),
    bowling: [...bowling.values()].sort((a, b) => b.wickets - a.wickets || (a.economy ?? 999) - (b.economy ?? 999)).slice(0, 3),
    battingAverage: [...batting.values()].filter((row) => row.innings > 0).sort((a, b) => (b.average ?? 0) - (a.average ?? 0) || b.runs - a.runs).slice(0, 3),
    bestEconomy: [...bowling.values()].filter((row) => row.legalBalls >= 12).sort((a, b) => (a.economy ?? 999) - (b.economy ?? 999) || b.wickets - a.wickets).slice(0, 3),
    captainWins: [...captainWins.values()].sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name)).slice(0, 3),
    catches: [...catches.values()].sort((a, b) => b.catches - a.catches || a.name.localeCompare(b.name)).slice(0, 3),
    records: rankedRecords,
  };
}

function rankPerformances(rows: PerformanceRow[], sortFn: (a: PerformanceRow, b: PerformanceRow) => number) {
  return [...rows]
    .sort((a, b) => sortFn(a, b) || a.name.localeCompare(b.name))
    .slice(0, 3)
    .map((row, index) => ({ ...row, rank: index + 1, isLeader: index === 0 }));
}

function LeaderList({ title, rows }: { title: string; rows: PerformanceRow[] }) {
  return (
    <section className="rounded-lg bg-stone-50 p-3">
      <h3 className="font-black">{title}</h3>
      <ul className="mt-2 space-y-2 text-sm">
        {rows.length ? rows.map((row) => <LeaderRow key={row.id} row={row} />) : <li className="text-[var(--muted)]">No data yet.</li>}
      </ul>
    </section>
  );
}

function TournamentRecords({ records }: { records: { mostRuns: PerformanceRow[]; bestStrikeRate: PerformanceRow[]; mostWickets: PerformanceRow[]; bestEconomy: PerformanceRow[] } }) {
  return (
    <section className="mt-4 rounded-lg border border-[var(--line)] p-3">
      <h3 className="font-black">Tournament records</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <LeaderList title="Most runs in a game" rows={records.mostRuns} />
        <LeaderList title="Best strike rate in a game" rows={records.bestStrikeRate} />
        <LeaderList title="Most wickets in a game" rows={records.mostWickets} />
        <LeaderList title="Best economy in a game" rows={records.bestEconomy} />
      </div>
    </section>
  );
}

function LeaderRow({ row }: { row: PerformanceRow }) {
  return (
    <li className={`flex items-center justify-between gap-3 rounded-lg p-2 ${row.isLeader ? "bg-white shadow-sm ring-2 ring-amber-200" : "bg-white/70"}`}>
      <span className="min-w-0">
        <span className="block truncate font-semibold">{row.rank}. {row.name}</span>
        <span className="block text-xs text-[var(--muted)]">{row.detail}</span>
      </span>
      <span className="shrink-0 text-right text-sm font-black text-[var(--brand)]">{row.value}</span>
    </li>
  );
}

function CapTable({ title, rows, tone }: { title: string; rows: CapDisplayRow[]; tone: CapTone }) {
  const toneClass = tone === "orange" ? "bg-orange-50 text-orange-800" : "bg-purple-50 text-purple-800";

  return (
    <section className={`rounded-lg p-3 ${toneClass}`}>
      <h3 className="font-black">{title}</h3>
      <ul className="mt-2 space-y-2 text-sm">
        {rows.length ? rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="shrink-0 font-bold">{row.rank}.</span>
              <span className="truncate font-semibold">{row.name}</span>
              {row.isLeader && <CapIcon tone={tone} />}
            </span>
            <span className="shrink-0 text-right text-xs font-bold">
              {row.value}
              <span className="block font-semibold opacity-75">{row.detail}</span>
            </span>
          </li>
        )) : <li>No data yet.</li>}
      </ul>
    </section>
  );
}

function CapIcon({ tone }: { tone: CapTone }) {
  const src = tone === "orange" ? "/images/cap-orange.png" : "/images/cap-purple.png";

  return (
    <Image
      src={src}
      alt=""
      aria-hidden="true"
      width={28}
      height={22}
      className="h-5 w-6 shrink-0 object-contain"
      title={`${tone} cap leader`}
    />
  );
}

function Field({ label, value, onChange, type = "text", placeholder, required = true }: { label: string; value: string; onChange: (value: string) => void; type?: "text" | "date"; placeholder?: string; required?: boolean }) {
  return <label className="mt-4 block text-sm font-semibold">{label}<input required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-1.5 min-h-11 w-full rounded-lg border border-[var(--line)] px-3 font-normal" /></label>;
}

function formatDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatOversLabel(legalBalls: number) {
  return formatOvers(legalBalls);
}

function oppositeSide(side: "a" | "b") {
  return side === "a" ? "b" : "a";
}
