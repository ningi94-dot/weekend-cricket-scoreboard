import { type DeliveryRow, type InningsRow, type MatchRow, type PlayerRow } from "@/lib/cricket/stats";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchAllPages, fetchAllPagesByIdChunks } from "@/lib/supabase/fetch-all";
import { type SquadRow, type TournamentRow } from "@/lib/cricket/tournament-stats";

export type TournamentStatsData = {
  tournaments?: TournamentRow[];
  tournament?: TournamentRow;
  matches: MatchRow[];
  players: PlayerRow[];
  squads: SquadRow[];
  innings: InningsRow[];
  deliveries: DeliveryRow[];
};

export async function loadTournamentHubData(): Promise<TournamentStatsData & { tournaments: TournamentRow[] }> {
  const supabase = getSupabaseBrowserClient();
  const [tournaments, matches, players] = await Promise.all([
    fetchAllPages<TournamentRow>((from, to) => supabase.from("tournaments").select("*").order("start_date", { ascending: false }).range(from, to)),
    fetchAllPages<MatchRow>((from, to) => supabase.from("matches").select("*").not("tournament_id", "is", null).order("match_date", { ascending: false }).range(from, to)),
    fetchAllPages<PlayerRow>((from, to) => supabase.from("players").select("*").order("name").range(from, to)),
  ]);
  const related = await loadRelatedTournamentRows(matches);

  return { tournaments, matches, players, ...related };
}

export async function loadTournamentDetailData(tournamentId: string): Promise<TournamentStatsData & { tournament: TournamentRow }> {
  const supabase = getSupabaseBrowserClient();
  const [tournamentResult, matches, players] = await Promise.all([
    supabase.from("tournaments").select("*").eq("id", tournamentId).single(),
    fetchAllPages<MatchRow>((from, to) => supabase.from("matches").select("*").eq("tournament_id", tournamentId).order("match_date", { ascending: false }).range(from, to)),
    fetchAllPages<PlayerRow>((from, to) => supabase.from("players").select("*").order("name").range(from, to)),
  ]);
  if (tournamentResult.error) throw tournamentResult.error;

  const related = await loadRelatedTournamentRows(matches);

  return { tournament: tournamentResult.data, matches, players, ...related };
}

async function loadRelatedTournamentRows(matches: MatchRow[]) {
  const supabase = getSupabaseBrowserClient();
  const matchIds = matches.map((match) => match.id);
  if (!matchIds.length) {
    return { squads: [] as SquadRow[], innings: [] as InningsRow[], deliveries: [] as DeliveryRow[] };
  }

  const [squads, innings] = await Promise.all([
    fetchAllPagesByIdChunks<SquadRow>(
      matchIds,
      (ids, from, to) => supabase.from("match_squads").select("*").in("match_id", ids).order("match_id").order("sort_order").range(from, to),
    ),
    fetchAllPagesByIdChunks<InningsRow>(
      matchIds,
      (ids, from, to) => supabase.from("innings").select("*").in("match_id", ids).order("match_id").order("innings_number").range(from, to),
    ),
  ]);
  const inningsIds = innings.map((inningsRow) => inningsRow.id);
  const deliveries = inningsIds.length
    ? await fetchAllPagesByIdChunks<DeliveryRow>(
      inningsIds,
      (ids, from, to) => supabase.from("deliveries").select("*").in("innings_id", ids).order("innings_id").order("sequence_number").range(from, to),
    )
    : [];

  return { squads, innings, deliveries };
}
