import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

type PlayerType = "batting" | "bowling" | "fielding";
type PlayerRow = { id: string; name: string; batting_style: string; bowling_style: string; player_type: PlayerType | null; is_active: boolean; profile_id: string | null; created_by: string | null; created_at: string; updated_at: string };
type MatchStatus = "upcoming" | "live" | "completed";
type InningsStatus = "not_started" | "in_progress" | "completed";
type DismissalKind = "bowled" | "caught" | "lbw" | "run_out" | "stumped" | "hit_wicket" | "retired_hurt" | "retired_out" | "obstructing_field" | "timed_out";
type MatchRow = { id: string; team_a_name: string; team_b_name: string; match_date: string; start_time: string | null; location: string; overs_per_innings: number; status: MatchStatus; toss_winner: string | null; toss_decision: "bat" | "bowl" | null; winner: string | null; player_of_match_id: string | null; created_by: string | null; started_at: string | null; is_test: boolean; joker_enabled: boolean; joker_player_id: string | null; tournament_id: string | null; created_at: string; updated_at: string };
type PendingScoringAction = "incoming_batter" | "next_bowler";
type InningsRow = { id: string; match_id: string; batting_team_side: "a" | "b"; innings_number: number; status: InningsStatus; target_runs: number | null; striker_id: string | null; non_striker_id: string | null; bowler_id: string | null; wicket_keeper_id: string | null; umpire_id: string | null; pending_action: PendingScoringAction | null; pending_dismissed_player_id: string | null; pending_previous_bowler_id: string | null; pending_completed_over: number | null; started_at: string | null; completed_at: string | null };
type TournamentRow = { id: string; name: string; start_date: string | null; location: string | null; status: "active" | "completed"; created_at: string; updated_at: string };
type DeliveryRow = { id: string; innings_id: string; sequence_number: number; over_number: number; ball_in_over: number; striker_id: string; non_striker_id: string; bowler_id: string; batter_runs: number; wide_runs: number; no_ball_runs: number; bye_runs: number; leg_bye_runs: number; penalty_runs: number; is_wicket: boolean; dismissed_player_id: string | null; dismissal: DismissalKind | null; fielder_id: string | null; is_legal_delivery: boolean; recorded_by: string | null; recorded_at: string };

export type Database = {
  public: {
    Tables: {
      profiles: { Row: { id: string; display_name: string; email: string | null; role: "admin" | "captain" | "player"; created_at: string; updated_at: string }; Insert: { id: string; display_name?: string; email?: string | null; role?: "admin" | "captain" | "player" }; Update: { display_name?: string }; Relationships: [] };
      players: { Row: PlayerRow; Insert: { id?: string; profile_id?: string | null; name: string; batting_style: string; bowling_style: string; player_type?: PlayerType | null; is_active?: boolean; created_by?: string | null }; Update: { name?: string; batting_style?: string; bowling_style?: string; player_type?: PlayerType | null; is_active?: boolean }; Relationships: [] };
      matches: { Row: MatchRow; Insert: { id?: string; team_a_name: string; team_b_name: string; match_date: string; start_time?: string | null; location: string; overs_per_innings: number; status?: MatchStatus; created_by?: string | null; is_test?: boolean; joker_enabled?: boolean; joker_player_id?: string | null; tournament_id?: string | null }; Update: Partial<MatchRow>; Relationships: [] };
      match_squads: { Row: { match_id: string; player_id: string; team_side: "a" | "b"; is_captain: boolean; sort_order: number }; Insert: { match_id: string; player_id: string; team_side: "a" | "b"; is_captain?: boolean; sort_order?: number }; Update: { team_side?: "a" | "b"; is_captain?: boolean; sort_order?: number }; Relationships: [] };
      innings: { Row: InningsRow; Insert: { id?: string; match_id: string; batting_team_side: "a" | "b"; innings_number: number; status?: InningsStatus; target_runs?: number | null; striker_id?: string | null; non_striker_id?: string | null; bowler_id?: string | null; wicket_keeper_id?: string | null; umpire_id?: string | null; pending_action?: PendingScoringAction | null; pending_dismissed_player_id?: string | null; pending_previous_bowler_id?: string | null; pending_completed_over?: number | null; started_at?: string | null; completed_at?: string | null }; Update: Partial<InningsRow>; Relationships: [] };
      deliveries: { Row: DeliveryRow; Insert: { id?: string; innings_id: string; sequence_number: number; over_number: number; ball_in_over: number; striker_id: string; non_striker_id: string; bowler_id: string; batter_runs?: number; wide_runs?: number; no_ball_runs?: number; bye_runs?: number; leg_bye_runs?: number; penalty_runs?: number; is_wicket?: boolean; dismissed_player_id?: string | null; dismissal?: DismissalKind | null; fielder_id?: string | null; recorded_by?: string | null }; Update: Partial<DeliveryRow>; Relationships: [] };
      tournaments: { Row: TournamentRow; Insert: { id?: string; name: string; start_date?: string | null; location?: string | null; status?: "active" | "completed" }; Update: Partial<TournamentRow>; Relationships: [] };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: { app_role: "admin" | "captain" | "player"; match_status: "upcoming" | "live" | "completed" };
    CompositeTypes: Record<string, never>;
  };
};

let client: SupabaseClient<Database> | undefined;

export function getSupabaseBrowserClient() {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured. Add the project URL and publishable key to .env.local.");

  client = createSupabaseClient<Database>(url, key);
  return client;
}
