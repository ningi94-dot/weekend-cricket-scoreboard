import { type DeliveryRow, type InningsRow, type MatchRow, type PlayerRow } from "@/lib/cricket/stats";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchAllPages, fetchAllPagesByIdChunks } from "@/lib/supabase/fetch-all";

export type CareerStatsData = {
  matches: MatchRow[];
  players: PlayerRow[];
  innings: InningsRow[];
  deliveries: DeliveryRow[];
};

export async function loadCareerStatsData(): Promise<CareerStatsData> {
  const supabase = getSupabaseBrowserClient();
  const [matches, players] = await Promise.all([
    fetchAllPages<MatchRow>((from, to) => supabase
      .from("matches")
      .select("*")
      .eq("counts_toward_career_stats", true)
      .order("match_date", { ascending: false })
      .order("id")
      .range(from, to)),
    fetchAllPages<PlayerRow>((from, to) => supabase.from("players").select("*").order("name").order("id").range(from, to)),
  ]);

  const matchIds = matches.map((match) => match.id);
  if (!matchIds.length) return { matches, players, innings: [], deliveries: [] };

  const innings = await fetchAllPagesByIdChunks<InningsRow>(
    matchIds,
    (ids, from, to) => supabase
      .from("innings")
      .select("*")
      .in("match_id", ids)
      .order("match_id")
      .order("innings_number")
      .order("id")
      .range(from, to),
  );
  const inningsIds = innings.map((inningsRow) => inningsRow.id);
  const deliveries = inningsIds.length
    ? await fetchAllPagesByIdChunks<DeliveryRow>(
      inningsIds,
      (ids, from, to) => supabase
        .from("deliveries")
        .select("*")
        .in("innings_id", ids)
        .order("innings_id")
        .order("sequence_number")
        .order("id")
        .range(from, to),
    )
    : [];

  return { matches, players, innings, deliveries };
}
