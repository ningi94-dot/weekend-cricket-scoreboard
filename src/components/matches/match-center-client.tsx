"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { deliveryAccessibleLabel, deliveryLabel, deliveryRuns, dismissalNeedsFielder, dismissalText, formatOvers, formatRate, getChaseInfo, scoreProgression, summarizeInnings, teamName, type DeliveryRow, type InningsRow, type MatchRow, type PlayerRow } from "@/lib/cricket/stats";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type SquadRow = { match_id: string; player_id: string; team_side: "a" | "b"; is_captain: boolean; sort_order: number };
type Tab = "summary" | "scorecard" | "stats" | "balls" | "info" | "record" | "corrections";
type EditableDismissal = "bowled" | "caught" | "lbw" | "run_out" | "stumped" | "hit_wicket" | "retired_hurt";

const tabs: { id: Tab; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "scorecard", label: "Scorecard" },
  { id: "stats", label: "Stats" },
  { id: "balls", label: "Balls" },
  { id: "info", label: "Info" },
  { id: "record", label: "Record Score" },
  { id: "corrections", label: "Corrections" },
];

export function MatchCenterClient({ matchId }: { matchId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedTab = (searchParams.get("tab") ?? "summary") as Tab;
  const selectedScorecardSide = searchParams.get("side") === "b" ? "b" : "a";
  const [match, setMatch] = useState<MatchRow | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [squads, setSquads] = useState<SquadRow[]>([]);
  const [innings, setInnings] = useState<InningsRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [isScorer, setIsScorer] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => { void load(); }, [matchId]);
  useEffect(() => { fetch("/api/scorer/me").then((res) => res.json()).then((data) => setIsScorer(Boolean(data.isScorer))).catch(() => setIsScorer(false)); }, []);

  async function load() {
    try {
      const supabase = getSupabaseBrowserClient();
      const [matchResult, playerResult, squadResult, inningsResult, deliveryResult] = await Promise.all([
        supabase.from("matches").select("*").eq("id", matchId).single(),
        supabase.from("players").select("*").order("name"),
        supabase.from("match_squads").select("*").eq("match_id", matchId).order("team_side").order("sort_order"),
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
  const correctionsReady = match ? isCorrectionsReady(match, summaries) : false;
  const visibleTabs = tabs.filter((tab) => tab.id !== "corrections" || correctionsReady);

  function setTab(tab: Tab) {
    router.push(`/matches/${matchId}?tab=${tab}`);
  }

  if (isLoading) return <p className="text-sm text-[var(--muted)]">Loading match center...</p>;
  if (!match) return <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{message || "Match not found."}</p>;

  return (
    <section className={selectedTab === "record" ? "space-y-2" : "space-y-4"}>
      <div className="flex items-center justify-between gap-2">
        <Link href="/matches" className="text-sm font-bold text-[var(--brand)]">Back</Link>
        <div className="flex items-center gap-2">
          {isScorer && selectedTab !== "record" && <button type="button" onClick={() => setTab("record")} className="min-h-9 rounded-lg bg-[var(--brand)] px-3 text-sm font-black text-white">Score</button>}
          <button type="button" onClick={() => void load()} className="min-h-9 rounded-lg border border-[var(--line)] bg-white px-3 text-sm font-bold text-[var(--brand)]">Refresh</button>
        </div>
      </div>
      {message && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</p>}

      <div className="flex gap-2 overflow-x-auto border-b border-[var(--line)] pb-2">
        {visibleTabs.map((tab) => (
          <button key={tab.id} onClick={() => setTab(tab.id)} className={`min-h-10 shrink-0 rounded-lg px-3 text-sm font-bold ${selectedTab === tab.id ? "bg-[var(--brand)] text-white" : "bg-white text-[var(--muted)]"}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {selectedTab === "summary" && <SummaryTab match={match} current={current} summaries={summaries} />}
      {selectedTab === "scorecard" && <ScorecardTab match={match} summaries={summaries} initialSide={selectedScorecardSide} />}
      {selectedTab === "stats" && <StatsTab summaries={summaries} />}
      {selectedTab === "balls" && <BallsTab match={match} summaries={summaries} players={players} />}
      {selectedTab === "info" && <InfoTab match={match} squads={squads} players={players} onChanged={load} />}
      {selectedTab === "record" && <RecordScoreTab match={match} players={players} squads={squads} summaries={summaries} innings={innings} onChanged={load} />}
      {selectedTab === "corrections" && <CorrectionsTab match={match} players={players} squads={squads} summaries={summaries} onChanged={load} correctionsReady={correctionsReady} />}
    </section>
  );
}

function SummaryTab({ match, current, summaries }: { match: MatchRow; current: ReturnType<typeof summarizeInnings> | null; summaries: ReturnType<typeof summarizeInnings>[] }) {
  if (!current) return <EmptyPanel title="No score yet" text="Start the match from Record Score to create the first innings." />;
  const target = current.innings.target_runs;
  const required = target ? Math.max(0, target - current.runs) : null;
  const chase = getChaseInfo(match, current);
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
        {chase && <ChasePanel chase={chase} compact />}
        {match.status === "completed" && match.winner && <p className="mt-4 rounded-lg bg-white/10 p-3 text-center text-sm font-bold">Result: {match.winner === "Tie" ? "Match tied" : `${match.winner} won`}</p>}
      </section>
      <TeamComparison match={match} summaries={summaries} />
      <FigureTable title="Batting" columns={["Batter", "R", "B", "4s", "6s", "SR"]} rows={current.batters.map((batter) => [batter.dismissed ? batter.name : `${batter.name} *`, batter.runs, batter.balls, batter.fours, batter.sixes, formatRate(batter.strikeRate)])} />
      <FigureTable title="Bowling" columns={["Bowler", "O", "M", "R", "W", "Econ"]} rows={current.bowlers.map((bowler) => [bowler.name, formatOvers(bowler.legalBalls), bowler.maidens, bowler.runs, bowler.wickets, formatRate(bowler.economy)])} />
      <OverBreakdown overs={current.oversBreakdown} />
    </div>
  );
}

function ScorecardTab({ match, summaries, initialSide }: { match: MatchRow; summaries: ReturnType<typeof summarizeInnings>[]; initialSide: "a" | "b" }) {
  const router = useRouter();
  const [side, setSide] = useState<"a" | "b">(initialSide);
  const summary = summaries.find((item) => item.innings.batting_team_side === side);
  useEffect(() => { setSide(initialSide); }, [initialSide]);
  function chooseSide(nextSide: "a" | "b") {
    setSide(nextSide);
    router.push(`/matches/${match.id}?tab=scorecard&side=${nextSide}`);
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {(["a", "b"] as const).map((item) => <button key={item} onClick={() => chooseSide(item)} className={`min-h-10 rounded-lg text-sm font-bold ${side === item ? "bg-[var(--brand)] text-white" : "bg-white text-[var(--muted)]"}`}>{teamName(match, item)}</button>)}
      </div>
      {!summary ? <EmptyPanel title="Innings not started" text="This team's innings has not been recorded yet." /> : (
        <>
          <FigureTable title="Batting scorecard" columns={["Batter", "Dismissal", "R", "B", "4s", "6s", "SR"]} rows={summary.batters.map((batter) => [batter.name, batter.dismissalText, batter.runs, batter.balls, batter.fours, batter.sixes, formatRate(batter.strikeRate)])} />
          <div className="rounded-lg bg-white p-4 text-sm">
            <p><strong>Extras:</strong> {summary.extras.total} (wd {summary.extras.wides}, nb {summary.extras.noBalls}, b {summary.extras.byes}, lb {summary.extras.legByes})</p>
            <p className="mt-1"><strong>Total:</strong> {summary.runs}-{summary.wickets} in {summary.overs} overs - RR {formatRate(summary.runRate)}</p>
          </div>
          <FigureTable title="Bowling figures" columns={["Bowler", "O", "M", "R", "W", "Wd", "Nb", "Econ"]} rows={summary.bowlers.map((bowler) => [bowler.name, formatOvers(bowler.legalBalls), bowler.maidens, bowler.runs, bowler.wickets, bowler.wideRuns, bowler.noBallRuns, formatRate(bowler.economy)])} />
          <ListPanel title="Fall of wickets" items={summary.fallOfWickets} empty="No wickets have fallen." />
          <ListPanel title="Partnerships" items={summary.partnerships} empty="No partnership data yet." />
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

function BallsTab({ match, summaries, players }: { match: MatchRow; summaries: ReturnType<typeof summarizeInnings>[]; players: PlayerRow[] }) {
  const [selectedView, setSelectedView] = useState(summaries[0]?.innings.id ?? "comparison");
  const isComparison = selectedView === "comparison";
  const summary = summaries.find((item) => item.innings.id === selectedView) ?? summaries[0];
  const names = new Map(players.map((player) => [player.id, player.name]));
  if (!summary) return <EmptyPanel title="No balls recorded" text="Ball-by-ball detail appears here once scoring begins." />;
  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto">
        {summaries.map((item) => <button key={item.innings.id} onClick={() => setSelectedView(item.innings.id)} className={`min-h-10 shrink-0 rounded-lg px-3 text-sm font-bold ${!isComparison && summary.innings.id === item.innings.id ? "bg-[var(--brand)] text-white" : "bg-white text-[var(--muted)]"}`}>{ordinal(item.innings.innings_number)} Innings</button>)}
        <button onClick={() => setSelectedView("comparison")} className={`min-h-10 shrink-0 rounded-lg px-3 text-sm font-bold ${isComparison ? "bg-[var(--brand)] text-white" : "bg-white text-[var(--muted)]"}`}>Comparison</button>
      </div>
      {isComparison ? <ScoreProgressionChart match={match} summaries={summaries} players={players} /> : summary.oversBreakdown.map((over) => (
        <section key={over.overNumber} className="rounded-lg bg-white p-4">
          <div className="mb-3 flex items-center justify-between"><h3 className="font-bold">Over {over.overNumber + 1}</h3><span className="text-sm text-[var(--muted)]">{over.runs} runs - {over.scoreAfterOver}</span></div>
          <div className="space-y-2">
            {summary.deliveries.filter((delivery) => delivery.over_number === over.overNumber).map((delivery) => (
              <div key={delivery.id} className="rounded-lg border border-[var(--line)] p-3 text-sm">
                <p className="font-bold" aria-label={deliveryAccessibleLabel(delivery, names)}>{delivery.over_number}.{delivery.ball_in_over} - {deliveryLabel(delivery)} ({deliveryRuns(delivery)} run{deliveryRuns(delivery) === 1 ? "" : "s"})</p>
                <p className="mt-1 text-[var(--muted)]">{names.get(delivery.bowler_id)} to {names.get(delivery.striker_id)}</p>
                {delivery.fielder_id && <p className="mt-1 text-[var(--muted)]">Fielder: {names.get(delivery.fielder_id)}</p>}
                {delivery.catch_dropped && <p className="mt-1 text-amber-700">Dropped catch: {names.get(delivery.catch_drop_fielder_id ?? "") ?? "Unknown fielder"}</p>}
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
  const [messageTone, setMessageTone] = useState<"error" | "success">("error");
  const [isEditingMatchInfo, setIsEditingMatchInfo] = useState(false);
  const [teamAName, setTeamAName] = useState(match.team_a_name);
  const [teamBName, setTeamBName] = useState(match.team_b_name);
  const [startTime, setStartTime] = useState(match.start_time?.slice(0, 5) ?? "");
  const [location, setLocation] = useState(match.location);
  const [oversPerInnings, setOversPerInnings] = useState(match.overs_per_innings);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  useEffect(() => { fetch("/api/scorer/me").then((res) => res.json()).then((data) => setIsScorer(Boolean(data.isScorer))).catch(() => setIsScorer(false)); }, []);
  useEffect(() => {
    setTeamAName(match.team_a_name);
    setTeamBName(match.team_b_name);
    setStartTime(match.start_time?.slice(0, 5) ?? "");
    setLocation(match.location);
    setOversPerInnings(match.overs_per_innings);
  }, [match.team_a_name, match.team_b_name, match.start_time, match.location, match.overs_per_innings]);
  const names = new Map(players.map((player) => [player.id, player.name]));
  function cancelMatchInfoEdit() {
    setTeamAName(match.team_a_name);
    setTeamBName(match.team_b_name);
    setStartTime(match.start_time?.slice(0, 5) ?? "");
    setLocation(match.location);
    setOversPerInnings(match.overs_per_innings);
    setIsEditingMatchInfo(false);
  }
  async function saveMatchSettings() {
    setIsSavingSettings(true);
    const response = await fetch(`/api/matches/${match.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ teamAName, teamBName, startTime: startTime || null, location, oversPerInnings }) });
    const body = await response.json().catch(() => null);
    setIsSavingSettings(false);
    if (!response.ok) {
      setMessageTone("error");
      setMessage(body?.message ?? "Unable to save match settings.");
      return;
    }
    setMessageTone("success");
    setMessage("Match info updated.");
    setIsEditingMatchInfo(false);
    await onChanged();
  }
  async function deleteMatch() {
    const warning = match.status === "live" ? "This is a live match. Type OK in the next confirmation to delete it." : "Delete this match and its score data?";
    if (!window.confirm(warning)) return;
    const response = await fetch(`/api/matches/${match.id}`, { method: "DELETE", body: JSON.stringify({ confirmLive: match.status === "live" }) });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setMessageTone("error");
      setMessage(body?.message ?? "Unable to delete match.");
      return;
    }
    window.location.href = "/matches";
  }
  return (
    <div className="space-y-4">
      {message && <p className={`rounded-lg p-3 text-sm ${messageTone === "success" ? "bg-emerald-50 text-[var(--brand-dark)]" : "bg-red-50 text-red-700"}`}>{message}</p>}
      <section className="rounded-lg bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">Match Info</h2>
            {match.status === "upcoming" && <p className="mt-1 text-xs text-[var(--muted)]">Editable until scoring starts.</p>}
          </div>
          {match.status === "upcoming" && (
            <button
              type="button"
              onClick={() => isEditingMatchInfo ? cancelMatchInfoEdit() : setIsEditingMatchInfo(true)}
              disabled={isSavingSettings}
              className="min-h-10 rounded-lg border border-[var(--line)] px-4 text-sm font-bold text-[var(--brand)] disabled:opacity-60"
            >
              {isEditingMatchInfo ? "Cancel" : "Edit"}
            </button>
          )}
        </div>
        {isEditingMatchInfo ? (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-semibold">Team A<input value={teamAName} onChange={(event) => setTeamAName(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 font-normal" /></label>
              <label className="block text-sm font-semibold">Team B<input value={teamBName} onChange={(event) => setTeamBName(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 font-normal" /></label>
              <label className="block text-sm font-semibold">Start time<input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 font-normal" /></label>
              <label className="block text-sm font-semibold">Venue<input value={location} onChange={(event) => setLocation(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 font-normal" /></label>
              <label className="block text-sm font-semibold">Overs<input type="number" min="1" max="100" value={oversPerInnings} onChange={(event) => setOversPerInnings(Number(event.target.value) || 1)} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 font-normal" /></label>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <InfoItem label="Date" value={formatDate(match.match_date)} />
              <InfoItem label="Status" value={match.status} />
              <InfoItem label="Toss" value={match.toss_winner ? `${match.toss_winner} chose ${match.toss_decision}` : "-"} />
            </dl>
            <button type="button" onClick={() => void saveMatchSettings()} disabled={isSavingSettings} className="mt-4 min-h-11 w-full rounded-lg bg-[var(--brand)] text-sm font-bold text-white disabled:opacity-60">{isSavingSettings ? "Saving..." : "Save Match Info"}</button>
          </>
        ) : (
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
        )}
      </section>
      <section className="rounded-lg bg-white p-4">
        <div className="flex items-center justify-between"><h2 className="font-bold">Squads</h2><Link href={`/matches/${match.id}/teams`} className="text-sm font-bold text-[var(--brand)]">Edit teams</Link></div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {(["a", "b"] as const).map((side) => <div key={side} className="rounded-lg border border-[var(--line)] p-3"><h3 className="truncate font-bold">{teamName(match, side)}</h3><ul className="mt-2 space-y-1 text-xs text-[var(--muted)] sm:text-sm">{rowsForSide(squads, match, side).map((row) => <li key={`${side}-${row.player_id}`} className="truncate">{names.get(row.player_id) ?? "Unknown"}{row.is_captain ? " (C)" : ""}{isJoker(match, row.player_id) ? " (Joker)" : ""}</li>)}</ul></div>)}
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
  const firstSummary = summaries.find((summary) => summary.innings.innings_number === 1) ?? null;
  const secondSummary = summaries.find((summary) => summary.innings.innings_number === 2) ?? null;

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
        <p className="mt-1 text-sm text-[var(--muted)]">Public scorecards stay open. Recording is protected for the umpire/scorer or captain password.</p>
        {message && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</p>}
        <label className="mt-4 block text-sm font-semibold">Username<input value={username} onChange={(event) => setUsername(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] px-3 font-normal" /></label>
        <label className="mt-4 block text-sm font-semibold">Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] px-3 font-normal" /></label>
        <button className="mt-5 min-h-11 w-full rounded-lg bg-[var(--brand)] text-sm font-bold text-white">Enter scorer mode</button>
      </form>
    );
  }

  if (match.status === "completed") {
    return (
      <div className="space-y-4">
        <ResultPanel match={match} summaries={summaries} />
        <p className="rounded-lg bg-white p-4 text-sm text-[var(--muted)]">Need to fix a completed scorecard? Use the Corrections tab.</p>
      </div>
    );
  }
  if (match.status === "upcoming") return <StartMatchForm match={match} players={players} squads={squads} onChanged={onChanged} />;
  if (!currentInnings && firstSummary?.innings.status === "completed" && !secondSummary) return <StartSecondInningsForm match={match} players={players} squads={squads} firstSummary={firstSummary} onChanged={onChanged} />;
  if (!currentInnings || !currentSummary) return <EmptyPanel title="No live innings" text="This match is not currently ready for delivery recording." />;
  return <ScoringPanel match={match} players={players} squads={squads} innings={currentInnings} summary={currentSummary} onChanged={onChanged} />;
}

function CorrectionsTab({ match, players, squads, summaries, onChanged, correctionsReady }: { match: MatchRow; players: PlayerRow[]; squads: SquadRow[]; summaries: ReturnType<typeof summarizeInnings>[]; onChanged: () => Promise<void>; correctionsReady: boolean }) {
  const [isScorer, setIsScorer] = useState(false);
  const [username, setUsername] = useState("Umpire");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => { fetch("/api/scorer/me").then((res) => res.json()).then((data) => setIsScorer(Boolean(data.isScorer))).catch(() => setIsScorer(false)); }, []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/scorer/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) });
    const body = await response.json().catch(() => null);
    if (!response.ok) setMessage(body?.message ?? "Unable to sign in.");
    else { setIsScorer(true); setPassword(""); setMessage(""); }
  }

  if (!correctionsReady) return <EmptyPanel title="Corrections open after the match" text="Use Undo during a live match. Correction tools are available once the match is completed." />;

  if (!isScorer) {
    return (
      <form onSubmit={(event) => void login(event)} className="rounded-lg bg-white p-4">
        <h2 className="text-lg font-bold">Scorer login</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">Corrections are only for the umpire/scorer or captain password after the match.</p>
        {message && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</p>}
        <label className="mt-4 block text-sm font-semibold">Username<input value={username} onChange={(event) => setUsername(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] px-3 font-normal" /></label>
        <label className="mt-4 block text-sm font-semibold">Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] px-3 font-normal" /></label>
        <button className="mt-5 min-h-11 w-full rounded-lg bg-[var(--brand)] text-sm font-bold text-white">Enter corrections mode</button>
      </form>
    );
  }

  return <CorrectionPanel match={match} players={players} squads={squads} summaries={summaries} onChanged={onChanged} />;
}

function StartMatchForm({ match, players, squads, onChanged }: { match: MatchRow; players: PlayerRow[]; squads: SquadRow[]; onChanged: () => Promise<void> }) {
  const teamA = rowsForSide(squads, match, "a");
  const teamB = rowsForSide(squads, match, "b");
  const savedTossWinnerSide = match.toss_winner === match.team_b_name ? "b" : match.toss_winner === match.team_a_name ? "a" : null;
  const [tossWinnerSide, setTossWinnerSide] = useState<"a" | "b">(savedTossWinnerSide ?? "a");
  const [tossDecision, setTossDecision] = useState<"bat" | "bowl">(match.toss_decision ?? "bat");
  const [isSavingToss, setIsSavingToss] = useState(false);
  const battingSide = tossDecision === "bat" ? tossWinnerSide : oppositeSide(tossWinnerSide);
  const battingPlayers = battingSide === "a" ? teamA : teamB;
  const bowlingPlayers = battingSide === "a" ? teamB : teamA;
  const [strikerId, setStrikerId] = useState("");
  const [nonStrikerId, setNonStrikerId] = useState("");
  const [bowlerId, setBowlerId] = useState("");
  const [wicketKeeperId, setWicketKeeperId] = useState("");
  const [umpireId, setUmpireId] = useState("");
  const [message, setMessage] = useState("");
  const names = new Map(players.map((player) => [player.id, player.name]));
  const allowNoNonStriker = match.single_batter_mode;

  // These dropdown defaults mirror the selected toss side and squad state.
  useEffect(() => {
    setStrikerId(battingPlayers[0]?.player_id ?? "");
    setNonStrikerId(battingPlayers[1]?.player_id ?? "");
    setBowlerId(bowlingPlayers[0]?.player_id ?? "");
    setWicketKeeperId(bowlingPlayers[1]?.player_id ?? bowlingPlayers[0]?.player_id ?? "");
    setUmpireId(battingPlayers[2]?.player_id ?? battingPlayers[0]?.player_id ?? "");
  }, [battingSide, squads.length]);

  async function saveToss() {
    setIsSavingToss(true);
    const response = await fetch(`/api/matches/${match.id}/toss`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tossWinnerSide, tossDecision }) });
    const body = await response.json().catch(() => null);
    setIsSavingToss(false);
    if (!response.ok) setMessage(body?.message ?? "Unable to save toss.");
    else {
      setMessage("Toss saved. Choose the opening players.");
      await onChanged();
    }
  }

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch(`/api/matches/${match.id}/start`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tossWinnerSide, tossDecision, strikerId, nonStrikerId: allowNoNonStriker ? nonStrikerId || null : nonStrikerId, bowlerId, wicketKeeperId, umpireId }) });
    const body = await response.json().catch(() => null);
    if (!response.ok) setMessage(body?.message ?? "Unable to start match.");
    else await onChanged();
  }

  return (
    <form onSubmit={(event) => void start(event)} className="space-y-4 rounded-lg bg-white p-4">
      <h2 className="text-lg font-bold">Start Match</h2>
      {message && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</p>}
      <div className="rounded-2xl border border-[var(--line)] bg-stone-50 p-4">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--brand)]">Toss popup</p>
        <h3 className="mt-1 font-bold">Who won the toss?</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-semibold">Toss winner<select value={tossWinnerSide} onChange={(event) => setTossWinnerSide(event.target.value as "a" | "b")} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 font-normal"><option value="a">{match.team_a_name}</option><option value="b">{match.team_b_name}</option></select></label>
          <label className="block text-sm font-semibold">Elected to<select value={tossDecision} onChange={(event) => setTossDecision(event.target.value as "bat" | "bowl")} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 font-normal"><option value="bat">Bat</option><option value="bowl">Bowl</option></select></label>
        </div>
        <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-[var(--brand-dark)]">{teamName(match, battingSide)} will bat first.</p>
        <button type="button" onClick={() => void saveToss()} disabled={isSavingToss} className="mt-3 min-h-11 w-full rounded-lg border border-[var(--brand)] bg-white text-sm font-bold text-[var(--brand)] disabled:opacity-60">{isSavingToss ? "Saving toss..." : savedTossWinnerSide ? "Update toss before first ball" : "Save toss"}</button>
      </div>
      {savedTossWinnerSide && match.toss_decision ? (
        <>
          <PlayerSelect label="Striker" value={strikerId} rows={battingPlayers.filter((row) => row.player_id !== nonStrikerId)} names={names} onChange={setStrikerId} />
          <PlayerSelect label="Non-striker" value={nonStrikerId} rows={battingPlayers.filter((row) => row.player_id !== strikerId)} names={names} onChange={setNonStrikerId} allowEmpty={allowNoNonStriker} emptyLabel="No non-striker" />
          <PlayerSelect label="Opening bowler" value={bowlerId} rows={bowlingPlayers.filter((row) => ![strikerId, nonStrikerId].filter(Boolean).includes(row.player_id))} names={names} onChange={setBowlerId} />
          <PlayerSelect label="Wicket keeper" value={wicketKeeperId} rows={bowlingPlayers.filter((row) => ![strikerId, nonStrikerId].filter(Boolean).includes(row.player_id))} names={names} onChange={setWicketKeeperId} />
          <PlayerSelect label="Umpire" value={umpireId} rows={battingPlayers} names={names} onChange={setUmpireId} />
          <button className="min-h-12 w-full rounded-lg bg-[var(--brand)] text-sm font-bold text-white">Start and record first ball</button>
        </>
      ) : (
        <p className="rounded-lg border border-dashed border-[var(--line)] p-4 text-sm text-[var(--muted)]">Save the toss first. Opening batter and bowler selection appears after that.</p>
      )}
    </form>
  );
}

function StartSecondInningsForm({ match, players, squads, firstSummary, onChanged }: { match: MatchRow; players: PlayerRow[]; squads: SquadRow[]; firstSummary: ReturnType<typeof summarizeInnings>; onChanged: () => Promise<void> }) {
  const battingSide = oppositeSide(firstSummary.innings.batting_team_side);
  const battingPlayers = rowsForSide(squads, match, battingSide);
  const bowlingPlayers = rowsForOppositeSide(squads, match, battingSide);
  const [strikerId, setStrikerId] = useState("");
  const [nonStrikerId, setNonStrikerId] = useState("");
  const [bowlerId, setBowlerId] = useState("");
  const [wicketKeeperId, setWicketKeeperId] = useState("");
  const [umpireId, setUmpireId] = useState("");
  const [message, setMessage] = useState("");
  const names = new Map(players.map((player) => [player.id, player.name]));
  const allowNoNonStriker = match.single_batter_mode;

  // These dropdown defaults mirror the second-innings batting/bowling sides.
  useEffect(() => {
    setStrikerId(battingPlayers[0]?.player_id ?? "");
    setNonStrikerId(battingPlayers[1]?.player_id ?? "");
    setBowlerId(bowlingPlayers[0]?.player_id ?? "");
    setWicketKeeperId(bowlingPlayers[1]?.player_id ?? bowlingPlayers[0]?.player_id ?? "");
    setUmpireId(battingPlayers[2]?.player_id ?? battingPlayers[0]?.player_id ?? "");
  }, [battingSide, squads.length]);

  async function startSecondInnings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch(`/api/matches/${match.id}/innings/next`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ strikerId, nonStrikerId: allowNoNonStriker ? nonStrikerId || null : nonStrikerId, bowlerId, wicketKeeperId, umpireId }) });
    const body = await response.json().catch(() => null);
    if (!response.ok) setMessage(body?.message ?? "Unable to start second innings.");
    else await onChanged();
  }

  return (
    <form onSubmit={(event) => void startSecondInnings(event)} className="space-y-4 rounded-lg bg-white p-4">
      <h2 className="text-lg font-bold">Start Second Innings</h2>
      <p className="rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-900">{teamName(match, battingSide)} need {firstSummary.runs + 1} to win.</p>
      {message && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</p>}
      <PlayerSelect label="Striker" value={strikerId} rows={battingPlayers.filter((row) => row.player_id !== nonStrikerId)} names={names} onChange={setStrikerId} />
      <PlayerSelect label="Non-striker" value={nonStrikerId} rows={battingPlayers.filter((row) => row.player_id !== strikerId)} names={names} onChange={setNonStrikerId} allowEmpty={allowNoNonStriker} emptyLabel="No non-striker" />
      <PlayerSelect label="Opening bowler" value={bowlerId} rows={bowlingPlayers.filter((row) => ![strikerId, nonStrikerId].filter(Boolean).includes(row.player_id))} names={names} onChange={setBowlerId} />
      <PlayerSelect label="Wicket keeper" value={wicketKeeperId} rows={bowlingPlayers.filter((row) => ![strikerId, nonStrikerId].filter(Boolean).includes(row.player_id))} names={names} onChange={setWicketKeeperId} />
      <PlayerSelect label="Umpire" value={umpireId} rows={battingPlayers} names={names} onChange={setUmpireId} />
      <button className="min-h-12 w-full rounded-lg bg-[var(--brand)] text-sm font-bold text-white">Start chase</button>
    </form>
  );
}

function ResultPanel({ match, summaries }: { match: MatchRow; summaries: ReturnType<typeof summarizeInnings>[] }) {
  const first = summaries.find((summary) => summary.innings.innings_number === 1);
  const second = summaries.find((summary) => summary.innings.innings_number === 2);
  return (
    <section className="rounded-lg bg-white p-5 text-center shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--brand)]">Match result</p>
      <h2 className="mt-2 text-2xl font-black">{match.winner === "Tie" ? "Match tied" : `${match.winner ?? "Result"} won`}</h2>
      <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        {first && <div className="rounded-lg bg-stone-50 p-3"><p className="font-bold">{teamName(match, first.innings.batting_team_side)}</p><p>{first.runs}-{first.wickets} ({first.overs})</p></div>}
        {second && <div className="rounded-lg bg-stone-50 p-3"><p className="font-bold">{teamName(match, second.innings.batting_team_side)}</p><p>{second.runs}-{second.wickets} ({second.overs})</p></div>}
      </div>
    </section>
  );
}

function ScoringPanel({ match, players, squads, innings, summary, onChanged }: { match: MatchRow; players: PlayerRow[]; squads: SquadRow[]; innings: InningsRow; summary: ReturnType<typeof summarizeInnings>; onChanged: () => Promise<void> }) {
  const names = new Map(players.map((player) => [player.id, player.name]));
  const allowNoNonStriker = match.single_batter_mode;
  const battingRows = useMemo(() => rowsForSide(squads, match, innings.batting_team_side), [squads, match, innings.batting_team_side]);
  const bowlingRows = useMemo(() => rowsForOppositeSide(squads, match, innings.batting_team_side), [squads, match, innings.batting_team_side]);
  const dismissedIds = useMemo(() => new Set(summary.batters.filter((batter) => batter.dismissed).map((batter) => batter.playerId)), [summary.batters]);
  const availableBattingRows = useMemo(() => battingRows.filter((row) => !dismissedIds.has(row.player_id)), [battingRows, dismissedIds]);
  const [strikerId, setStrikerId] = useState(innings.striker_id ?? "");
  const [nonStrikerId, setNonStrikerId] = useState(innings.non_striker_id ?? "");
  const [bowlerId, setBowlerId] = useState(innings.bowler_id ?? "");
  const [extraType, setExtraType] = useState<"" | "wide" | "no_ball" | "bye" | "leg_bye">("");
  const [wicket, setWicket] = useState(false);
  const [dismissal, setDismissal] = useState("bowled");
  const [dismissedPlayerId, setDismissedPlayerId] = useState(strikerId);
  const [fielderId, setFielderId] = useState("");
  const [catchDropped, setCatchDropped] = useState(false);
  const [catchDropFielderId, setCatchDropFielderId] = useState("");
  const [wicketKeeperId, setWicketKeeperId] = useState(innings.wicket_keeper_id ?? "");
  const [umpireId, setUmpireId] = useState(innings.umpire_id ?? "");
  const [showRoleEditor, setShowRoleEditor] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedRun, setSelectedRun] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const chase = getChaseInfo(match, summary);

  // The scorer controls must resync after server-side pending-action updates.
  useEffect(() => {
    const nextStriker = innings.pending_action === "incoming_batter" ? innings.striker_id ?? "" : innings.striker_id && !dismissedIds.has(innings.striker_id) ? innings.striker_id : availableBattingRows[0]?.player_id ?? "";
    const nextNonStriker = innings.pending_action === "incoming_batter" ? innings.non_striker_id ?? "" : innings.non_striker_id && !dismissedIds.has(innings.non_striker_id) ? innings.non_striker_id : allowNoNonStriker ? "" : availableBattingRows.find((row) => row.player_id !== nextStriker)?.player_id ?? "";
    setStrikerId(nextStriker);
    setNonStrikerId(nextNonStriker);
    setBowlerId(innings.bowler_id ?? "");
    setWicketKeeperId(innings.wicket_keeper_id ?? "");
    setUmpireId(innings.umpire_id ?? "");
    setDismissedPlayerId(nextStriker);
    setFielderId(bowlingRows[0]?.player_id ?? "");
    setCatchDropFielderId(bowlingRows[0]?.player_id ?? "");
  }, [innings.id, innings.striker_id, innings.non_striker_id, innings.bowler_id, dismissedIds, availableBattingRows, bowlingRows, allowNoNonStriker]);

  async function record(runs: number) {
    if (isSubmitting || innings.pending_action) return;
    setSelectedRun(runs);
    setIsSubmitting(true);
    const isFieldingExtra = extraType === "bye" || extraType === "leg_bye";
    const isBowlingExtra = extraType === "wide" || extraType === "no_ball";
    const response = await fetch(`/api/matches/${match.id}/record`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ batterRuns: extraType ? 0 : runs, extraType: extraType || undefined, extraRuns: extraType ? (isFieldingExtra ? runs : isBowlingExtra ? runs + 1 : runs) : 0, isWicket: wicket, dismissal, dismissedPlayerId, fielderId: dismissalNeedsFielder(dismissal) ? fielderId : undefined, catchDropped, catchDropFielderId: catchDropped ? catchDropFielderId : undefined, strikerId, nonStrikerId: allowNoNonStriker ? nonStrikerId || null : nonStrikerId, bowlerId }) });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(body?.message ?? "Unable to record delivery.");
      setSelectedRun(null);
      setIsSubmitting(false);
    }
    else {
      setExtraType("");
      setWicket(false);
      setFielderId(bowlingRows[0]?.player_id ?? "");
      setCatchDropped(false);
      setCatchDropFielderId(bowlingRows[0]?.player_id ?? "");
      setMessage(body?.matchComplete ? `Match complete. ${body.winner === "Tie" ? "Match tied." : `${body.winner} won.`}` : body?.inningsComplete ? "Delivery saved. Innings complete." : body?.noNonStrikerWarning ? "Only one legal batter remains. Non-striker is blank, so strike will not rotate." : body?.pendingAction === "incoming_batter" ? dismissal === "run_out" ? "Run out saved. Choose the incoming batter and their end." : "Wicket saved. Choose the incoming batter." : body?.pendingAction === "next_bowler" ? "Over complete. Choose the next bowler." : "Delivery saved.");
      await onChanged();
      window.setTimeout(() => setSelectedRun(null), 500);
      setIsSubmitting(false);
    }
  }

  async function undo() {
    if (!window.confirm("Undo the latest delivery?")) return;
    const response = await fetch(`/api/matches/${match.id}/undo`, { method: "POST" });
    const body = await response.json().catch(() => null);
    if (!response.ok) setMessage(body?.message ?? "Unable to undo delivery.");
    else { setMessage("Latest delivery undone."); await onChanged(); }
  }

  async function saveRoles() {
    const response = await fetch(`/api/matches/${match.id}/roles`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wicketKeeperId, umpireId }) });
    const body = await response.json().catch(() => null);
    if (!response.ok) setMessage(body?.message ?? "Unable to save keeper/umpire.");
    else {
      setMessage("Keeper and umpire updated.");
      setShowRoleEditor(false);
      await onChanged();
    }
  }

  return (
    <div className="space-y-2">
      {message && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-[var(--brand-dark)]">{message}</p>}
      {innings.pending_action && <ParticipantModal match={match} innings={innings} summary={summary} players={players} battingRows={availableBattingRows} bowlingRows={bowlingRows} names={names} onChanged={onChanged} onMessage={setMessage} />}
      <section className="rounded-lg bg-[var(--brand-dark)] p-3 text-white">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-amber-200">{teamName(match, innings.batting_team_side)}, {ordinal(innings.innings_number)} innings</p>
            <p className="mt-1 text-4xl font-black leading-none">{summary.runs}-{summary.wickets}</p>
          </div>
          <div className="shrink-0 text-right text-emerald-50">
            <p className="text-xl font-black leading-tight">Ov {summary.overs}/{match.overs_per_innings}</p>
            <p className="text-base font-black leading-tight">CRR {formatRate(summary.runRate)}</p>
          </div>
        </div>
        {chase && <ChasePanel chase={chase} compact />}
        <CompactCurrentOver innings={innings} summary={summary} names={names} />
        {dismissedIds.size > 0 && <p className="mt-2 text-xs text-emerald-50">Out: {summary.batters.filter((batter) => batter.dismissed).map((batter) => batter.name).join(", ")}</p>}
      </section>
      <section className="rounded-lg bg-white p-3">
        <div className="grid grid-cols-2 gap-2">
          <PlayerSelect label="Striker" value={strikerId} rows={availableBattingRows.filter((row) => row.player_id !== nonStrikerId)} names={names} onChange={setStrikerId} disabled={Boolean(innings.pending_action)} />
          <PlayerSelect label="Non-striker" value={nonStrikerId} rows={availableBattingRows.filter((row) => row.player_id !== strikerId)} names={names} onChange={setNonStrikerId} disabled={Boolean(innings.pending_action)} allowEmpty={allowNoNonStriker} emptyLabel="No non-striker" />
          <div className="col-span-2">
            <PlayerSelect label="Bowler" value={bowlerId} rows={bowlingRows.filter((row) => row.player_id !== strikerId && (!nonStrikerId || row.player_id !== nonStrikerId))} names={names} onChange={setBowlerId} disabled={Boolean(innings.pending_action)} />
          </div>
        </div>
      </section>
      <section className="rounded-lg bg-white p-3">
        <div className="mb-3 flex flex-wrap gap-2">
          {(["wide", "no_ball", "bye", "leg_bye"] as const).map((type) => <button key={type} type="button" aria-pressed={extraType === type} disabled={isSubmitting || Boolean(innings.pending_action)} onClick={() => setExtraType(extraType === type ? "" : type)} className={`min-h-10 rounded-lg px-3 text-sm font-bold capitalize disabled:opacity-50 ${extraType === type ? "border-2 border-stone-950 bg-[var(--brand)] text-white shadow-sm" : "border border-[var(--line)]"}`}>{extraType === type ? "✓ " : ""}{type.replace("_", " ")}</button>)}
          <button type="button" aria-pressed={wicket} disabled={isSubmitting || Boolean(innings.pending_action)} onClick={() => setWicket(!wicket)} className={`min-h-10 rounded-lg px-3 text-sm font-bold disabled:opacity-50 ${wicket ? "border-2 border-stone-950 bg-red-600 text-white shadow-sm" : "border border-[var(--line)] text-red-700"}`}>{wicket ? "✓ " : ""}Wicket</button>
        </div>
        {wicket && <div className="mb-3 grid gap-2 sm:grid-cols-2"><PlayerSelect label="Dismissed batter" value={dismissedPlayerId} rows={availableBattingRows.filter((row) => row.player_id === strikerId || row.player_id === nonStrikerId)} names={names} onChange={setDismissedPlayerId} /><label className="block text-sm font-semibold">Dismissal<select value={dismissal} onChange={(event) => { setDismissal(event.target.value); if (dismissalNeedsFielder(event.target.value) && !fielderId) setFielderId(bowlingRows[0]?.player_id ?? ""); }} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 font-normal">{["bowled", "caught", "lbw", "run_out", "stumped", "hit_wicket", "retired_hurt"].map((kind) => <option key={kind} value={kind}>{kind.replace("_", " ")}</option>)}</select></label>{dismissalNeedsFielder(dismissal) && <PlayerSelect label="Fielder involved" value={fielderId} rows={bowlingRows} names={names} onChange={setFielderId} />}</div>}
        <div className="mb-3 rounded-lg border border-[var(--line)] p-3">
          <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={catchDropped} disabled={isSubmitting || Boolean(innings.pending_action)} onChange={(event) => setCatchDropped(event.target.checked)} /> Dropped catch on this ball</label>
          {catchDropped && <div className="mt-3"><PlayerSelect label="Who dropped the catch?" value={catchDropFielderId} rows={bowlingRows} names={names} onChange={setCatchDropFielderId} /></div>}
        </div>
        {extraType && <p className="mb-3 rounded-lg bg-amber-50 p-2 text-xs font-semibold text-amber-900">Extra selected: run buttons will be saved as extras, not batter runs.</p>}
        <div className="grid grid-cols-4 gap-2">
          {[0, 1, 2, 3, 4, 5, 6].map((runs) => <button key={runs} type="button" aria-pressed={selectedRun === runs} disabled={isSubmitting || Boolean(innings.pending_action)} onClick={() => void record(runs)} className={`aspect-square min-h-10 rounded-full border-2 text-sm font-black disabled:opacity-50 ${selectedRun === runs ? "border-stone-950 bg-[var(--brand)] text-white shadow-sm ring-2 ring-amber-300" : "border-[var(--brand)] text-[var(--brand)]"}`}>{selectedRun === runs ? "✓ " : ""}{runs}</button>)}
          <button onClick={() => void undo()} className="aspect-square rounded-full bg-stone-900 text-xs font-bold text-white">Undo</button>
        </div>
      </section>
      <section className="rounded-lg bg-white p-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <p className="truncate"><strong>Keeper:</strong> {names.get(innings.wicket_keeper_id ?? "") ?? "-"} <span className="mx-1 text-[var(--muted)]">|</span> <strong>Umpire:</strong> {names.get(innings.umpire_id ?? "") ?? "-"}</p>
          <button type="button" onClick={() => setShowRoleEditor(!showRoleEditor)} className="shrink-0 rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-xs font-bold text-[var(--brand)]">{showRoleEditor ? "Close" : "Change"}</button>
        </div>
        {showRoleEditor && <div className="mt-3 grid gap-3 sm:grid-cols-2"><PlayerSelect label="Wicket keeper" value={wicketKeeperId} rows={bowlingRows.filter((row) => row.player_id !== strikerId && (!nonStrikerId || row.player_id !== nonStrikerId))} names={names} onChange={setWicketKeeperId} /><PlayerSelect label="Umpire" value={umpireId} rows={availableBattingRows} names={names} onChange={setUmpireId} /><button type="button" onClick={() => void saveRoles()} className="min-h-11 rounded-lg bg-[var(--brand)] text-sm font-bold text-white sm:col-span-2">Save keeper / umpire</button></div>}
      </section>
    </div>
  );
}

function NoNonStrikerControl({ match, onChanged, onMessage }: { match: MatchRow; onChanged: () => Promise<void>; onMessage: (message: string) => void }) {
  const [isSaving, setIsSaving] = useState(false);
  async function updateMode(nextValue: boolean) {
    setIsSaving(true);
    const response = await fetch(`/api/matches/${match.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ singleBatterMode: nextValue }) });
    const body = await response.json().catch(() => null);
    setIsSaving(false);
    if (!response.ok) onMessage(body?.message ?? "Unable to update match mode.");
    else {
      onMessage(nextValue ? "No-non-striker is allowed. You can leave non-striker blank when needed." : "No-non-striker is off. A striker and non-striker are required.");
      await onChanged();
    }
  }

  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-bold text-amber-950">Allow no non-striker</h2>
          <p className="mt-1 text-sm text-amber-900">{match.single_batter_mode ? "On: two batters rotate normally; if non-striker is blank, strike will not rotate." : "Off: every delivery requires both striker and non-striker."}</p>
        </div>
        <button type="button" disabled={isSaving} onClick={() => void updateMode(!match.single_batter_mode)} className="min-h-10 rounded-lg bg-white px-3 text-sm font-black text-amber-950 shadow-sm disabled:opacity-60">
          {isSaving ? "Saving..." : match.single_batter_mode ? "Require non-striker" : "Allow blank non-striker"}
        </button>
      </div>
    </section>
  );
}

function CorrectionPanel({ match, players, squads, summaries, onChanged }: { match: MatchRow; players: PlayerRow[]; squads: SquadRow[]; summaries: ReturnType<typeof summarizeInnings>[]; onChanged: () => Promise<void> }) {
  const [selectedDeliveryId, setSelectedDeliveryId] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [message, setMessage] = useState("");
  const names = new Map(players.map((player) => [player.id, player.name]));
  const items = summaries
    .flatMap((summary) => summary.deliveries.map((delivery) => ({ summary, delivery })))
    .sort((first, second) => first.summary.innings.innings_number - second.summary.innings.innings_number || first.delivery.sequence_number - second.delivery.sequence_number);
  const selectedIndex = Math.max(0, items.findIndex((item) => item.delivery.id === selectedDeliveryId));
  const selected = items[selectedIndex] ?? null;

  useEffect(() => {
    if (items.length && !items.some((item) => item.delivery.id === selectedDeliveryId)) {
      setSelectedDeliveryId(items.at(-1)?.delivery.id ?? "");
    }
  }, [items, selectedDeliveryId]);

  function moveSelection(delta: number) {
    const nextIndex = Math.min(items.length - 1, Math.max(0, selectedIndex + delta));
    setSelectedDeliveryId(items[nextIndex]?.delivery.id ?? "");
  }

  return (
    <section className="space-y-4">
      <div className="rounded-lg bg-white p-4 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--brand)]">Umpire tools</p>
        <h2 className="mt-1 font-black">Corrections</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">Edit an existing ball or add a missing ball at the end. Scorecards, target, and winner recalculate after each save.</p>
      </div>
      {message && <p className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-[var(--brand-dark)]">{message}</p>}
      <NoNonStrikerControl match={match} onChanged={onChanged} onMessage={setMessage} />
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setIsAdding(false)} className={`min-h-10 rounded-lg text-sm font-bold ${!isAdding ? "bg-[var(--brand)] text-white" : "bg-white text-[var(--muted)]"}`}>Edit balls</button>
        <button type="button" onClick={() => setIsAdding(true)} className={`min-h-10 rounded-lg text-sm font-bold ${isAdding ? "bg-[var(--brand)] text-white" : "bg-white text-[var(--muted)]"}`}>Add ball at end</button>
      </div>
      {isAdding ? (
        <AddDeliveryEditor match={match} squads={squads} summaries={summaries} names={names} onChanged={onChanged} onMessage={setMessage} />
      ) : selected ? (
        <>
          <div className="rounded-lg border border-[var(--line)] bg-white p-3">
            <label className="block text-sm font-semibold">Jump to ball
              <select value={selected.delivery.id} onChange={(event) => setSelectedDeliveryId(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 font-normal">
                {items.map((item, index) => <option key={item.delivery.id} value={item.delivery.id}>{index + 1}. {ordinal(item.summary.innings.innings_number)} inn - {item.delivery.over_number}.{item.delivery.ball_in_over} - {deliveryLabel(item.delivery)}</option>)}
              </select>
            </label>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" disabled={selectedIndex === 0} onClick={() => moveSelection(-1)} className="min-h-10 rounded-lg border border-[var(--line)] text-sm font-bold disabled:opacity-50">Previous ball</button>
              <button type="button" disabled={selectedIndex >= items.length - 1} onClick={() => moveSelection(1)} className="min-h-10 rounded-lg border border-[var(--line)] text-sm font-bold disabled:opacity-50">Next ball</button>
            </div>
          </div>
          <DeliveryCorrectionEditor match={match} squads={squads} summary={selected.summary} delivery={selected.delivery} names={names} onChanged={onChanged} onMessage={setMessage} />
        </>
      ) : <p className="rounded-lg bg-white p-4 text-sm text-[var(--muted)]">No deliveries have been recorded yet. Use Add ball at end to enter one.</p>}
    </section>
  );
}

function AddDeliveryEditor({ match, squads, summaries, names, onChanged, onMessage }: { match: MatchRow; squads: SquadRow[]; summaries: ReturnType<typeof summarizeInnings>[]; names: Map<string, string>; onChanged: () => Promise<void>; onMessage: (message: string) => void }) {
  const allowNoNonStriker = match.single_batter_mode;
  const [inningsId, setInningsId] = useState(summaries.at(-1)?.innings.id ?? "");
  const summary = summaries.find((item) => item.innings.id === inningsId) ?? summaries.at(-1) ?? null;
  const battingRows = useMemo(() => summary ? rowsForSide(squads, match, summary.innings.batting_team_side) : [], [match, squads, summary?.innings.batting_team_side]);
  const bowlingRows = useMemo(() => summary ? rowsForOppositeSide(squads, match, summary.innings.batting_team_side) : [], [match, squads, summary?.innings.batting_team_side]);
  const [strikerId, setStrikerId] = useState("");
  const [nonStrikerId, setNonStrikerId] = useState("");
  const [bowlerId, setBowlerId] = useState("");
  const [wicketKeeperId, setWicketKeeperId] = useState("");
  const [batterRuns, setBatterRuns] = useState(0);
  const [extraType, setExtraType] = useState<"" | "wide" | "no_ball" | "bye" | "leg_bye">("");
  const [extraRuns, setExtraRuns] = useState(0);
  const [isWicket, setIsWicket] = useState(false);
  const [dismissal, setDismissal] = useState<EditableDismissal>("bowled");
  const [dismissedPlayerId, setDismissedPlayerId] = useState("");
  const [fielderId, setFielderId] = useState("");
  const [catchDropped, setCatchDropped] = useState(false);
  const [catchDropFielderId, setCatchDropFielderId] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!summary) return;
    const striker = summary.innings.striker_id ?? battingRows[0]?.player_id ?? "";
    const nonStriker = summary.innings.non_striker_id ?? battingRows.find((row) => row.player_id !== striker)?.player_id ?? "";
    setStrikerId(striker);
    setNonStrikerId(nonStriker);
    setBowlerId(summary.innings.bowler_id ?? bowlingRows[0]?.player_id ?? "");
    setWicketKeeperId(summary.innings.wicket_keeper_id ?? bowlingRows[1]?.player_id ?? bowlingRows[0]?.player_id ?? "");
    setDismissedPlayerId(striker);
    setFielderId(bowlingRows[0]?.player_id ?? "");
    setCatchDropFielderId(bowlingRows[0]?.player_id ?? "");
  }, [summary?.innings.id, battingRows, bowlingRows]);

  if (!summary) return <p className="rounded-lg bg-white p-4 text-sm text-[var(--muted)]">Create an innings before adding a ball.</p>;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!summary) return;
    setIsSaving(true);
    const response = await fetch(`/api/matches/${match.id}/deliveries`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        inningsId,
        strikerId,
        nonStrikerId: allowNoNonStriker ? nonStrikerId || null : nonStrikerId,
        bowlerId,
        wicketKeeperId,
        batterRuns: extraType ? 0 : batterRuns,
        extraType,
        extraRuns: extraType ? extraRuns : 0,
        isWicket,
        dismissal: isWicket ? dismissal : undefined,
        dismissedPlayerId: isWicket ? dismissedPlayerId : null,
        fielderId: isWicket && dismissalNeedsFielder(dismissal) ? fielderId : null,
        catchDropped,
        catchDropFielderId: catchDropped ? catchDropFielderId : null,
      }),
    });
    const body = await response.json().catch(() => null);
    setIsSaving(false);
    if (!response.ok) onMessage(body?.message ?? "Unable to add delivery.");
    else {
      onMessage(`Added ball to ${ordinal(summary.innings.innings_number)} innings.`);
      setBatterRuns(0);
      setExtraType("");
      setExtraRuns(0);
      setIsWicket(false);
      setCatchDropped(false);
      await onChanged();
    }
  }

  const currentBatterRows = battingRows.filter((row) => row.player_id === strikerId || row.player_id === nonStrikerId);

  return (
    <form onSubmit={(event) => void submit(event)} className="rounded-lg border border-[var(--line)] bg-white p-3">
      <label className="block text-sm font-semibold">Add to innings
        <select value={inningsId} onChange={(event) => setInningsId(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 font-normal">
          {summaries.map((item) => <option key={item.innings.id} value={item.innings.id}>{ordinal(item.innings.innings_number)} innings - {teamName(match, item.innings.batting_team_side)} ({item.runs}-{item.wickets})</option>)}
        </select>
      </label>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <PlayerSelect label="Striker" value={strikerId} rows={battingRows.filter((row) => row.player_id !== nonStrikerId)} names={names} onChange={(value) => { setStrikerId(value); if (!dismissedPlayerId || dismissedPlayerId === strikerId || ![value, nonStrikerId].filter(Boolean).includes(dismissedPlayerId)) setDismissedPlayerId(value); }} />
        <PlayerSelect label="Non-striker" value={nonStrikerId} rows={battingRows.filter((row) => row.player_id !== strikerId)} names={names} onChange={(value) => { setNonStrikerId(value); if (dismissedPlayerId && dismissedPlayerId !== strikerId && dismissedPlayerId !== value) setDismissedPlayerId(strikerId); }} allowEmpty={allowNoNonStriker} emptyLabel="No non-striker" />
        <PlayerSelect label="Bowler" value={bowlerId} rows={bowlingRows.filter((row) => row.player_id !== strikerId && (!nonStrikerId || row.player_id !== nonStrikerId))} names={names} onChange={setBowlerId} />
        <PlayerSelect label="Wicket keeper" value={wicketKeeperId} rows={bowlingRows.filter((row) => row.player_id !== strikerId && (!nonStrikerId || row.player_id !== nonStrikerId))} names={names} onChange={setWicketKeeperId} />
      </div>
      <div className="mt-4 rounded-lg bg-stone-50 p-3">
        <p className="text-sm font-black">Recorded ball</p>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {[0, 1, 2, 3, 4, 5, 6].map((runs) => <button key={runs} type="button" aria-pressed={batterRuns === runs} onClick={() => setBatterRuns(runs)} className={`aspect-square rounded-full border-2 text-sm font-black ${batterRuns === runs ? "border-stone-950 bg-[var(--brand)] text-white" : "border-[var(--brand)] text-[var(--brand)]"}`}>{runs}</button>)}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-semibold">Extra type<select value={extraType} onChange={(event) => { const next = event.target.value as typeof extraType; setExtraType(next); setExtraRuns(next ? Math.max(1, extraRuns || 1) : 0); if (next) setBatterRuns(0); }} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 font-normal"><option value="">No extra</option><option value="wide">Wide</option><option value="no_ball">No ball</option><option value="bye">Bye</option><option value="leg_bye">Leg bye</option></select></label>
          <label className="block text-sm font-semibold">Extra runs<input type="number" min="0" max="10" disabled={!extraType} value={extraType ? extraRuns : 0} onChange={(event) => setExtraRuns(Number(event.target.value) || 0)} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 font-normal disabled:bg-stone-100" /></label>
        </div>
        {extraType && <p className="mt-2 text-xs font-semibold text-amber-900">With an extra selected, batter runs are saved as 0. Put the full extra total here, e.g. Wide + 4 = 5 wide runs.</p>}
      </div>
      <div className="mt-4 rounded-lg border border-[var(--line)] p-3">
        <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={isWicket} onChange={(event) => setIsWicket(event.target.checked)} /> Wicket on this ball</label>
        {isWicket && <div className="mt-3 grid gap-3 sm:grid-cols-2"><PlayerSelect label="Dismissed batter" value={dismissedPlayerId} rows={currentBatterRows.length ? currentBatterRows : battingRows} names={names} onChange={setDismissedPlayerId} /><label className="block text-sm font-semibold">Dismissal<select value={dismissal} onChange={(event) => { const nextDismissal = event.target.value as EditableDismissal; setDismissal(nextDismissal); if (dismissalNeedsFielder(nextDismissal) && !fielderId) setFielderId(bowlingRows[0]?.player_id ?? ""); }} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 font-normal">{["bowled", "caught", "lbw", "run_out", "stumped", "hit_wicket", "retired_hurt"].map((kind) => <option key={kind} value={kind}>{kind.replace("_", " ")}</option>)}</select></label>{dismissalNeedsFielder(dismissal) && <PlayerSelect label="Fielder involved" value={fielderId} rows={bowlingRows} names={names} onChange={setFielderId} />}</div>}
      </div>
      <div className="mt-4 rounded-lg border border-[var(--line)] p-3">
        <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={catchDropped} onChange={(event) => setCatchDropped(event.target.checked)} /> Dropped catch on this ball</label>
        {catchDropped && <div className="mt-3"><PlayerSelect label="Who dropped the catch?" value={catchDropFielderId} rows={bowlingRows} names={names} onChange={setCatchDropFielderId} /></div>}
      </div>
      <button disabled={isSaving} className="mt-4 min-h-11 w-full rounded-lg bg-[var(--brand)] text-sm font-bold text-white disabled:opacity-60">{isSaving ? "Adding ball..." : "Add ball"}</button>
    </form>
  );
}

function DeliveryCorrectionEditor({ match, squads, summary, delivery, names, onChanged, onMessage }: { match: MatchRow; squads: SquadRow[]; summary: ReturnType<typeof summarizeInnings>; delivery: DeliveryRow; names: Map<string, string>; onChanged: () => Promise<void>; onMessage: (message: string) => void }) {
  const allowNoNonStriker = match.single_batter_mode;
  const battingRows = rowsForSide(squads, match, summary.innings.batting_team_side);
  const bowlingRows = rowsForOppositeSide(squads, match, summary.innings.batting_team_side);
  const [strikerId, setStrikerId] = useState(delivery.striker_id);
  const [nonStrikerId, setNonStrikerId] = useState(delivery.non_striker_id ?? "");
  const [bowlerId, setBowlerId] = useState(delivery.bowler_id);
  const [wicketKeeperId, setWicketKeeperId] = useState(summary.innings.wicket_keeper_id ?? "");
  const [batterRuns, setBatterRuns] = useState(delivery.batter_runs);
  const [extraType, setExtraType] = useState<"" | "wide" | "no_ball" | "bye" | "leg_bye">(deliveryExtraType(delivery));
  const [extraRuns, setExtraRuns] = useState(deliveryExtraRuns(delivery));
  const [isWicket, setIsWicket] = useState(delivery.is_wicket);
  const [dismissal, setDismissal] = useState<EditableDismissal>(isEditableDismissal(delivery.dismissal) ? delivery.dismissal : "bowled");
  const [dismissedPlayerId, setDismissedPlayerId] = useState(delivery.dismissed_player_id ?? delivery.striker_id);
  const [fielderId, setFielderId] = useState(delivery.fielder_id ?? "");
  const [catchDropped, setCatchDropped] = useState(delivery.catch_dropped);
  const [catchDropFielderId, setCatchDropFielderId] = useState(delivery.catch_drop_fielder_id ?? "");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setStrikerId(delivery.striker_id);
    setNonStrikerId(delivery.non_striker_id ?? "");
    setBowlerId(delivery.bowler_id);
    setWicketKeeperId(summary.innings.wicket_keeper_id ?? "");
    setBatterRuns(delivery.batter_runs);
    setExtraType(deliveryExtraType(delivery));
    setExtraRuns(deliveryExtraRuns(delivery));
    setIsWicket(delivery.is_wicket);
    setDismissal(isEditableDismissal(delivery.dismissal) ? delivery.dismissal : "bowled");
    setDismissedPlayerId(delivery.dismissed_player_id ?? delivery.striker_id);
    setFielderId(delivery.fielder_id ?? "");
    setCatchDropped(delivery.catch_dropped);
    setCatchDropFielderId(delivery.catch_drop_fielder_id ?? "");
  }, [delivery, summary.innings.wicket_keeper_id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    const response = await fetch(`/api/matches/${match.id}/deliveries/${delivery.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        strikerId,
        nonStrikerId: allowNoNonStriker ? nonStrikerId || null : nonStrikerId,
        bowlerId,
        wicketKeeperId,
        batterRuns: extraType ? 0 : batterRuns,
        extraType,
        extraRuns: extraType ? extraRuns : 0,
        isWicket,
        dismissal: isWicket ? dismissal : undefined,
        dismissedPlayerId: isWicket ? dismissedPlayerId : null,
        fielderId: isWicket && dismissalNeedsFielder(dismissal) ? fielderId : null,
        catchDropped,
        catchDropFielderId: catchDropped ? catchDropFielderId : null,
      }),
    });
    const body = await response.json().catch(() => null);
    setIsSaving(false);
    if (!response.ok) onMessage(body?.message ?? "Unable to save delivery correction.");
    else {
      onMessage(`Saved correction for ${ordinal(summary.innings.innings_number)} innings, ball ${delivery.over_number}.${delivery.ball_in_over}.`);
      await onChanged();
    }
  }

  const currentBatterRows = battingRows.filter((row) => row.player_id === strikerId || row.player_id === nonStrikerId);

  return (
    <form onSubmit={(event) => void submit(event)} className="rounded-lg border border-[var(--line)] p-3">
      <div className="mb-3 rounded-lg bg-stone-50 p-3 text-sm">
        <p className="font-black">{teamName(match, summary.innings.batting_team_side)} - {ordinal(summary.innings.innings_number)} innings, ball {delivery.over_number}.{delivery.ball_in_over}</p>
        <p className="mt-1 text-[var(--muted)]">Currently: {deliveryLabel(delivery)} ({deliveryRuns(delivery)} run{deliveryRuns(delivery) === 1 ? "" : "s"}) - {names.get(delivery.bowler_id) ?? "Unknown bowler"} to {names.get(delivery.striker_id) ?? "Unknown batter"}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <PlayerSelect label="Striker" value={strikerId} rows={battingRows.filter((row) => row.player_id !== nonStrikerId)} names={names} onChange={(value) => { setStrikerId(value); if (!dismissedPlayerId || dismissedPlayerId === strikerId || ![value, nonStrikerId].filter(Boolean).includes(dismissedPlayerId)) setDismissedPlayerId(value); }} />
        <PlayerSelect label="Non-striker" value={nonStrikerId} rows={battingRows.filter((row) => row.player_id !== strikerId)} names={names} onChange={(value) => { setNonStrikerId(value); if (dismissedPlayerId && dismissedPlayerId !== strikerId && dismissedPlayerId !== value) setDismissedPlayerId(strikerId); }} allowEmpty={allowNoNonStriker} emptyLabel="No non-striker" />
        <PlayerSelect label="Bowler" value={bowlerId} rows={bowlingRows.filter((row) => row.player_id !== strikerId && (!nonStrikerId || row.player_id !== nonStrikerId))} names={names} onChange={setBowlerId} />
        <PlayerSelect label="Wicket keeper" value={wicketKeeperId} rows={bowlingRows.filter((row) => row.player_id !== strikerId && (!nonStrikerId || row.player_id !== nonStrikerId))} names={names} onChange={setWicketKeeperId} />
      </div>
      <div className="mt-4 rounded-lg bg-stone-50 p-3">
        <p className="text-sm font-black">Recorded ball</p>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {[0, 1, 2, 3, 4, 5, 6].map((runs) => <button key={runs} type="button" aria-pressed={batterRuns === runs} onClick={() => setBatterRuns(runs)} className={`aspect-square rounded-full border-2 text-sm font-black ${batterRuns === runs ? "border-stone-950 bg-[var(--brand)] text-white" : "border-[var(--brand)] text-[var(--brand)]"}`}>{runs}</button>)}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-semibold">Extra type<select value={extraType} onChange={(event) => { const next = event.target.value as typeof extraType; setExtraType(next); setExtraRuns(next ? Math.max(1, extraRuns || 1) : 0); if (next) setBatterRuns(0); }} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 font-normal"><option value="">No extra</option><option value="wide">Wide</option><option value="no_ball">No ball</option><option value="bye">Bye</option><option value="leg_bye">Leg bye</option></select></label>
          <label className="block text-sm font-semibold">Extra runs<input type="number" min="0" max="10" disabled={!extraType} value={extraType ? extraRuns : 0} onChange={(event) => setExtraRuns(Number(event.target.value) || 0)} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 font-normal disabled:bg-stone-100" /></label>
        </div>
        {extraType && <p className="mt-2 text-xs font-semibold text-amber-900">With an extra selected, batter runs are saved as 0. Put the full extra total here, e.g. Wide + 4 = 5 wide runs.</p>}
      </div>
      <div className="mt-4 rounded-lg border border-[var(--line)] p-3">
        <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={isWicket} onChange={(event) => setIsWicket(event.target.checked)} /> Wicket on this ball</label>
        {isWicket && <div className="mt-3 grid gap-3 sm:grid-cols-2"><PlayerSelect label="Dismissed batter" value={dismissedPlayerId} rows={currentBatterRows.length ? currentBatterRows : battingRows} names={names} onChange={setDismissedPlayerId} /><label className="block text-sm font-semibold">Dismissal<select value={dismissal} onChange={(event) => { const nextDismissal = event.target.value as EditableDismissal; setDismissal(nextDismissal); if (dismissalNeedsFielder(nextDismissal) && !fielderId) setFielderId(bowlingRows[0]?.player_id ?? ""); }} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 font-normal">{["bowled", "caught", "lbw", "run_out", "stumped", "hit_wicket", "retired_hurt"].map((kind) => <option key={kind} value={kind}>{kind.replace("_", " ")}</option>)}</select></label>{dismissalNeedsFielder(dismissal) && <PlayerSelect label="Fielder involved" value={fielderId} rows={bowlingRows} names={names} onChange={setFielderId} />}</div>}
      </div>
      <div className="mt-4 rounded-lg border border-[var(--line)] p-3">
        <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={catchDropped} onChange={(event) => setCatchDropped(event.target.checked)} /> Dropped catch on this ball</label>
        {catchDropped && <div className="mt-3"><PlayerSelect label="Who dropped the catch?" value={catchDropFielderId} rows={bowlingRows} names={names} onChange={setCatchDropFielderId} /></div>}
      </div>
      <button disabled={isSaving} className="mt-4 min-h-11 w-full rounded-lg bg-[var(--brand)] text-sm font-bold text-white disabled:opacity-60">{isSaving ? "Saving correction..." : "Save this ball"}</button>
    </form>
  );
}

function ParticipantModal({ match, innings, summary, players, battingRows, bowlingRows, names, onChanged, onMessage }: { match: MatchRow; innings: InningsRow; summary: ReturnType<typeof summarizeInnings>; players: PlayerRow[]; battingRows: SquadRow[]; bowlingRows: SquadRow[]; names: Map<string, string>; onChanged: () => Promise<void>; onMessage: (message: string) => void }) {
  const dismissed = innings.pending_dismissed_player_id ? players.find((player) => player.id === innings.pending_dismissed_player_id)?.name ?? "Dismissed batter" : "Dismissed batter";
  const allowNoNonStriker = match.single_batter_mode;
  const currentBatterIds = [innings.striker_id, innings.non_striker_id].filter((playerId): playerId is string => Boolean(playerId));
  const [playerId, setPlayerId] = useState("");
  const [incomingPosition, setIncomingPosition] = useState<"striker" | "non_striker">("striker");
  const [allowConsecutive, setAllowConsecutive] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const eligibleIncoming = battingRows.filter((row) => !currentBatterIds.includes(row.player_id));
  const eligibleBowlers = bowlingRows.filter((row) => row.player_id !== innings.pending_previous_bowler_id && !currentBatterIds.includes(row.player_id));
  const safeBowlingRows = bowlingRows.filter((row) => !currentBatterIds.includes(row.player_id));
  const rows = innings.pending_action === "incoming_batter" ? eligibleIncoming : eligibleBowlers.length ? eligibleBowlers : safeBowlingRows;
  const actionTitle = innings.pending_action === "incoming_batter" ? "Choose incoming batter" : "Choose next bowler";
  const isRunOutReplacement = innings.pending_action === "incoming_batter" && summary.deliveries.at(-1)?.dismissal === "run_out" && currentBatterIds.length > 0;
  const remainingBatterName = names.get(innings.striker_id ?? innings.non_striker_id ?? "") ?? "the remaining batter";
  const defaultPlayerId = rows[0]?.player_id ?? "";

  // Default the modal to the first eligible selection whenever the required action changes.
  useEffect(() => {
    setPlayerId(defaultPlayerId);
    setIncomingPosition("striker");
  }, [innings.id, innings.pending_action, defaultPlayerId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!playerId) return;
    setIsSaving(true);
    const response = await fetch(`/api/matches/${match.id}/participants`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: innings.pending_action, playerId, allowConsecutive, incomingPosition: isRunOutReplacement ? incomingPosition : undefined }) });
    const body = await response.json().catch(() => null);
    setIsSaving(false);
    if (!response.ok) onMessage(body?.message ?? "Unable to save selection.");
    else {
      onMessage(body?.nextAction === "next_bowler" ? "Incoming batter saved. Now choose the next bowler." : "Selection saved. You can record the next delivery.");
      await onChanged();
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/35 sm:items-center sm:justify-center sm:p-4">
      <form onSubmit={(event) => void submit(event)} className="w-full rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-3xl">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--brand)]">Scoring paused</p>
        <h2 className="mt-1 text-xl font-black">{actionTitle}</h2>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
          <SmallMatchMetric label="Score" value={`${summary.runs}-${summary.wickets}`} />
          <SmallMatchMetric label="Overs" value={summary.overs} />
          <SmallMatchMetric label="Wickets" value={summary.wickets} />
        </div>
        {innings.pending_action === "incoming_batter" ? (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{dismissed} is out. Select the next batter before another ball can be recorded.</p>
        ) : (
          <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-[var(--brand-dark)]">Over {innings.pending_completed_over ?? "-"} complete. Previous bowler: {names.get(innings.pending_previous_bowler_id ?? "") ?? "Unknown"}.</p>
        )}
        <PlayerSelect label={innings.pending_action === "incoming_batter" ? "Incoming batter" : "Next bowler"} value={playerId} rows={rows} names={names} onChange={setPlayerId} />
        {isRunOutReplacement && (
          <fieldset className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <legend className="text-sm font-black text-amber-950">Where should the incoming batter stand?</legend>
            <p className="mt-1 text-xs text-amber-900">For a run out, use the final positions after the attempted run. {remainingBatterName} will take the other end.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {(["striker", "non_striker"] as const).map((position) => (
                <button key={position} type="button" aria-pressed={incomingPosition === position} onClick={() => setIncomingPosition(position)} className={`flex min-h-11 items-center justify-center rounded-lg border px-3 text-sm font-bold ${incomingPosition === position ? "border-[var(--brand)] bg-white text-[var(--brand-dark)] shadow-sm ring-2 ring-emerald-100" : "border-amber-200 bg-amber-100/50 text-amber-900"}`}>
                  {position === "striker" ? "New batter on strike" : "New batter non-striker"}
                </button>
              ))}
            </div>
          </fieldset>
        )}
        {innings.pending_action === "next_bowler" && rows.length === 1 && rows[0]?.player_id === innings.pending_previous_bowler_id && (
          <label className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <input type="checkbox" checked={allowConsecutive} onChange={(event) => setAllowConsecutive(event.target.checked)} />
            Friendly-match override: allow the same bowler to bowl consecutive overs.
          </label>
        )}
        <button disabled={isSaving || !playerId} className="mt-5 min-h-11 w-full rounded-lg bg-[var(--brand)] text-sm font-bold text-white disabled:opacity-60">{isSaving ? "Saving..." : "Save selection"}</button>
      </form>
    </div>
  );
}

function CompactCurrentOver({ innings, summary, names }: { innings: InningsRow; summary: ReturnType<typeof summarizeInnings>; names: Map<string, string> }) {
  const lastDelivery = summary.deliveries.at(-1);
  const currentOverNumber = innings.pending_action === "next_bowler" && lastDelivery ? lastDelivery.over_number : Math.floor(summary.legalBalls / 6);
  const deliveries = summary.deliveries.filter((delivery) => delivery.over_number === currentOverNumber);
  return (
    <div className="mt-3 rounded-lg bg-white/10 p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-black text-emerald-50">This over</p>
        <p className="text-base font-black text-emerald-50">Over {currentOverNumber + 1}</p>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {deliveries.length ? deliveries.map((delivery) => (
          <span key={delivery.id} aria-label={deliveryAccessibleLabel(delivery, names)} title={deliveryAccessibleLabel(delivery, names)} className="grid size-9 place-items-center rounded-full border border-emerald-100/50 bg-white/15 text-sm font-black text-white">
            {deliveryLabel(delivery)}
          </span>
        )) : <p className="text-sm font-semibold text-emerald-50">No balls yet.</p>}
      </div>
    </div>
  );
}

function ChasePanel({ chase, compact = false }: { chase: NonNullable<ReturnType<typeof getChaseInfo>>; compact?: boolean }) {
  return (
    <div className={`${compact ? "mt-2 bg-white/10 text-white" : "bg-amber-50 text-amber-950"} rounded-lg p-3`}>
      <p className="text-lg font-black leading-tight">{chase.sentence}</p>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <CriticalMatchMetric label="Target" value={chase.target} />
        <CriticalMatchMetric label="Balls left" value={chase.ballsRemaining} />
        <CriticalMatchMetric label="Req RR" value={formatRate(chase.requiredRunRate)} />
      </div>
    </div>
  );
}

function TeamComparison({ match, summaries }: { match: MatchRow; summaries: ReturnType<typeof summarizeInnings>[] }) {
  return (
    <section className="grid grid-cols-2 gap-3">
      {(["a", "b"] as const).map((side) => {
        const summary = summaries.find((item) => item.innings.batting_team_side === side);
        return (
          <Link key={side} href={`/matches/${match.id}?tab=scorecard&side=${side}`} className="rounded-lg bg-white p-4 transition hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)]">
            <p className="truncate text-sm font-black">{teamName(match, side)}</p>
            <p className="mt-2 text-2xl font-black text-[var(--brand)]">{summary ? `${summary.runs}-${summary.wickets}` : "0-0"}</p>
            <p className="text-xs text-[var(--muted)]">{summary ? `${summary.overs} overs - View scorecard` : "Not batted"}</p>
          </Link>
        );
      })}
    </section>
  );
}

function ScoreProgressionChart({ match, summaries, players }: { match: MatchRow; summaries: ReturnType<typeof summarizeInnings>[]; players: PlayerRow[] }) {
  const points = scoreProgression(match, summaries);
  const names = new Map(players.map((player) => [player.id, player.name]));
  const teams = [...new Set(points.map((point) => point.team))];
  const maxBalls = Math.max(match.overs_per_innings * 6, 1);
  const maxRuns = Math.max(...points.map((point) => point.runs), 1);
  const wicketEvents = summaries.flatMap((summary) => {
    let runs = 0;
    let legalBalls = 0;
    let wickets = 0;
    return summary.deliveries.flatMap((delivery) => {
      runs += deliveryRuns(delivery);
      if (delivery.is_legal_delivery) legalBalls += 1;
      if (!delivery.is_wicket || !delivery.dismissed_player_id) return [];
      wickets += 1;
      return [{
        id: delivery.id,
        inningsId: summary.innings.id,
        team: teamName(match, summary.innings.batting_team_side),
        batter: names.get(delivery.dismissed_player_id) ?? "Unknown player",
        legalBalls,
        runs,
        score: `${runs}-${wickets}`,
        over: formatOvers(legalBalls),
        dismissal: dismissalText(delivery, names),
      }];
    });
  });
  const width = 320;
  const height = 170;
  const pad = 28;
  const colors = ["#0f9f6e", "#f59e0b", "#2563eb"];
  const x = (balls: number) => pad + (balls / maxBalls) * (width - pad * 1.5);
  const y = (runs: number) => height - pad - (runs / maxRuns) * (height - pad * 1.5);
  if (points.length <= summaries.length) return <EmptyPanel title="Score graph waiting" text="The progression chart appears after ball-by-ball scoring begins." />;
  return (
    <section className="rounded-lg bg-white p-4">
      <h2 className="font-bold">Score progression</h2>
      <div className="mt-3 overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Innings score progression graph" className="h-48 w-full min-w-72">
          <line x1={pad} y1={height - pad} x2={width - 12} y2={height - pad} stroke="#d6d3d1" />
          <line x1={pad} y1={12} x2={pad} y2={height - pad} stroke="#d6d3d1" />
          <text x={pad} y={height - 6} fontSize="10" fill="#78716c">0 ov</text>
          <text x={width - 46} y={height - 6} fontSize="10" fill="#78716c">{match.overs_per_innings} ov</text>
          <text x="2" y="18" fontSize="10" fill="#78716c">{maxRuns}</text>
          {teams.map((team, teamIndex) => {
            const teamPoints = points.filter((point) => point.team === team);
            const path = teamPoints.map((point, index) => `${index === 0 ? "M" : "L"}${x(point.legalBalls)},${y(point.runs)}`).join(" ");
            return <path key={team} d={path} fill="none" stroke={colors[teamIndex % colors.length]} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />;
          })}
          {points.map((point) => {
            const teamIndex = teams.indexOf(point.team);
            return <circle key={`${point.inningsId}-${point.legalBalls}-${point.runs}`} cx={x(point.legalBalls)} cy={y(point.runs)} r="3" fill={colors[teamIndex % colors.length]} />;
          })}
          {wicketEvents.map((event) => {
            const teamIndex = teams.indexOf(event.team);
            return (
              <g key={event.id}>
                <circle cx={x(event.legalBalls)} cy={y(event.runs)} r="6" fill="#fff" stroke={colors[teamIndex % colors.length]} strokeWidth="2" />
                <text x={x(event.legalBalls)} y={y(event.runs) + 3} textAnchor="middle" fontSize="8" fontWeight="700" fill="#dc2626">w</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs">
        {teams.map((team, index) => <span key={team} className="flex items-center gap-1"><span className="inline-block size-3 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />{team}</span>)}
      </div>
      {teams.length === 1 && <p className="mt-3 text-sm text-[var(--muted)]">Only one innings has started, so the comparison will update when the other team bats.</p>}
      <div className="mt-4 rounded-lg border border-[var(--line)] p-3">
        <h3 className="text-sm font-black">Wickets</h3>
        {wicketEvents.length ? (
          <ul className="mt-2 space-y-2 text-sm">
            {wicketEvents.map((event) => <li key={event.id} className="rounded-lg bg-stone-50 p-2"><strong>{event.batter}</strong> out at {event.score} in {event.over} overs <span className="text-[var(--muted)]">({event.team}, {event.dismissal})</span></li>)}
          </ul>
        ) : <p className="mt-2 text-sm text-[var(--muted)]">No wickets yet.</p>}
      </div>
    </section>
  );
}

function SmallMatchMetric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-lg bg-white/10 p-2"><p className="font-black">{value}</p><p className="text-[10px] uppercase tracking-[0.08em] opacity-80">{label}</p></div>;
}

function deliveryExtraType(delivery: DeliveryRow): "" | "wide" | "no_ball" | "bye" | "leg_bye" {
  if (delivery.wide_runs > 0) return "wide";
  if (delivery.no_ball_runs > 0) return "no_ball";
  if (delivery.bye_runs > 0) return "bye";
  if (delivery.leg_bye_runs > 0) return "leg_bye";
  return "";
}

function deliveryExtraRuns(delivery: DeliveryRow) {
  return delivery.wide_runs || delivery.no_ball_runs || delivery.bye_runs || delivery.leg_bye_runs || 0;
}

function isEditableDismissal(value: string | null): value is EditableDismissal {
  return value === "bowled" || value === "caught" || value === "lbw" || value === "run_out" || value === "stumped" || value === "hit_wicket" || value === "retired_hurt";
}

function PlayerSelect({ label, value, rows, names, onChange, disabled = false, allowEmpty = false, emptyLabel = "Choose player" }: { label: string; value: string; rows: SquadRow[]; names: Map<string, string>; onChange: (value: string) => void; disabled?: boolean; allowEmpty?: boolean; emptyLabel?: string }) {
  return <label className="block text-sm font-semibold">{label}<select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 font-normal disabled:bg-stone-100 disabled:text-[var(--muted)]">{(allowEmpty || !value) && <option value="">{emptyLabel}</option>}{rows.length ? rows.map((row) => <option key={row.player_id} value={row.player_id}>{names.get(row.player_id) ?? "Unknown player"}</option>) : !allowEmpty && <option value="">No eligible players</option>}</select></label>;
}

function rowsForSide(squads: SquadRow[], match: MatchRow, side: "a" | "b") {
  const rows = squads.filter((row) => row.team_side === side).sort((first, second) => first.sort_order - second.sort_order);
  if (match.joker_enabled && match.joker_player_id && !rows.some((row) => row.player_id === match.joker_player_id)) {
    return [...rows, { match_id: match.id, player_id: match.joker_player_id, team_side: side, is_captain: false, sort_order: Number.MAX_SAFE_INTEGER }];
  }
  return rows;
}

function rowsForOppositeSide(squads: SquadRow[], match: MatchRow, battingSide: "a" | "b") {
  return rowsForSide(squads, match, oppositeSide(battingSide));
}

function isJoker(match: MatchRow, playerId: string) {
  return Boolean(match.joker_enabled && match.joker_player_id === playerId);
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

function CriticalMatchMetric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-lg bg-white/15 p-2"><p className="text-2xl font-black leading-none">{value}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-[0.08em] opacity-80">{label}</p></div>;
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

function oppositeSide(side: "a" | "b") {
  return side === "a" ? "b" : "a";
}

function isCorrectionsReady(match: MatchRow, summaries: ReturnType<typeof summarizeInnings>[]) {
  const hasLiveInnings = summaries.some((summary) => summary.innings.status === "in_progress");
  const secondInningsCompleted = summaries.some((summary) => summary.innings.innings_number === 2 && summary.innings.status === "completed");
  return !hasLiveInnings && (match.status === "completed" || Boolean(match.winner) || secondInningsCompleted);
}
