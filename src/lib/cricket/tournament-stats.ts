import { formatOvers, formatRate, oversAsNumber, summarizeInnings, teamName, type DeliveryRow, type InningsRow, type MatchRow, type PlayerRow } from "@/lib/cricket/stats";

export type SquadRow = { match_id: string; player_id: string; team_side: "a" | "b"; is_captain: boolean; sort_order: number };
export type TournamentRow = { id: string; name: string; start_date: string | null; location: string | null; status: "active" | "completed"; created_at: string; updated_at: string };
export type CapTone = "orange" | "purple";
export type CapDisplayRow = { id: string; rank: number; name: string; value: string; detail: string; isLeader: boolean };
export type PerformanceRow = { id: string; rank: number; name: string; value: string; detail: string; isLeader: boolean; sortValue?: number; tieValue?: number };

const TOURNAMENT_RANKING_LIMIT = 10;

export function tournamentLeaders(matches: MatchRow[], players: PlayerRow[], squads: SquadRow[], inningsRows: InningsRow[], deliveries: DeliveryRow[]) {
  const matchIds = new Set(matches.map((match) => match.id));
  const matchById = new Map(matches.map((match) => [match.id, match]));
  const summaries = inningsRows.filter((innings) => matchIds.has(innings.match_id)).map((innings) => summarizeInnings(innings, deliveries, players));
  const playerNames = new Map(players.map((player) => [player.id, player.name]));
  const batting = new Map<string, { playerId: string; name: string; runs: number; balls: number; innings: number; dismissals: number; strikeRate: number | null; average: number | null }>();
  const bowling = new Map<string, { playerId: string; name: string; wickets: number; runs: number; legalBalls: number; maidens: number; economy: number | null }>();
  const captainWins = new Map<string, { playerId: string; name: string; wins: number }>();
  const catches = new Map<string, { playerId: string; name: string; catches: number }>();
  const records = {
    mostRuns: [] as PerformanceRow[],
    bestStrikeRate: [] as PerformanceRow[],
    mostWickets: [] as PerformanceRow[],
    bestEconomy: [] as PerformanceRow[],
    bestPartnership: [] as PerformanceRow[],
  };

  for (const summary of summaries) {
    const match = matchById.get(summary.innings.match_id);
    if (!match) continue;
    const team = teamName(match, summary.innings.batting_team_side);
    const matchDetail = `${formatTournamentDate(match.match_date)} - ${team}`;

    for (const batter of summary.batters) {
      const row = batting.get(batter.playerId) ?? { playerId: batter.playerId, name: batter.name, runs: 0, balls: 0, innings: 0, dismissals: 0, strikeRate: null, average: null };
      row.runs += batter.runs;
      row.balls += batter.balls;
      row.innings += 1;
      if (batter.dismissed) row.dismissals += 1;
      row.strikeRate = row.balls ? (row.runs * 100) / row.balls : null;
      row.average = row.dismissals ? row.runs / row.dismissals : null;
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
      const row = bowling.get(bowler.playerId) ?? { playerId: bowler.playerId, name: bowler.name, wickets: 0, runs: 0, legalBalls: 0, maidens: 0, economy: null };
      row.wickets += bowler.wickets;
      row.runs += bowler.runs;
      row.legalBalls += bowler.legalBalls;
      row.maidens += bowler.maidens;
      row.economy = row.legalBalls ? row.runs / oversAsNumber(row.legalBalls) : null;
      bowling.set(bowler.playerId, row);

      if (bowler.wickets > 0) {
        records.mostWickets.push({
          id: `${summary.innings.id}-wickets-${bowler.playerId}`,
          rank: 0,
          name: bowler.name,
          value: `${bowler.wickets}-${bowler.runs}`,
          detail: `${formatOversLabel(bowler.legalBalls)} overs - ${formatTournamentDate(match.match_date)} - ${teamName(match, oppositeSide(summary.innings.batting_team_side))}`,
          isLeader: false,
        });
      }
      if (bowler.legalBalls >= 12 && bowler.economy !== null) {
        records.bestEconomy.push({
          id: `${summary.innings.id}-econ-${bowler.playerId}`,
          rank: 0,
          name: bowler.name,
          value: formatRate(bowler.economy),
          detail: `${formatOversLabel(bowler.legalBalls)} overs, ${bowler.runs} runs - ${formatTournamentDate(match.match_date)} - ${teamName(match, oppositeSide(summary.innings.batting_team_side))}`,
          isLeader: false,
        });
      }
    }

    for (const partnership of summary.partnershipFigures) {
      records.bestPartnership.push({
        id: partnership.id,
        rank: 0,
        name: partnership.names,
        value: `${partnership.runs}`,
        detail: `${formatOversLabel(partnership.legalBalls)} overs - ${matchDetail}`,
        isLeader: false,
        sortValue: partnership.runs,
        tieValue: partnership.legalBalls,
      });
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

  return {
    batting: [...batting.values()].sort((a, b) => b.runs - a.runs || (b.strikeRate ?? 0) - (a.strikeRate ?? 0)).slice(0, TOURNAMENT_RANKING_LIMIT),
    bowling: [...bowling.values()].sort((a, b) => b.wickets - a.wickets || (a.economy ?? 999) - (b.economy ?? 999)).slice(0, TOURNAMENT_RANKING_LIMIT),
    battingAverage: [...batting.values()].filter((row) => row.dismissals > 0).sort((a, b) => (b.average ?? 0) - (a.average ?? 0) || b.runs - a.runs).slice(0, TOURNAMENT_RANKING_LIMIT),
    bestEconomy: [...bowling.values()].filter((row) => row.legalBalls >= 12).sort((a, b) => (a.economy ?? 999) - (b.economy ?? 999) || b.wickets - a.wickets).slice(0, TOURNAMENT_RANKING_LIMIT),
    maidens: [...bowling.values()].filter((row) => row.maidens > 0).sort((a, b) => b.maidens - a.maidens || (a.economy ?? 999) - (b.economy ?? 999) || a.name.localeCompare(b.name)).slice(0, TOURNAMENT_RANKING_LIMIT),
    captainWins: [...captainWins.values()].sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name)).slice(0, TOURNAMENT_RANKING_LIMIT),
    catches: [...catches.values()].sort((a, b) => b.catches - a.catches || a.name.localeCompare(b.name)).slice(0, TOURNAMENT_RANKING_LIMIT),
    records: {
      mostRuns: rankPerformances(records.mostRuns, (a, b) => Number.parseInt(b.value, 10) - Number.parseInt(a.value, 10)),
      bestStrikeRate: rankPerformances(records.bestStrikeRate, (a, b) => Number(b.value) - Number(a.value)),
      mostWickets: rankPerformances(records.mostWickets, (a, b) => Number.parseInt(b.value, 10) - Number.parseInt(a.value, 10)),
      bestEconomy: rankPerformances(records.bestEconomy, (a, b) => Number(a.value) - Number(b.value)),
      bestPartnership: rankPerformances(records.bestPartnership, (a, b) => (b.sortValue ?? 0) - (a.sortValue ?? 0) || (a.tieValue ?? 999) - (b.tieValue ?? 999)),
    },
  };
}

function rankPerformances(rows: PerformanceRow[], sortFn: (a: PerformanceRow, b: PerformanceRow) => number) {
  return [...rows]
    .sort((a, b) => sortFn(a, b) || a.name.localeCompare(b.name))
    .slice(0, TOURNAMENT_RANKING_LIMIT)
    .map((row, index) => ({ ...row, rank: index + 1, isLeader: index === 0 }));
}

export function formatTournamentDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatOversLabel(legalBalls: number) {
  return formatOvers(legalBalls);
}

function oppositeSide(side: "a" | "b") {
  return side === "a" ? "b" : "a";
}
