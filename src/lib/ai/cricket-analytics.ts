import { formatOvers, summarizeInnings, teamName, type MatchRow } from "@/lib/cricket/stats";
import { tournamentLeaders } from "@/lib/cricket/tournament-stats";
import type { AiCricketData } from "@/lib/ai/cricket-data";

export type MatchCategory = "official" | "casual" | "all";

type Scope = {
  matchCategory: MatchCategory;
  tournamentId: string | null;
};

type PlayerSnapshot = {
  playerId: string;
  name: string;
  matches: number;
  winningAppearances: number;
  captainWins: number;
  runs: number;
  balls: number;
  dismissals: number;
  battingAverage: number | null;
  strikeRate: number | null;
  wickets: number;
  bowlingBalls: number;
  runsConceded: number;
  economy: number | null;
  maidens: number;
  catches: number;
  keeperCatches: number;
  fielderCatches: number;
  droppedCatches: number;
  stumpings: number;
  runOuts: number;
};

const deliveryGroupCache = new WeakMap<AiCricketData, Map<string, AiCricketData["deliveries"]>>();
const inningsSummaryCache = new WeakMap<AiCricketData, Map<string, ReturnType<typeof summarizeInnings>>>();

export function listTournaments(data: AiCricketData) {
  return data.tournaments.map((tournament) => ({ id: tournament.id, name: tournament.name, status: tournament.status, startDate: tournament.start_date }));
}

export function listUpcomingMatches(data: AiCricketData) {
  return data.matches
    .filter((match) => match.status === "upcoming" && !match.is_test)
    .sort((first, second) => first.match_date.localeCompare(second.match_date))
    .slice(0, 20)
    .map((match) => ({
      id: match.id,
      date: match.match_date,
      teamA: match.team_a_name,
      teamB: match.team_b_name,
      location: match.location,
      selectedPlayers: data.squads.filter((row) => row.match_id === match.id).length,
    }));
}

export function playerLeaderboard(data: AiCricketData, metric: string, scope: Scope, limit = 10) {
  const matches = scopedMatches(data, scope);
  const snapshots = data.players.map((player) => playerSnapshot(data, matches, player.id));
  const value = (row: PlayerSnapshot) => metricValue(row, metric);
  const qualified = snapshots.filter((row) => qualifies(row, metric));
  qualified.sort((first, second) => {
    const firstValue = value(first) ?? 0;
    const secondValue = value(second) ?? 0;
    const direction = metric === "economy" ? firstValue - secondValue : secondValue - firstValue;
    return direction || second.matches - first.matches || first.name.localeCompare(second.name);
  });
  return {
    metric,
    matchCount: matches.length,
    rows: qualified.slice(0, Math.min(Math.max(limit, 1), 10)).map((row, index) => ({ rank: index + 1, value: value(row), ...row })),
  };
}

export function comparePlayers(data: AiCricketData, names: string[], scope: Scope) {
  const matches = scopedMatches(data, scope);
  const resolved = names.map((name) => resolvePlayer(data, name));
  return {
    matchCount: matches.length,
    players: resolved.map((player, index) => player ? playerSnapshot(data, matches, player.id) : { requestedName: names[index], error: "Player not found." }),
  };
}

export function teamResults(data: AiCricketData, teamNameQuery: string | null, opponentQuery: string | null, scope: Scope) {
  const matches = scopedMatches(data, scope);
  const teamQuery = teamNameQuery?.trim().toLowerCase() || null;
  const opponent = opponentQuery?.trim().toLowerCase() || null;
  const selected = matches.filter((match) => {
    const teams = [match.team_a_name.toLowerCase(), match.team_b_name.toLowerCase()];
    return (!teamQuery || teams.some((team) => team.includes(teamQuery))) && (!opponent || teams.some((team) => team.includes(opponent)));
  });
  return {
    totalMatches: selected.length,
    matches: selected.slice(0, 50).map((match) => ({
      matchId: match.id,
      date: match.match_date,
      teamA: match.team_a_name,
      teamB: match.team_b_name,
      winner: match.winner,
      location: match.location,
    })),
  };
}

export function matchScorecard(data: AiCricketData, matchId: string | null, matchDate: string | null, teamNameQuery: string | null) {
  if (!matchId && !matchDate && !teamNameQuery) return { error: "Provide a match ID, date, or team name." };
  const query = teamNameQuery?.trim().toLowerCase() || null;
  const match = data.matches.find((row) => matchId ? row.id === matchId : (!matchDate || row.match_date === matchDate) && (!query || row.team_a_name.toLowerCase().includes(query) || row.team_b_name.toLowerCase().includes(query)));
  if (!match) return { error: "Match not found." };
  const innings = data.innings.filter((row) => row.match_id === match.id);
  return {
    match: { id: match.id, date: match.match_date, location: match.location, teamA: match.team_a_name, teamB: match.team_b_name, winner: match.winner, status: match.status },
    innings: innings.map((row) => {
      const summary = inningsSummary(data, row.id);
      return {
        team: teamName(match, row.batting_team_side),
        score: `${summary.runs}-${summary.wickets}`,
        overs: summary.overs,
        batters: summary.batters.map((batter) => ({ name: batter.name, runs: batter.runs, balls: batter.balls, dismissed: batter.dismissed, strikeRate: batter.strikeRate })),
        bowlers: summary.bowlers.map((bowler) => ({ name: bowler.name, overs: formatOvers(bowler.legalBalls), runs: bowler.runs, wickets: bowler.wickets, economy: bowler.economy })),
      };
    }),
  };
}

export function tournamentRecords(data: AiCricketData, tournamentId: string, matchCategory: MatchCategory) {
  const matches = scopedMatches(data, { tournamentId, matchCategory });
  const matchIds = new Set(matches.map((match) => match.id));
  const squads = data.squads.filter((row) => matchIds.has(row.match_id));
  const innings = data.innings.filter((row) => matchIds.has(row.match_id));
  const inningsIds = new Set(innings.map((row) => row.id));
  const deliveries = data.deliveries.filter((row) => inningsIds.has(row.innings_id));
  const tournament = data.tournaments.find((row) => row.id === tournamentId);
  if (!tournament) return { error: "Tournament not found." };
  return { tournament: tournament.name, matchCount: matches.length, leaders: tournamentLeaders(matches, data.players, squads, innings, deliveries) };
}

export function compareSelectedTeams(data: AiCricketData, matchId: string, scope: Scope) {
  const match = data.matches.find((row) => row.id === matchId);
  if (!match) return { error: "Match not found." };
  if (match.status !== "upcoming") return { error: "Team comparison is available only before the match starts." };
  const selectedSquads = data.squads.filter((row) => row.match_id === matchId && row.player_id !== match.joker_player_id);
  const history = scopedMatches(data, scope).filter((row) => row.id !== matchId && row.match_date <= match.match_date);
  const playerNames = new Map(data.players.map((player) => [player.id, player.name]));
  const teamAIds = selectedSquads.filter((row) => row.team_side === "a").map((row) => row.player_id);
  const teamBIds = selectedSquads.filter((row) => row.team_side === "b").map((row) => row.player_id);
  return {
    match: { id: match.id, date: match.match_date, teamA: match.team_a_name, teamB: match.team_b_name },
    excludedJoker: match.joker_enabled && match.joker_player_id ? playerNames.get(match.joker_player_id) ?? "Unknown player" : null,
    career: {
      teamA: aggregateTeam(data, history, teamAIds, false),
      teamB: aggregateTeam(data, history, teamBIds, false),
    },
    recentFive: {
      teamA: aggregateTeam(data, history, teamAIds, true),
      teamB: aggregateTeam(data, history, teamBIds, true),
    },
  };
}

function scopedMatches(data: AiCricketData, scope: Scope) {
  return data.matches.filter((match) => {
    if (match.status !== "completed") return false;
    if (match.is_test) return false;
    if (scope.matchCategory === "official" && !match.counts_toward_career_stats) return false;
    if (scope.matchCategory === "casual" && match.counts_toward_career_stats) return false;
    if (scope.tournamentId && match.tournament_id !== scope.tournamentId) return false;
    return true;
  });
}

function playerSnapshot(data: AiCricketData, matches: MatchRow[], playerId: string): PlayerSnapshot {
  const player = data.players.find((row) => row.id === playerId);
  const matchIds = new Set(matches.map((match) => match.id));
  const innings = data.innings.filter((row) => matchIds.has(row.match_id));
  const deliveriesByInnings = groupDeliveries(data);
  let runs = 0;
  let balls = 0;
  let dismissals = 0;
  let wickets = 0;
  let bowlingBalls = 0;
  let runsConceded = 0;
  let maidens = 0;
  let catches = 0;
  let keeperCatches = 0;
  let droppedCatches = 0;
  let stumpings = 0;
  let runOuts = 0;
  const involvedMatches = new Set<string>();

  for (const row of innings) {
    const deliveries = deliveriesByInnings.get(row.id) ?? [];
    const summary = inningsSummary(data, row.id);
    const batter = summary.batters.find((figure) => figure.playerId === playerId);
    const bowler = summary.bowlers.find((figure) => figure.playerId === playerId);
    if (batter) {
      runs += batter.runs;
      balls += batter.balls;
      if (batter.dismissed) dismissals += 1;
      involvedMatches.add(row.match_id);
    }
    if (bowler) {
      wickets += bowler.wickets;
      bowlingBalls += bowler.legalBalls;
      runsConceded += bowler.runs;
      maidens += bowler.maidens;
      involvedMatches.add(row.match_id);
    }
    for (const delivery of deliveries) {
      if (delivery.dismissal === "caught" && delivery.fielder_id === playerId) {
        catches += 1;
        if (row.wicket_keeper_id === playerId) keeperCatches += 1;
      }
      if (delivery.catch_dropped && delivery.catch_drop_fielder_id === playerId) droppedCatches += 1;
      if (delivery.dismissal === "stumped" && delivery.fielder_id === playerId) stumpings += 1;
      if (delivery.dismissal === "run_out" && delivery.fielder_id === playerId) runOuts += 1;
    }
  }

  const squadMatches = data.squads.filter((row) => row.player_id === playerId && matchIds.has(row.match_id));
  squadMatches.forEach((row) => involvedMatches.add(row.match_id));
  let winningAppearances = 0;
  let captainWins = 0;
  for (const match of matches) {
    if (!match.winner || match.winner === "Tie" || match.joker_player_id === playerId) continue;
    const winningSide = match.winner === match.team_a_name ? "a" : match.winner === match.team_b_name ? "b" : null;
    const squad = squadMatches.find((row) => row.match_id === match.id && row.team_side === winningSide);
    if (!squad) continue;
    winningAppearances += 1;
    if (squad.is_captain) captainWins += 1;
  }

  return {
    playerId,
    name: player?.name ?? "Unknown player",
    matches: involvedMatches.size,
    winningAppearances,
    captainWins,
    runs,
    balls,
    dismissals,
    battingAverage: dismissals ? runs / dismissals : null,
    strikeRate: balls ? (runs * 100) / balls : null,
    wickets,
    bowlingBalls,
    runsConceded,
    economy: bowlingBalls ? runsConceded / (bowlingBalls / 6) : null,
    maidens,
    catches,
    keeperCatches,
    fielderCatches: catches - keeperCatches,
    droppedCatches,
    stumpings,
    runOuts,
  };
}

function aggregateTeam(data: AiCricketData, history: MatchRow[], playerIds: string[], recentOnly: boolean) {
  const names = new Map(data.players.map((player) => [player.id, player.name]));
  const snapshots = playerIds.map((playerId) => {
    const playerMatchIds = new Set(data.squads.filter((row) => row.player_id === playerId).map((row) => row.match_id));
    const playerHistory = history.filter((match) => playerMatchIds.has(match.id)).sort((a, b) => b.match_date.localeCompare(a.match_date));
    return playerSnapshot(data, recentOnly ? playerHistory.slice(0, 5) : playerHistory, playerId);
  });
  const known = snapshots.filter((row) => row.matches > 0);
  const sum = (pick: (row: PlayerSnapshot) => number) => known.reduce((total, row) => total + pick(row), 0);
  const runs = sum((row) => row.runs);
  const balls = sum((row) => row.balls);
  const dismissals = sum((row) => row.dismissals);
  const wickets = sum((row) => row.wickets);
  const bowlingBalls = sum((row) => row.bowlingBalls);
  const runsConceded = sum((row) => row.runsConceded);
  const fieldingDismissals = sum((row) => row.catches + row.stumpings + row.runOuts);
  return {
    selectedPlayers: playerIds.length,
    playersWithHistory: known.length,
    insufficientData: snapshots.filter((row) => row.matches === 0).map((row) => names.get(row.playerId) ?? row.name),
    batting: {
      runsPerKnownPlayer: known.length ? runs / known.length : null,
      average: dismissals ? runs / dismissals : null,
      strikeRate: balls ? (runs * 100) / balls : null,
    },
    bowling: {
      wicketsPerKnownPlayer: known.length ? wickets / known.length : null,
      economy: bowlingBalls ? runsConceded / (bowlingBalls / 6) : null,
      overs: bowlingBalls / 6,
    },
    fielding: {
      dismissalsPerKnownPlayer: known.length ? fieldingDismissals / known.length : null,
      catches: sum((row) => row.catches),
      stumpings: sum((row) => row.stumpings),
      runOuts: sum((row) => row.runOuts),
      droppedCatches: sum((row) => row.droppedCatches),
    },
  };
}

function metricValue(row: PlayerSnapshot, metric: string) {
  const values: Record<string, number | null> = {
    winning_appearances: row.winningAppearances,
    captain_wins: row.captainWins,
    matches: row.matches,
    runs: row.runs,
    batting_average: row.battingAverage,
    strike_rate: row.strikeRate,
    wickets: row.wickets,
    economy: row.economy,
    maidens: row.maidens,
    catches: row.catches,
    keeper_catches: row.keeperCatches,
    fielder_catches: row.fielderCatches,
    dropped_catches: row.droppedCatches,
    stumpings: row.stumpings,
    run_outs: row.runOuts,
  };
  return values[metric] ?? null;
}

function qualifies(row: PlayerSnapshot, metric: string) {
  const value = metricValue(row, metric);
  if (value === null) return false;
  if (metric === "batting_average") return row.dismissals > 0;
  if (metric === "strike_rate") return row.balls > 0;
  if (metric === "economy") return row.bowlingBalls >= 12;
  return value > 0;
}

function resolvePlayer(data: AiCricketData, name: string) {
  const query = name.trim().toLowerCase();
  return data.players.find((player) => player.name.toLowerCase() === query) ?? data.players.find((player) => player.name.toLowerCase().includes(query));
}

function groupDeliveries(data: AiCricketData) {
  const cached = deliveryGroupCache.get(data);
  if (cached) return cached;
  const grouped = new Map<string, typeof data.deliveries>();
  for (const delivery of data.deliveries) {
    const rows = grouped.get(delivery.innings_id) ?? [];
    rows.push(delivery);
    grouped.set(delivery.innings_id, rows);
  }
  deliveryGroupCache.set(data, grouped);
  return grouped;
}

function inningsSummary(data: AiCricketData, inningsId: string) {
  let cached = inningsSummaryCache.get(data);
  if (!cached) {
    cached = new Map();
    inningsSummaryCache.set(data, cached);
  }
  const existing = cached.get(inningsId);
  if (existing) return existing;
  const innings = data.innings.find((row) => row.id === inningsId);
  if (!innings) throw new Error("Innings not found while calculating AI statistics.");
  const summary = summarizeInnings(innings, groupDeliveries(data).get(inningsId) ?? [], data.players);
  cached.set(inningsId, summary);
  return summary;
}
