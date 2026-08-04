"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { deliveryLabel, deliveryRuns, formatOvers, formatRate, summarizeInnings, teamName, type DeliveryRow, type InningsRow, type MatchRow, type PlayerRow } from "@/lib/cricket/stats";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type SquadRow = { match_id: string; player_id: string; team_side: "a" | "b"; is_captain: boolean };
type Tab = "summary" | "scorecard" | "stats" | "balls" | "info" | "record";

const tabs: { id: Tab; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "scorecard", label: "Scorecard" },
  { id: "stats", label: "Stats" },
  { id: "balls", label: "Balls" },
  { id: "info", label: "Info" },
  { id: "record", label: "Record Score" },
];

export function MatchCenterClient({ matchId }: { matchId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedTab = (searchParams.get("tab") ?? "summary") as Tab;
  const [match, setMatch] = useState<MatchRow | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [squads, setSquads] = useState<SquadRow[]>([]);
  const [innings, setInnings] = useState<InningsRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => { void load(); }, [matchId]);

  async function load() {
    try {
      const supabase = getSupabaseBrowserClient();
      const [matchResult, playerResult, squadResult, inningsResult, deliveryResult] = await Promise.all([
        supabase.from("matches").select("*").eq("id", matchId).single(),
        supabase.from("players").select("*").order("name"),
        supabase.from("match_squads").select("*").eq("match_id", matchId),
        supabase.from("innings").select("*").eq("match_id", matchId).order("innings_number"),
        supabase.from("deliveries").select("*").order("sequence_number"),
      ]);
      if (matchResult.error) throw matchResult.error;
      if (playerResult.error) throw playerResult.error;
      if (squadResult.error) throw squadResult.error;
      if (inningsResult.error) throw inningsResult.error;
      if (deliveryResult.error) throw deliveryResult.error;
      setMatch(matchResult.data);
      setPlayers(playerResult.data ?? []);
      setSquads(squadResult.data ?? []);
      setInnings(inningsResult.data ?? []);
      setDeliveries((deliveryResult.data ?? []).filter((delivery) => (inningsResult.data ?? []).some((item) => item.id === delivery.innings_id)));
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load match center.");
    } finally {
      setIsLoading(false);
    }
  }

  const summaries = useMemo(() => innings.map((item) => summarizeInnings(item, deliveries, players)), [innings, deliveries, players]);
  const current = summaries.find((summary) => summary.innings.status === "in_progress") ?? summaries.at(-1) ?? null;

  function setTab(tab: Tab) {
    router.push(`/matches/${matchId}?tab=${tab}`);
  }

  if (isLoading) return <p className="text-sm text-[var(--muted)]">Loading match center...</p>;
  if (!match) return <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{message || "Match not found."}</p>;

  return (
    <section className="space-y-4">
      <Link href="/matches" className="text-sm font-bold text-[var(--brand)]">Back to matches</Link>
      {message && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</p>}
      <div className="rounded-lg bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--brand)]">Match Centre</p>
            <h1 className="mt-1 text-2xl font-bold">{match.team_a_name} vs {match.team_b_name}</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">{formatDate(match.match_date)} - {match.location}</p>
          </div>
          <StatusPill status={match.status} />
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto border-b border-[var(--line)] pb-2">
        {tabs.map((tab) => (
          <button key={tab.id} onClick={() => setTab(tab.id)} className={`min-h-10 shrink-0 rounded-lg px-3 text-sm font-bold ${selectedTab === tab.id ? "bg-[var(--brand)] text-white" : "bg-white text-[var(--muted)]"}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {selectedTab === "summary" && <SummaryTab match={match} current={current} />}
      {selectedTab === "scorecard" && <ScorecardTab match={match} summaries={summaries} />}
      {selectedTab === "stats" && <StatsTab summaries={summaries} />}
      {selectedTab === "balls" && <BallsTab summaries={summaries} players={players} />}
      {selectedTab === "info" && <InfoTab match={match} squads={squads} players={players} onChanged={load} />}
      {selectedTab === "record" && <RecordScoreTab match={match} players={players} squads={squads} summaries={summaries} innings={innings} onChanged={load} />}
    </section>
  );
}

function SummaryTab({ match, current }: { match: MatchRow; current: ReturnType<typeof summarizeInnings> | null }) {
  if (!current) return <EmptyPanel title="No score yet" text="Start the match from Record Score to create the first innings." />;
  const target = current.innings.target_runs;
  const required = target ? Math.max(0, target - current.runs) : null;
  return (
    <div className="space-y-4">
      <section className="rounded-lg bg-[var(--brand-dark)] p-5 text-white">
        <p className="text-center text-sm font-bold text-amber-200">{teamName(match, current.innings.batting_team_side)}</p>
        <p className="mt-1 text-center text-xs text-emerald-50">{ordinal(current.innings.innings_number)} innings</p>
        <p className="mt-2 text-center text-5xl font-black">{current.runs}-{current.wickets}</p>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
          <MiniMetric label="Overs" value={`${current.overs}/${match.overs_per_innings}`} />
          <MiniMetric label="CRR" value={formatRate(current.runRate)} />
          <MiniMetric label="Extras" value={current.extras.total} />
        </div>
        {target && <p className="mt-4 text-center text-sm font-bold">Target {target} - Need {required} runs</p>}
      </section>
      <FigureTable title="Batting" columns={["Batter", "R", "B", "4s", "6s", "SR"]} rows={current.batters.map((batter) => [batter.dismissed ? batter.name : `${batter.name} *`, batter.runs, batter.balls, batter.fours, batter.sixes, formatRate(batter.strikeRate)])} />
      <FigureTable title="Bowling" columns={["Bowler", "O", "M", "R", "W", "Econ"]} rows={current.bowlers.map((bowler) => [bowler.name, formatOvers(bowler.legalBalls), bowler.maidens, bowler.runs, bowler.wickets, formatRate(bowler.economy)])} />
      <OverBreakdown overs={current.oversBreakdown} />
    </div>
  );
}

function ScorecardTab({ match, summaries }: { match: MatchRow; summaries: ReturnType<typeof summarizeInnings>[] }) {
  const [side, setSide] = useState<"a" | "b">("a");
  const summary = summaries.find((item) => item.innings.batting_team_side === side);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {(["a", "b"] as const).map((item) => <button key={item} onClick={() => setSide(item)} className={`min-h-10 rounded-lg text-sm font-bold ${side === item ? "bg-[var(--brand)] text-white" : "bg-white text-[var(--muted)]"}`}>{teamName(match, item)}</button>)}
      </div>
      {!summary ? <EmptyPanel title="Innings not started" text="This team's innings has not been recorded yet." /> : (
        <>
          <FigureTable title="Batting scorecard" columns={["Batter", "Dismissal", "R", "B", "4s", "6s", "SR"]} rows={summary.batters.map((batter) => [batter.name, batter.dismissalText, batter.runs, batter.balls, batter.fours, batter.sixes, formatRate(batter.strikeRate)])} />
          <div className="rounded-lg bg-white p-4 text-sm">
            <p><strong>Extras:</strong> {summary.extras.total} (wd {summary.extras.wides}, nb {summary.extras.noBalls}, b {summary.extras.byes}, lb {summary.extras.legByes})</p>
            <p className="mt-1"><strong>Total:</strong> {summary.runs}-{summary.wickets} in {summary.overs} overs - RR {formatRate(summary.runRate)}</p>
          </div>
          <FigureTable title="Bowling figures" columns={["Bowler", "O", "M", "R", "W", "Econ"]} rows={summary.bowlers.map((bowler) => [bowler.name, formatOvers(bowler.legalBalls), bowler.maidens, bowler.runs, bowler.wickets, formatRate(bowler.economy)])} />
          <ListPanel title="Fall of wickets" items={summary.fallOfWickets} empty="No wickets have fallen." />
          <ListPanel title="Partnerships" items={[]} empty="Partnership detail will improve as wicket and new-batter workflows mature." />
        </>
      )}
    </div>
  );
}

function StatsTab({ summaries }: { summaries: ReturnType<typeof summarizeInnings>[] }) {
  const batters = summaries.flatMap((summary) => summary.batters);
  const bowlers = summaries.flatMap((summary) => summary.bowlers);
  const topRuns = [...batters].sort((a, b) => b.runs - a.runs).slice(0, 5).map((batter) => `${batter.name} - ${batter.runs}`);
  const topStrike = batters.filter((batter) => batter.balls >= 5).sort((a, b) => (b.strikeRate ?? 0) - (a.strikeRate ?? 0)).slice(0, 5).map((batter) => `${batter.name} - ${formatRate(batter.strikeRate)}`);
  const wickets = [...bowlers].sort((a, b) => b.wickets - a.wickets || a.runs - b.runs).slice(0, 5).map((bowler) => `${bowler.name} - ${bowler.wickets}/${bowler.runs}`);
  const economy = bowlers.filter((bowler) => bowler.legalBalls >= 6).sort((a, b) => (a.economy ?? 99) - (b.economy ?? 99)).slice(0, 5).map((bowler) => `${bowler.name} - ${formatRate(bowler.economy)}`);
  return <div className="grid gap-3 sm:grid-cols-2"><ListPanel title="Top run scorers" items={topRuns} empty="No batting data yet." /><ListPanel title="Highest strike rates" items={topStrike} empty="Need at least five balls faced." /><ListPanel title="Leading wicket takers" items={wickets} empty="No wickets yet." /><ListPanel title="Best economy" items={economy} empty="Need at least one over bowled." /></div>;
}

function BallsTab({ summaries, players }: { summaries: ReturnType<typeof summarizeInnings>[]; players: PlayerRow[] }) {
  const [inningsId, setInningsId] = useState(summaries[0]?.innings.id ?? "");
  const summary = summaries.find((item) => item.innings.id === inningsId) ?? summaries[0];
  const names = new Map(players.map((player) => [player.id, player.name]));
  if (!summary) return <EmptyPanel title="No balls recorded" text="Ball-by-ball detail appears here once scoring begins." />;
  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto">
        {summaries.map((item) => <button key={item.innings.id} onClick={() => setInningsId(item.innings.id)} className={`min-h-10 shrink-0 rounded-lg px-3 text-sm font-bold ${summary.innings.id === item.innings.id ? "bg-[var(--brand)] text-white" : "bg-white text-[var(--muted)]"}`}>{ordinal(item.innings.innings_number)} Innings</button>)}
      </div>
      {summary.oversBreakdown.map((over) => (
        <section key={over.overNumber} className="rounded-lg bg-white p-4">
          <div className="mb-3 flex items-center justify-between"><h3 className="font-bold">Over {over.overNumber + 1}</h3><span className="text-sm text-[var(--muted)]">{over.runs} runs - {over.scoreAfterOver}</span></div>
          <div className="space-y-2">
            {summary.deliveries.filter((delivery) => delivery.over_number === over.overNumber).map((delivery) => (
              <div key={delivery.id} className="rounded-lg border border-[var(--line)] p-3 text-sm">
                <p className="font-bold">{delivery.over_number}.{delivery.ball_in_over} - {deliveryLabel(delivery)} ({deliveryRuns(delivery)} run{deliveryRuns(delivery) === 1 ? "" : "s"})</p>
                <p className="mt-1 text-[var(--muted)]">{names.get(delivery.bowler_id)} to {names.get(delivery.striker_id)}</p>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function InfoTab({ match, squads, players, onChanged }: { match: MatchRow; squads: SquadRow[]; players: PlayerRow[]; onChanged: () => Promise<void> }) {
  const [isScorer, setIsScorer] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { fetch("/api/scorer/me").then((res) => res.json()).then((data) => setIsScorer(Boolean(data.isScorer))).catch(() => setIsScorer(false)); }, []);
  const names = new Map(players.map((player) => [player.id, player.name]));
  async function deleteMatch() {
    const warning = match.status === "live" ? "This is a live match. Type OK in the next confirmation to delete it." : "Delete this match and its score data?";
    if (!window.confirm(warning)) return;
    const response = await fetch(`/api/matches/${match.id}`, { method: "DELETE", body: JSON.stringify({ confirmLive: match.status === "live" }) });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setMessage(body?.message ?? "Unable to delete match.");
      return;
    }
    window.location.href = "/matches";
  }
  return (
    <div className="space-y-4">
      {message && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</p>}
      <section className="rounded-lg bg-white p-4">
        <h2 className="font-bold">Match Info</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <InfoItem label="Team A" value={match.team_a_name} />
          <InfoItem label="Team B" value={match.team_b_name} />
          <InfoItem label="Date" value={formatDate(match.match_date)} />
          <InfoItem label="Start" value={match.start_time?.slice(0, 5) ?? "-"} />
          <InfoItem label="Venue" value={match.location} />
          <InfoItem label="Overs" value={match.overs_per_innings} />
          <InfoItem label="Status" value={match.status} />
          <InfoItem label="Toss" value={match.toss_winner ? `${match.toss_winner} chose ${match.toss_decision}` : "-"} />
        </dl>
      </section>
      <section className="rounded-lg bg-white p-4">
        <div className="flex items-center justify-between"><h2 className="font-bold">Squads</h2><Link href={`/matches/${match.id}/teams`} className="text-sm font-bold text-[var(--brand)]">Edit teams</Link></div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(["a", "b"] as const).map((side) => <div key={side} className="rounded-lg border border-[var(--line)] p-3"><h3 className="font-bold">{teamName(match, side)}</h3><ul className="mt-2 space-y-1 text-sm text-[var(--muted)]">{squads.filter((row) => row.team_side === side).map((row) => <li key={row.player_id}>{names.get(row.player_id) ?? "Unknown"}{row.is_captain ? " (C)" : ""}</li>)}</ul></div>)}
        </div>
      </section>
      {isScorer && <button onClick={() => void deleteMatch()} className="min-h-11 w-full rounded-lg border border-red-200 bg-red-50 text-sm font-bold text-red-700">Delete test/dummy match</button>}
      <button onClick={() => void onChanged()} className="min-h-10 w-full rounded-lg border border-[var(--line)] bg-white text-sm font-bold text-[var(--brand)]">Refresh match data</button>
    </div>
  );
}

function RecordScoreTab({ match, players, squads, summaries, innings, onChanged }: { match: MatchRow; players: PlayerRow[]; squads: SquadRow[]; summaries: ReturnType<typeof summarizeInnings>[]; innings: InningsRow[]; onChanged: () => Promise<void> }) {
  const [isScorer, setIsScorer] = useState(false);
  const [username, setUsername] = useState("Umpire");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const currentInnings = innings.find((item) => item.status === "in_progress");
  const currentSummary = summaries.find((summary) => summary.innings.id === currentInnings?.id) ?? null;

  useEffect(() => { fetch("/api/scorer/me").then((res) => res.json()).then((data) => setIsScorer(Boolean(data.isScorer))).catch(() => setIsScorer(false)); }, []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/scorer/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) });
    const body = await response.json().catch(() => null);
    if (!response.ok) setMessage(body?.message ?? "Unable to sign in.");
    else { setIsScorer(true); setPassword(""); setMessage(""); }
  }

  if (!isScorer) {
    return (
      <form onSubmit={(event) => void login(event)} className="rounded-lg bg-white p-4">
        <h2 className="text-lg font-bold">Scorer login</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">Public scorecards stay open. Recording is protected for the umpire/scorer.</p>
        {message && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</p>}
        <label className="mt-4 block text-sm font-semibold">Username<input value={username} onChange={(event) => setUsername(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] px-3 font-normal" /></label>
        <label className="mt-4 block text-sm font-semibold">Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] px-3 font-normal" /></label>
        <button className="mt-5 min-h-11 w-full rounded-lg bg-[var(--brand)] text-sm font-bold text-white">Enter scorer mode</button>
      </form>
    );
  }

  if (match.status === "upcoming") return <StartMatchForm match={match} players={players} squads={squads} onChanged={onChanged} />;
  if (!currentInnings || !currentSummary) return <EmptyPanel title="No live innings" text="This match is not currently ready for delivery recording." />;
  return <ScoringPanel match={match} players={players} squads={squads} innings={currentInnings} summary={currentSummary} onChanged={onChanged} />;
}

function StartMatchForm({ match, players, squads, onChanged }: { match: MatchRow; players: PlayerRow[]; squads: SquadRow[]; onChanged: () => Promise<void> }) {
  const teamA = squads.filter((row) => row.team_side === "a");
  const teamB = squads.filter((row) => row.team_side === "b");
  const [battingSide, setBattingSide] = useState<"a" | "b">("a");
  const battingPlayers = battingSide === "a" ? teamA : teamB;
  const bowlingPlayers = battingSide === "a" ? teamB : teamA;
  const [strikerId, setStrikerId] = useState("");
  const [nonStrikerId, setNonStrikerId] = useState("");
  const [bowlerId, setBowlerId] = useState("");
  const [message, setMessage] = useState("");
  const names = new Map(players.map((player) => [player.id, player.name]));

  useEffect(() => {
    setStrikerId(battingPlayers[0]?.player_id ?? "");
    setNonStrikerId(battingPlayers[1]?.player_id ?? "");
    setBowlerId(bowlingPlayers[0]?.player_id ?? "");
  }, [battingSide, squads.length]);

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch(`/api/matches/${match.id}/start`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ battingSide, strikerId, nonStrikerId, bowlerId }) });
    const body = await response.json().catch(() => null);
    if (!response.ok) setMessage(body?.message ?? "Unable to start match.");
    else await onChanged();
  }

  return (
    <form onSubmit={(event) => void start(event)} className="space-y-4 rounded-lg bg-white p-4">
      <h2 className="text-lg font-bold">Start Match</h2>
      {message && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</p>}
      <label className="block text-sm font-semibold">Batting team<select value={battingSide} onChange={(event) => setBattingSide(event.target.value as "a" | "b")} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 font-normal"><option value="a">{match.team_a_name}</option><option value="b">{match.team_b_name}</option></select></label>
      <PlayerSelect label="Striker" value={strikerId} rows={battingPlayers} names={names} onChange={setStrikerId} />
      <PlayerSelect label="Non-striker" value={nonStrikerId} rows={battingPlayers} names={names} onChange={setNonStrikerId} />
      <PlayerSelect label="Opening bowler" value={bowlerId} rows={bowlingPlayers} names={names} onChange={setBowlerId} />
      <button className="min-h-12 w-full rounded-lg bg-[var(--brand)] text-sm font-bold text-white">Start and record first ball</button>
    </form>
  );
}

function ScoringPanel({ match, players, squads, innings, summary, onChanged }: { match: MatchRow; players: PlayerRow[]; squads: SquadRow[]; innings: InningsRow; summary: ReturnType<typeof summarizeInnings>; onChanged: () => Promise<void> }) {
  const names = new Map(players.map((player) => [player.id, player.name]));
  const battingRows = squads.filter((row) => row.team_side === innings.batting_team_side);
  const bowlingRows = squads.filter((row) => row.team_side !== innings.batting_team_side);
  const [strikerId, setStrikerId] = useState(innings.striker_id ?? "");
  const [nonStrikerId, setNonStrikerId] = useState(innings.non_striker_id ?? "");
  const [bowlerId, setBowlerId] = useState(innings.bowler_id ?? "");
  const [extraType, setExtraType] = useState<"" | "wide" | "no_ball" | "bye" | "leg_bye">("");
  const [wicket, setWicket] = useState(false);
  const [dismissal, setDismissal] = useState("bowled");
  const [dismissedPlayerId, setDismissedPlayerId] = useState(strikerId);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setStrikerId(innings.striker_id ?? "");
    setNonStrikerId(innings.non_striker_id ?? "");
    setBowlerId(innings.bowler_id ?? "");
    setDismissedPlayerId(innings.striker_id ?? "");
  }, [innings.id, innings.striker_id, innings.non_striker_id, innings.bowler_id]);

  async function record(runs: number) {
    const response = await fetch(`/api/matches/${match.id}/record`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ batterRuns: runs, extraType: extraType || undefined, extraRuns: extraType ? 1 : 0, isWicket: wicket, dismissal, dismissedPlayerId, strikerId, nonStrikerId, bowlerId }) });
    const body = await response.json().catch(() => null);
    if (!response.ok) setMessage(body?.message ?? "Unable to record delivery.");
    else {
      setExtraType("");
      setWicket(false);
      setMessage(body?.inningsComplete ? "Delivery saved. Innings complete." : "Delivery saved.");
      await onChanged();
    }
  }

  async function undo() {
    if (!window.confirm("Undo the latest delivery?")) return;
    const response = await fetch(`/api/matches/${match.id}/undo`, { method: "POST" });
    const body = await response.json().catch(() => null);
    if (!response.ok) setMessage(body?.message ?? "Unable to undo delivery.");
    else { setMessage("Latest delivery undone."); await onChanged(); }
  }

  return (
    <div className="space-y-4">
      {message && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-[var(--brand-dark)]">{message}</p>}
      <section className="rounded-lg bg-[var(--brand-dark)] p-5 text-white">
        <p className="text-sm font-bold text-amber-200">{teamName(match, innings.batting_team_side)}, {ordinal(innings.innings_number)} innings</p>
        <p className="mt-2 text-5xl font-black">{summary.runs}-{summary.wickets}</p>
        <p className="mt-1 text-sm text-emerald-50">Overs {summary.overs}/{match.overs_per_innings} - CRR {formatRate(summary.runRate)}</p>
      </section>
      <section className="rounded-lg bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <PlayerSelect label="Striker" value={strikerId} rows={battingRows} names={names} onChange={setStrikerId} />
          <PlayerSelect label="Non-striker" value={nonStrikerId} rows={battingRows} names={names} onChange={setNonStrikerId} />
          <PlayerSelect label="Bowler" value={bowlerId} rows={bowlingRows} names={names} onChange={setBowlerId} />
        </div>
      </section>
      <section className="rounded-lg bg-white p-4">
        <div className="mb-4 flex flex-wrap gap-2">
          {(["wide", "no_ball", "bye", "leg_bye"] as const).map((type) => <button key={type} onClick={() => setExtraType(extraType === type ? "" : type)} className={`min-h-10 rounded-lg px-3 text-sm font-bold capitalize ${extraType === type ? "bg-[var(--brand)] text-white" : "border border-[var(--line)]"}`}>{type.replace("_", " ")}</button>)}
          <button onClick={() => setWicket(!wicket)} className={`min-h-10 rounded-lg px-3 text-sm font-bold ${wicket ? "bg-red-600 text-white" : "border border-[var(--line)] text-red-700"}`}>Wicket</button>
        </div>
        {wicket && <div className="mb-4 grid gap-3 sm:grid-cols-2"><PlayerSelect label="Dismissed batter" value={dismissedPlayerId} rows={battingRows} names={names} onChange={setDismissedPlayerId} /><label className="block text-sm font-semibold">Dismissal<select value={dismissal} onChange={(event) => setDismissal(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 font-normal">{["bowled", "caught", "lbw", "run_out", "stumped", "hit_wicket", "retired_hurt"].map((kind) => <option key={kind} value={kind}>{kind.replace("_", " ")}</option>)}</select></label></div>}
        <div className="grid grid-cols-4 gap-3">
          {[0, 1, 2, 3, 4, 5, 6].map((runs) => <button key={runs} onClick={() => void record(runs)} className="aspect-square rounded-full border-2 border-[var(--brand)] text-lg font-black text-[var(--brand)]">{runs}</button>)}
          <button onClick={() => void undo()} className="aspect-square rounded-full bg-stone-900 text-xs font-bold text-white">Undo</button>
        </div>
      </section>
    </div>
  );
}

function PlayerSelect({ label, value, rows, names, onChange }: { label: string; value: string; rows: SquadRow[]; names: Map<string, string>; onChange: (value: string) => void }) {
  return <label className="block text-sm font-semibold">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 font-normal">{rows.map((row) => <option key={row.player_id} value={row.player_id}>{names.get(row.player_id) ?? "Unknown player"}</option>)}</select></label>;
}

function FigureTable({ title, columns, rows }: { title: string; columns: string[]; rows: (string | number)[][] }) {
  return <section className="overflow-x-auto rounded-lg bg-white p-4"><h2 className="mb-3 font-bold">{title}</h2><table className="w-full min-w-[520px] text-left text-sm"><thead><tr className="border-b border-[var(--line)] text-[var(--muted)]">{columns.map((column) => <th key={column} className="py-2 pr-3 font-bold">{column}</th>)}</tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={index} className="border-b border-[var(--line)] last:border-0">{row.map((cell, cellIndex) => <td key={cellIndex} className="py-2 pr-3">{cell}</td>)}</tr>) : <tr><td colSpan={columns.length} className="py-4 text-[var(--muted)]">No data yet.</td></tr>}</tbody></table></section>;
}

function OverBreakdown({ overs }: { overs: { overNumber: number; labels: string[]; runs: number; wickets: number; scoreAfterOver: string }[] }) {
  return <section className="rounded-lg bg-white p-4"><h2 className="font-bold">Overs</h2><div className="mt-3 space-y-3">{overs.length ? overs.map((over) => <div key={over.overNumber} className="rounded-lg border border-[var(--line)] p-3"><div className="mb-2 flex items-center justify-between text-sm"><strong>Over {over.overNumber + 1}</strong><span>{over.runs} runs - {over.scoreAfterOver}</span></div><div className="flex flex-wrap gap-2">{over.labels.map((label, index) => <span key={`${label}-${index}`} className="grid size-9 place-items-center rounded-full border border-emerald-200 bg-emerald-50 text-sm font-bold text-[var(--brand)]">{label}</span>)}</div></div>) : <p className="text-sm text-[var(--muted)]">No overs yet.</p>}</div></section>;
}

function ListPanel({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return <section className="rounded-lg bg-white p-4"><h2 className="font-bold">{title}</h2><ul className="mt-3 space-y-2 text-sm">{items.length ? items.map((item) => <li key={item} className="rounded-lg bg-stone-50 p-2">{item}</li>) : <li className="text-[var(--muted)]">{empty}</li>}</ul></section>;
}

function EmptyPanel({ title, text }: { title: string; text: string }) {
  return <div className="rounded-lg border border-dashed border-[var(--line)] bg-white p-6 text-center"><p className="font-bold">{title}</p><p className="mt-2 text-sm text-[var(--muted)]">{text}</p></div>;
}

function MiniMetric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-lg bg-white/10 p-3"><p className="font-bold">{value}</p><p className="text-xs text-emerald-50">{label}</p></div>;
}

function InfoItem({ label, value }: { label: string; value: string | number }) {
  return <div><dt className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">{label}</dt><dd className="mt-1 font-semibold capitalize">{value}</dd></div>;
}

function StatusPill({ status }: { status: MatchRow["status"] }) {
  const label = status === "live" ? "Live" : status === "completed" ? "Completed" : "Upcoming";
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${status === "live" ? "bg-red-50 text-red-700" : status === "completed" ? "bg-stone-100 text-stone-600" : "bg-emerald-50 text-[var(--brand)]"}`}>{label}</span>;
}

function ordinal(value: number) {
  return value === 1 ? "1st" : value === 2 ? "2nd" : value === 3 ? "3rd" : `${value}th`;
}

function formatDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
