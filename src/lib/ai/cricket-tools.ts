import { comparePlayers, compareSelectedTeams, listTournaments, listUpcomingMatches, matchScorecard, playerLeaderboard, teamResults, tournamentRecords, type MatchCategory } from "@/lib/ai/cricket-analytics";
import { loadAiCricketData } from "@/lib/ai/cricket-data";
import type { AiToolDefinition, AiToolExecutor } from "@/lib/ai/types";

const matchCategoryProperty = { type: "string", enum: ["official", "casual", "all"] };
const tournamentIdProperty = { type: ["string", "null"] };

export function createCricketToolset(): { tools: AiToolDefinition[]; executeTool: AiToolExecutor } {
  let dataPromise: ReturnType<typeof loadAiCricketData> | null = null;
  const getData = () => {
    dataPromise ??= loadAiCricketData();
    return dataPromise;
  };

  const tools: AiToolDefinition[] = [
    {
      name: "list_tournaments",
      description: "List available tournaments so the user can clarify which tournament they mean.",
      parameters: objectSchema({}, []),
    },
    {
      name: "list_upcoming_matches",
      description: "List upcoming non-test matches and their IDs so the user can choose a saved team selection to compare.",
      parameters: objectSchema({}, []),
    },
    {
      name: "get_player_leaderboard",
      description: "Return a verified player leaderboard for one historical statistic. Winning appearances count selected squad members on the winning side and always exclude jokers.",
      parameters: objectSchema({
        metric: { type: "string", enum: ["winning_appearances", "captain_wins", "matches", "runs", "batting_average", "strike_rate", "wickets", "economy", "maidens", "catches", "keeper_catches", "fielder_catches", "dropped_catches", "stumpings", "run_outs"] },
        match_category: matchCategoryProperty,
        tournament_id: tournamentIdProperty,
        limit: { type: "integer", minimum: 1, maximum: 10 },
      }, ["metric", "match_category", "tournament_id", "limit"]),
    },
    {
      name: "compare_players",
      description: "Compare verified batting, bowling, fielding, captaincy, and winning-appearance statistics for named players.",
      parameters: objectSchema({
        player_names: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 10 },
        match_category: matchCategoryProperty,
        tournament_id: tournamentIdProperty,
      }, ["player_names", "match_category", "tournament_id"]),
    },
    {
      name: "get_team_results",
      description: "Return completed historical match results for one team, an optional opponent, or all teams in the selected scope.",
      parameters: objectSchema({
        team_name: { type: ["string", "null"] },
        opponent_name: { type: ["string", "null"] },
        match_category: matchCategoryProperty,
        tournament_id: tournamentIdProperty,
      }, ["team_name", "opponent_name", "match_category", "tournament_id"]),
    },
    {
      name: "get_match_scorecard",
      description: "Return a historical match scorecard. Use a known match ID when available; otherwise use date and/or a team name.",
      parameters: objectSchema({
        match_id: { type: ["string", "null"] },
        match_date: { type: ["string", "null"], description: "YYYY-MM-DD when known." },
        team_name: { type: ["string", "null"] },
      }, ["match_id", "match_date", "team_name"]),
    },
    {
      name: "get_tournament_records",
      description: "Return verified leaders and record performances for one tournament.",
      parameters: objectSchema({
        tournament_id: { type: "string" },
        match_category: matchCategoryProperty,
      }, ["tournament_id", "match_category"]),
    },
    {
      name: "compare_selected_teams",
      description: "Compare the saved teams for an upcoming match using transparent batting, bowling, and fielding statistics. Returns career and recent-five form separately, excludes the joker, and marks players without history as insufficient data.",
      parameters: objectSchema({
        match_id: { type: "string" },
        match_category: matchCategoryProperty,
        tournament_id: tournamentIdProperty,
      }, ["match_id", "match_category", "tournament_id"]),
    },
  ];

  const executeTool: AiToolExecutor = async (name, argumentsValue) => {
    const args = asArguments(argumentsValue);
    const data = await getData();
    const matchCategory = asMatchCategory(args.match_category);
    const tournamentId = asNullableString(args.tournament_id);
    if (name === "list_tournaments") return listTournaments(data);
    if (name === "list_upcoming_matches") return listUpcomingMatches(data);
    if (name === "get_player_leaderboard") return playerLeaderboard(data, asString(args.metric), { matchCategory, tournamentId }, asInteger(args.limit, 10));
    if (name === "compare_players") return comparePlayers(data, asStringArray(args.player_names), { matchCategory, tournamentId });
    if (name === "get_team_results") return teamResults(data, asNullableString(args.team_name), asNullableString(args.opponent_name), { matchCategory, tournamentId });
    if (name === "get_match_scorecard") return matchScorecard(data, asNullableString(args.match_id), asNullableString(args.match_date), asNullableString(args.team_name));
    if (name === "get_tournament_records") return tournamentRecords(data, asString(args.tournament_id), matchCategory);
    if (name === "compare_selected_teams") return compareSelectedTeams(data, asString(args.match_id), { matchCategory, tournamentId });
    return { error: "Unknown analytics tool." };
  };

  return { tools, executeTool };
}

function objectSchema(properties: Record<string, unknown>, required: string[]) {
  return { type: "object", properties, required, additionalProperties: false };
}

function asArguments(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asNullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asInteger(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isInteger(value) ? value : fallback;
}

function asMatchCategory(value: unknown): MatchCategory {
  return value === "casual" || value === "all" ? value : "official";
}
