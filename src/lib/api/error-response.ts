import { NextResponse } from "next/server";

export function apiErrorMessage(error: unknown, fallback: string) {
  const message = typeof error === "object" && error && "message" in error && typeof error.message === "string" ? error.message : "";

  if (message === "Scorer login required.") return message;
  if (message === "Captain password required.") return message;
  if (message.includes("Server-side Supabase credentials")) return "Vercel is missing SUPABASE_SERVICE_ROLE_KEY. Add it in Environment Variables and redeploy.";
  if (message.includes("SCORER_SESSION_SECRET")) return "Vercel is missing SCORER_SESSION_SECRET. Add it in Environment Variables and redeploy.";
  if (message.includes("CAPTAIN_PASSWORD_HASH")) return "Vercel is missing CAPTAIN_PASSWORD_SALT or CAPTAIN_PASSWORD_HASH. Add them and redeploy.";
  if (message.includes("column") && (message.includes("striker_id") || message.includes("non_striker_id") || message.includes("bowler_id") || message.includes("started_at"))) {
    return "Supabase migration 0004 has not fully run. Run the full SQL migration in Supabase SQL Editor.";
  }
  if (message.includes("fielder_id") || (message.includes("schema cache") && message.includes("deliveries"))) {
    return "Supabase migration 0006 has not fully run yet. Run the fielding-credit SQL migration in Supabase, then redeploy if needed.";
  }
  if (message.includes("player_type") || message.includes("pending_action") || message.includes("pending_dismissed_player_id") || message.includes("pending_previous_bowler_id") || message.includes("pending_completed_over")) {
    return "Supabase migration 0007 has not fully run yet. Run the scoring-workflow and player-type SQL migration in Supabase, then redeploy if needed.";
  }
  if (message.includes("joker_enabled") || message.includes("joker_player_id")) {
    return "Supabase migration 0008 has not fully run yet. Run the match-joker SQL migration in Supabase, then redeploy if needed.";
  }
  if (message.includes("violates row-level security")) return "Supabase security policy blocked this write. Check the service role key in Vercel.";
  return fallback;
}

export function apiErrorResponse(error: unknown, fallback: string) {
  const message = apiErrorMessage(error, fallback);
  const status = message === "Scorer login required." || message === "Captain password required." ? 401 : 500;
  console.error(fallback, error);
  return NextResponse.json({ message }, { status });
}
