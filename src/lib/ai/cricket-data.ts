import { fetchAllPages, fetchAllPagesByIdChunks } from "@/lib/supabase/fetch-all";
import { getSupabaseServiceClient } from "@/lib/supabase/server";
import type { DeliveryRow, InningsRow, MatchRow, PlayerRow } from "@/lib/cricket/stats";
import type { SquadRow, TournamentRow } from "@/lib/cricket/tournament-stats";

export type AiCricketData = {
  matches: MatchRow[];
  players: PlayerRow[];
  squads: SquadRow[];
  innings: InningsRow[];
  deliveries: DeliveryRow[];
  tournaments: TournamentRow[];
};

export async function loadAiCricketData(): Promise<AiCricketData> {
  const supabase = getSupabaseServiceClient();
  const [matches, players, tournaments] = await Promise.all([
    fetchAllPages<MatchRow>((from, to) => supabase.from("matches").select("*").order("match_date", { ascending: false }).order("id").range(from, to)),
    fetchAllPages<PlayerRow>((from, to) => supabase.from("players").select("*").order("name").order("id").range(from, to)),
    fetchAllPages<TournamentRow>((from, to) => supabase.from("tournaments").select("*").order("start_date", { ascending: false }).order("id").range(from, to)),
  ]);
  const matchIds = matches.map((match) => match.id);
  if (!matchIds.length) return { matches, players, tournaments, squads: [], innings: [], deliveries: [] };

  const [squads, innings] = await Promise.all([
    fetchAllPagesByIdChunks<SquadRow>(matchIds, (ids, from, to) => supabase.from("match_squads").select("*").in("match_id", ids).order("match_id").order("sort_order").range(from, to)),
    fetchAllPagesByIdChunks<InningsRow>(matchIds, (ids, from, to) => supabase.from("innings").select("*").in("match_id", ids).order("match_id").order("innings_number").range(from, to)),
  ]);
  const inningsIds = innings.map((row) => row.id);
  const deliveries = inningsIds.length
    ? await fetchAllPagesByIdChunks<DeliveryRow>(inningsIds, (ids, from, to) => supabase.from("deliveries").select("*").in("innings_id", ids).order("innings_id").order("sequence_number").range(from, to))
    : [];

  return { matches, players, tournaments, squads, innings, deliveries };
}
