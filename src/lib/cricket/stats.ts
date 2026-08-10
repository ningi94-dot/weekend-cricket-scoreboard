import type { Database } from "@/lib/supabase/client";

export type PlayerRow = Database["public"]["Tables"]["players"]["Row"];
export type MatchRow = Database["public"]["Tables"]["matches"]["Row"];
export type InningsRow = Database["public"]["Tables"]["innings"]["Row"];
export type DeliveryRow = Database["public"]["Tables"]["deliveries"]["Row"];

export type BatterFigure = {
  playerId: string;
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  dismissed: boolean;
  dismissalText: string;
  strikeRate: number | null;
};

export type BowlerFigure = {
  playerId: string;
  name: string;
  legalBalls: number;
  maidens: number;
  runs: number;
  wickets: number;
  wideDeliveries: number;
  wideRuns: number;
  noBallDeliveries: number;
  noBallRuns: number;
  extrasConceded: number;
  economy: number | null;
  average: number | null;
  strikeRate: number | null;
};

export type OverSummary = {
  overNumber: number;
  labels: string[];
  runs: number;
  wickets: number;
  scoreAfterOver: string;
};

export type PartnershipFigure = {
  id: string;
  batterIds: [string, string | null];
  names: string;
  runs: number;
  legalBalls: number;
  endedAt: string | null;
};

export type InningsSummary = {
  innings: InningsRow;
  deliveries: DeliveryRow[];
  runs: number;
  wickets: number;
  legalBalls: number;
  overs: string;
  runRate: number | null;
  extras: {
    total: number;
    wides: number;
    noBalls: number;
    byes: number;
    legByes: number;
    penalties: number;
  };
  batters: BatterFigure[];
  bowlers: BowlerFigure[];
  oversBreakdown: OverSummary[];
  fallOfWickets: string[];
  partnerships: string[];
  partnershipFigures: PartnershipFigure[];
};

export type MatchBundle = {
  match: MatchRow;
  players: PlayerRow[];
  squads: { match_id: string; player_id: string; team_side: "a" | "b"; is_captain: boolean; sort_order: number }[];
  innings: InningsRow[];
  deliveries: DeliveryRow[];
};

export type ChaseInfo = {
  target: number;
  runsNeeded: number;
  ballsRemaining: number;
  currentRunRate: number | null;
  requiredRunRate: number | null;
  sentence: string;
  isComplete: boolean;
};

export type ScoreProgressionPoint = {
  inningsId: string;
  team: string;
  overLabel: string;
  legalBalls: number;
  runs: number;
};

const bowlerCreditedDismissals = new Set(["bowled", "caught", "lbw", "stumped", "hit_wicket"]);
const fieldingCreditDismissals = new Set(["caught", "run_out", "stumped"]);

export function formatOvers(legalBalls: number) {
  return `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`;
}

export function oversAsNumber(legalBalls: number) {
  return legalBalls / 6;
}

export function safeRate(numerator: number, denominator: number) {
  if (!denominator) return null;
  return numerator / denominator;
}

export function formatRate(value: number | null, digits = 1) {
  if (value === null || Number.isNaN(value) || !Number.isFinite(value)) return "-";
  return value.toFixed(digits);
}

export function deliveryRuns(delivery: Pick<DeliveryRow, "batter_runs" | "wide_runs" | "no_ball_runs" | "bye_runs" | "leg_bye_runs" | "penalty_runs">) {
  return delivery.batter_runs + delivery.wide_runs + delivery.no_ball_runs + delivery.bye_runs + delivery.leg_bye_runs + delivery.penalty_runs;
}

export function deliveryLabel(delivery: DeliveryRow) {
  const parts: string[] = [];
  if (delivery.is_wicket) parts.push("W");
  if (delivery.wide_runs) parts.push(delivery.wide_runs > 1 ? `${delivery.wide_runs}WD` : "WD");
  if (delivery.no_ball_runs) parts.push(delivery.no_ball_runs > 1 ? `${delivery.no_ball_runs}NB` : "NB");
  if (delivery.bye_runs) parts.push(delivery.bye_runs > 1 ? `${delivery.bye_runs}B` : "B");
  if (delivery.leg_bye_runs) parts.push(delivery.leg_bye_runs > 1 ? `${delivery.leg_bye_runs}LB` : "LB");
  if (delivery.penalty_runs) parts.push(`${delivery.penalty_runs}P`);
  if (delivery.batter_runs && !delivery.is_wicket) parts.unshift(String(delivery.batter_runs));
  if (!parts.length) return String(delivery.batter_runs);
  return parts.join("+");
}

export function deliveryAccessibleLabel(delivery: DeliveryRow, playersById: Map<string, string>) {
  const runs = deliveryRuns(delivery);
  const extras = delivery.wide_runs + delivery.no_ball_runs + delivery.bye_runs + delivery.leg_bye_runs + delivery.penalty_runs;
  const details = [
    `${playerName(playersById, delivery.bowler_id)} to ${playerName(playersById, delivery.striker_id)}`,
    `${runs} run${runs === 1 ? "" : "s"}`,
  ];
  if (extras) details.push(`${extras} extra${extras === 1 ? "" : "s"}`);
  if (delivery.is_wicket) details.push(`wicket: ${dismissalText(delivery, playersById)}`);
  return details.join(", ");
}

export function playerName(playersById: Map<string, string>, playerId: string | null | undefined) {
  if (!playerId) return "Unknown player";
  return playersById.get(playerId) ?? "Unknown player";
}

export function dismissalText(delivery: DeliveryRow | undefined, playersById: Map<string, string>) {
  if (!delivery || !delivery.dismissal) return "not out";
  const bowler = playerName(playersById, delivery.bowler_id);
  switch (delivery.dismissal) {
    case "bowled":
      return `b ${bowler}`;
    case "caught":
      return `c ${playerName(playersById, delivery.fielder_id)} b ${bowler}`;
    case "lbw":
      return `lbw b ${bowler}`;
    case "run_out":
      return `run out (${playerName(playersById, delivery.fielder_id)})`;
    case "stumped":
      return `st ${playerName(playersById, delivery.fielder_id)} b ${bowler}`;
    case "hit_wicket":
      return `hit wicket b ${bowler}`;
    case "retired_hurt":
      return "retired hurt";
    case "retired_out":
      return "retired out";
    default:
      return delivery.dismissal.replaceAll("_", " ");
  }
}

export function summarizeInnings(innings: InningsRow, deliveries: DeliveryRow[], players: PlayerRow[]): InningsSummary {
  const playersById = new Map(players.map((player) => [player.id, player.name]));
  const ordered = [...deliveries].filter((delivery) => delivery.innings_id === innings.id).sort((a, b) => a.sequence_number - b.sequence_number);
  const batters = new Map<string, BatterFigure>();
  const bowlers = new Map<string, BowlerFigure>();
  const dismissalByPlayer = new Map<string, DeliveryRow>();
  const overRuns = new Map<number, number>();
  const overWickets = new Map<number, number>();
  const overLabels = new Map<number, string[]>();
  const scoreAfterOver = new Map<number, string>();
  const maidenOverCandidates = new Map<string, { bowlerId: string; legalBalls: number; concededRuns: number }>();
  const fallOfWickets: string[] = [];
  const partnershipFigures: PartnershipFigure[] = [];
  const extras = { total: 0, wides: 0, noBalls: 0, byes: 0, legByes: 0, penalties: 0 };
  let runs = 0;
  let wickets = 0;
  let legalBalls = 0;
  type CurrentPartnership = { batterIds: [string, string | null]; runs: number; legalBalls: number };
  let currentPartnership: CurrentPartnership | null = null;
  let pendingRemainingBatterId: string | null = null;

  function ensureBatter(playerId: string) {
    if (!batters.has(playerId)) {
      batters.set(playerId, {
        playerId,
        name: playerName(playersById, playerId),
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        dismissed: false,
        dismissalText: "not out",
        strikeRate: null,
      });
    }
    return batters.get(playerId)!;
  }

  function ensureBowler(playerId: string) {
    if (!bowlers.has(playerId)) {
      bowlers.set(playerId, {
        playerId,
        name: playerName(playersById, playerId),
        legalBalls: 0,
        maidens: 0,
        runs: 0,
        wickets: 0,
        wideDeliveries: 0,
        wideRuns: 0,
        noBallDeliveries: 0,
        noBallRuns: 0,
        extrasConceded: 0,
        economy: null,
        average: null,
        strikeRate: null,
      });
    }
    return bowlers.get(playerId)!;
  }

  function closePartnership(endedAt: string | null) {
    if (!currentPartnership || (currentPartnership.runs === 0 && currentPartnership.legalBalls === 0)) {
      currentPartnership = null;
      return;
    }
    partnershipFigures.push({
      id: `${innings.id}-partnership-${partnershipFigures.length + 1}`,
      batterIds: currentPartnership.batterIds,
      names: partnershipName(playersById, currentPartnership.batterIds),
      runs: currentPartnership.runs,
      legalBalls: currentPartnership.legalBalls,
      endedAt,
    });
    currentPartnership = null;
  }

  function createPartnership(strikerId: string, nonStrikerId: string | null): CurrentPartnership {
    const batterIds = partnershipPair(strikerId, nonStrikerId, pendingRemainingBatterId);
    pendingRemainingBatterId = null;
    return { batterIds, runs: 0, legalBalls: 0 };
  }

  function upgradeSoloPartnership(partnership: CurrentPartnership, strikerId: string, nonStrikerId: string | null) {
    if (partnership.batterIds[1]) return;
    const soloBatterId = partnership.batterIds[0];
    const partnerId = [strikerId, nonStrikerId].find((playerId): playerId is string => Boolean(playerId && playerId !== soloBatterId));
    if (partnerId) partnership.batterIds = [soloBatterId, partnerId];
  }

  for (const delivery of ordered) {
    const total = deliveryRuns(delivery);
    const batter = ensureBatter(delivery.striker_id);
    if (delivery.non_striker_id) ensureBatter(delivery.non_striker_id);
    const bowler = ensureBowler(delivery.bowler_id);
    if (!currentPartnership) currentPartnership = createPartnership(delivery.striker_id, delivery.non_striker_id);
    else upgradeSoloPartnership(currentPartnership, delivery.striker_id, delivery.non_striker_id);
    const partnership = currentPartnership;

    runs += total;
    partnership.runs += total;
    extras.wides += delivery.wide_runs;
    extras.noBalls += delivery.no_ball_runs;
    extras.byes += delivery.bye_runs;
    extras.legByes += delivery.leg_bye_runs;
    extras.penalties += delivery.penalty_runs;
    extras.total += delivery.wide_runs + delivery.no_ball_runs + delivery.bye_runs + delivery.leg_bye_runs + delivery.penalty_runs;

    batter.runs += delivery.batter_runs;
    if (delivery.is_legal_delivery) {
      batter.balls += 1;
      bowler.legalBalls += 1;
      legalBalls += 1;
      partnership.legalBalls += 1;
    }
    if (delivery.batter_runs === 4) batter.fours += 1;
    if (delivery.batter_runs === 6) batter.sixes += 1;

    const bowlerConcededRuns = delivery.batter_runs + delivery.wide_runs + delivery.no_ball_runs + delivery.penalty_runs;
    bowler.runs += bowlerConcededRuns;
    bowler.wideRuns += delivery.wide_runs;
    bowler.noBallRuns += delivery.no_ball_runs;
    bowler.extrasConceded += delivery.wide_runs + delivery.no_ball_runs;
    if (delivery.wide_runs > 0) bowler.wideDeliveries += 1;
    if (delivery.no_ball_runs > 0) bowler.noBallDeliveries += 1;
    if (delivery.is_wicket && delivery.dismissed_player_id) {
      wickets += 1;
      dismissalByPlayer.set(delivery.dismissed_player_id, delivery);
      const dismissed = ensureBatter(delivery.dismissed_player_id);
      dismissed.dismissed = true;
      dismissed.dismissalText = dismissalText(delivery, playersById);
      if (delivery.dismissal && bowlerCreditedDismissals.has(delivery.dismissal)) bowler.wickets += 1;
      fallOfWickets.push(`${wickets}-${runs} (${dismissed.name}, ${formatOvers(legalBalls)} ov)`);
      pendingRemainingBatterId = remainingPartnershipBatter(partnership.batterIds, delivery.dismissed_player_id);
      closePartnership(`${wickets}-${runs}`);
    }

    const overNumber = delivery.over_number;
    const maidenKey = `${delivery.bowler_id}:${overNumber}`;
    const maidenCandidate = maidenOverCandidates.get(maidenKey) ?? { bowlerId: delivery.bowler_id, legalBalls: 0, concededRuns: 0 };
    maidenCandidate.concededRuns += bowlerConcededRuns;
    if (delivery.is_legal_delivery) maidenCandidate.legalBalls += 1;
    maidenOverCandidates.set(maidenKey, maidenCandidate);
    overRuns.set(overNumber, (overRuns.get(overNumber) ?? 0) + total);
    overWickets.set(overNumber, (overWickets.get(overNumber) ?? 0) + (delivery.is_wicket ? 1 : 0));
    overLabels.set(overNumber, [...(overLabels.get(overNumber) ?? []), deliveryLabel(delivery)]);
    scoreAfterOver.set(overNumber, `${runs}-${wickets}`);
  }

  closePartnership(null);

  for (const batter of batters.values()) {
    const dismissal = dismissalByPlayer.get(batter.playerId);
    batter.dismissalText = dismissalText(dismissal, playersById);
    batter.strikeRate = safeRate(batter.runs * 100, batter.balls);
  }

  for (const over of maidenOverCandidates.values()) {
    if (over.legalBalls === 6 && over.concededRuns === 0) {
      ensureBowler(over.bowlerId).maidens += 1;
    }
  }

  for (const bowler of bowlers.values()) {
    bowler.economy = safeRate(bowler.runs, oversAsNumber(bowler.legalBalls));
    bowler.average = safeRate(bowler.runs, bowler.wickets);
    bowler.strikeRate = safeRate(bowler.legalBalls, bowler.wickets);
  }

  const oversBreakdown = [...overLabels.entries()].map(([overNumber, labels]) => ({
    overNumber,
    labels,
    runs: overRuns.get(overNumber) ?? 0,
    wickets: overWickets.get(overNumber) ?? 0,
    scoreAfterOver: scoreAfterOver.get(overNumber) ?? "0-0",
  }));

  return {
    innings,
    deliveries: ordered,
    runs,
    wickets,
    legalBalls,
    overs: formatOvers(legalBalls),
    runRate: safeRate(runs, oversAsNumber(legalBalls)),
    extras,
    batters: [...batters.values()],
    bowlers: [...bowlers.values()],
    oversBreakdown,
    fallOfWickets,
    partnerships: partnershipFigures.map((partnership) =>
      `${partnership.names}: ${partnership.runs} runs in ${formatOvers(partnership.legalBalls)} overs${partnership.endedAt ? `, ended at ${partnership.endedAt}` : ""}`
    ),
    partnershipFigures,
  };
}

function partnershipPair(strikerId: string, nonStrikerId: string | null, pendingRemainingBatterId: string | null): [string, string | null] {
  if (!pendingRemainingBatterId) return [strikerId, nonStrikerId];
  if (strikerId === pendingRemainingBatterId) return [strikerId, nonStrikerId];
  if (nonStrikerId === pendingRemainingBatterId) return [strikerId, nonStrikerId];
  return [strikerId, pendingRemainingBatterId];
}

function remainingPartnershipBatter(batters: [string, string | null], dismissedPlayerId: string) {
  return batters.find((playerId): playerId is string => Boolean(playerId && playerId !== dismissedPlayerId)) ?? null;
}

function partnershipName(playersById: Map<string, string>, batters: [string, string | null]) {
  return batters[1] ? `${playerName(playersById, batters[0])} & ${playerName(playersById, batters[1])}` : `${playerName(playersById, batters[0])} solo`;
}

export function teamName(match: MatchRow, side: "a" | "b") {
  return side === "a" ? match.team_a_name : match.team_b_name;
}

export function chooseFeaturedMatch(matches: MatchRow[], now = new Date()) {
  const live = matches.find((match) => match.status === "live");
  if (live) return live;
  const today = now.toISOString().slice(0, 10);
  const upcoming = matches
    .filter((match) => match.status === "upcoming" && match.match_date >= today)
    .sort((a, b) => a.match_date.localeCompare(b.match_date))[0];
  if (upcoming) return upcoming;
  return matches.filter((match) => match.status === "completed").sort((a, b) => b.match_date.localeCompare(a.match_date))[0] ?? matches[0] ?? null;
}

export function summarizePlayer(playerId: string, bundle: Pick<MatchBundle, "players" | "innings" | "deliveries">) {
  const inningsSummaries = bundle.innings.map((innings) => summarizeInnings(innings, bundle.deliveries, bundle.players));
  const battingInnings = inningsSummaries.map((summary) => summary.batters.find((batter) => batter.playerId === playerId)).filter(Boolean) as BatterFigure[];
  const bowlingInnings = inningsSummaries.map((summary) => summary.bowlers.find((bowler) => bowler.playerId === playerId)).filter(Boolean) as BowlerFigure[];
  const runs = battingInnings.reduce((sum, innings) => sum + innings.runs, 0);
  const balls = battingInnings.reduce((sum, innings) => sum + innings.balls, 0);
  const dismissals = battingInnings.filter((innings) => innings.dismissed).length;
  const wickets = bowlingInnings.reduce((sum, innings) => sum + innings.wickets, 0);
  const bowlingBalls = bowlingInnings.reduce((sum, innings) => sum + innings.legalBalls, 0);
  const maidens = bowlingInnings.reduce((sum, innings) => sum + innings.maidens, 0);
  const conceded = bowlingInnings.reduce((sum, innings) => sum + innings.runs, 0);
  const wideDeliveries = bowlingInnings.reduce((sum, innings) => sum + innings.wideDeliveries, 0);
  const wideRuns = bowlingInnings.reduce((sum, innings) => sum + innings.wideRuns, 0);
  const noBallDeliveries = bowlingInnings.reduce((sum, innings) => sum + innings.noBallDeliveries, 0);
  const noBallRuns = bowlingInnings.reduce((sum, innings) => sum + innings.noBallRuns, 0);
  const extrasConceded = bowlingInnings.reduce((sum, innings) => sum + innings.extrasConceded, 0);
  const highest = battingInnings.reduce((best, innings) => innings.runs > best.runs ? { runs: innings.runs, notOut: !innings.dismissed } : best, { runs: 0, notOut: false });
  const catches = bundle.deliveries.filter((delivery) => delivery.fielder_id === playerId && delivery.dismissal === "caught").length;
  const stumpings = bundle.deliveries.filter((delivery) => delivery.fielder_id === playerId && delivery.dismissal === "stumped").length;
  const runOuts = bundle.deliveries.filter((delivery) => delivery.fielder_id === playerId && delivery.dismissal === "run_out").length;
  return {
    matches: new Set(bundle.innings.filter((innings) => {
      const related = bundle.deliveries.filter((delivery) => delivery.innings_id === innings.id);
      return related.some((delivery) => delivery.striker_id === playerId || delivery.non_striker_id === playerId || delivery.bowler_id === playerId);
    }).map((innings) => innings.match_id)).size,
    innings: battingInnings.length,
    runs,
    balls,
    highest,
    average: safeRate(runs, dismissals),
    strikeRate: safeRate(runs * 100, balls),
    notOuts: battingInnings.length - dismissals,
    fours: battingInnings.reduce((sum, innings) => sum + innings.fours, 0),
    sixes: battingInnings.reduce((sum, innings) => sum + innings.sixes, 0),
    bowlingInnings: bowlingInnings.length,
    bowlingBalls,
    maidens,
    runsConceded: conceded,
    wideDeliveries,
    wideRuns,
    noBallDeliveries,
    noBallRuns,
    extrasConceded,
    wickets,
    economy: safeRate(conceded, oversAsNumber(bowlingBalls)),
    bowlingAverage: safeRate(conceded, wickets),
    bowlingStrikeRate: safeRate(bowlingBalls, wickets),
    bestBowling: bowlingInnings.sort((a, b) => b.wickets - a.wickets || a.runs - b.runs)[0] ?? null,
    catches,
    stumpings,
    runOuts,
    fieldingDismissals: catches + stumpings + runOuts,
  };
}

export function dismissalNeedsFielder(dismissal: string | null | undefined) {
  return Boolean(dismissal && fieldingCreditDismissals.has(dismissal));
}

export function replacementIsNeeded(dismissal: string | null | undefined) {
  return dismissal !== "retired_hurt";
}

export function getChaseInfo(match: MatchRow, summary: InningsSummary | null): ChaseInfo | null {
  if (!summary || summary.innings.innings_number !== 2 || !summary.innings.target_runs) return null;
  const maxLegalBalls = match.overs_per_innings * 6;
  const ballsRemaining = Math.max(0, maxLegalBalls - summary.legalBalls);
  const runsNeeded = Math.max(0, summary.innings.target_runs - summary.runs);
  const requiredRunRate = ballsRemaining > 0 && runsNeeded > 0 ? runsNeeded / (ballsRemaining / 6) : null;
  const isComplete = runsNeeded === 0 || ballsRemaining === 0 || summary.innings.status === "completed";
  return {
    target: summary.innings.target_runs,
    runsNeeded,
    ballsRemaining,
    currentRunRate: summary.runRate,
    requiredRunRate,
    sentence: runsNeeded === 0
      ? `${teamName(match, summary.innings.batting_team_side)} reached the target.`
      : `${teamName(match, summary.innings.batting_team_side)} needs ${runsNeeded} run${runsNeeded === 1 ? "" : "s"} from ${ballsRemaining} ball${ballsRemaining === 1 ? "" : "s"}`,
    isComplete,
  };
}

export function scoreProgression(match: MatchRow, summaries: InningsSummary[]): ScoreProgressionPoint[] {
  return summaries.flatMap((summary) => {
    const points: ScoreProgressionPoint[] = [{
      inningsId: summary.innings.id,
      team: teamName(match, summary.innings.batting_team_side),
      overLabel: "0.0",
      legalBalls: 0,
      runs: 0,
    }];
    let runs = 0;
    let legalBalls = 0;
    for (const delivery of summary.deliveries) {
      runs += deliveryRuns(delivery);
      if (delivery.is_legal_delivery) legalBalls += 1;
      if (delivery.is_legal_delivery && legalBalls % 6 === 0) {
        points.push({
          inningsId: summary.innings.id,
          team: teamName(match, summary.innings.batting_team_side),
          overLabel: formatOvers(legalBalls),
          legalBalls,
          runs,
        });
      }
    }
    if (summary.deliveries.length && (legalBalls % 6 !== 0 || points.length === 1)) {
      points.push({
        inningsId: summary.innings.id,
        team: teamName(match, summary.innings.batting_team_side),
        overLabel: formatOvers(legalBalls),
        legalBalls,
        runs,
      });
    }
    return points;
  });
}
