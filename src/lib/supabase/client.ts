import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

type PlayerRow = { id: string; name: string; batting_style: string; bowling_style: string; profile_id: string | null; created_by: string | null; created_at: string; updated_at: string };
type MatchRow = { id: string; team_a_name: string; team_b_name: string; match_date: string; location: string; overs_per_innings: number; status: "upcoming" | "live" | "completed"; toss_winner: string | null; toss_decision: "bat" | "bowl" | null; winner: string | null; player_of_match_id: string | null; created_by: string | null; created_at: string; updated_at: string };

export type Database = {
  public: {
    Tables: {
      profiles: { Row: { id: string; display_name: string; email: string | null; role: "admin" | "captain" | "player"; created_at: string; updated_at: string }; Insert: { id: string; display_name?: string; email?: string | null; role?: "admin" | "captain" | "player" }; Update: { display_name?: string }; Relationships: [] };
      players: { Row: PlayerRow; Insert: { id?: string; profile_id?: string | null; name: string; batting_style: string; bowling_style: string; created_by?: string | null }; Update: { name?: string; batting_style?: string; bowling_style?: string }; Relationships: [] };
      matches: { Row: MatchRow; Insert: { id?: string; team_a_name: string; team_b_name: string; match_date: string; location: string; overs_per_innings: number; status?: "upcoming" | "live" | "completed"; created_by?: string | null }; Update: Partial<MatchRow>; Relationships: [] };
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
