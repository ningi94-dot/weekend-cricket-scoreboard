import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/error-response";
import { deliveryRuns } from "@/lib/cricket/stats";
import { requireScorerSession } from "@/lib/scorer/session";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

type NextInningsBody = {
  strikerId?: string;
  nonStrikerId?: string;
  bowlerId?: string;
};

export async function POST(request: Request, context: { params: Promise<{ matchId: string }> }) {
  try {
    await requireScorerSession();
    const { matchId } = await context.params;
    const body = await request.json().catch(() => ({})) as NextInningsBody;
    if (!body.strikerId || !body.nonStrikerId || !body.bowlerId) {
      return NextResponse.json({ message: "Choose second-innings openers and bowler." }, { status: 400 });
    }
    if (body.strikerId === body.nonStrikerId) {
      return NextResponse.json({ message: "Striker and non-striker must be different players." }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();
    const { data: match, error: matchError } = await supabase.from("matches").select("*").eq("id", matchId).single();
    if (matchError || !match) return NextResponse.json({ message: "Match not found." }, { status: 404 });
    if (match.status !== "live") return NextResponse.json({ message: "Second innings can only start in a live match." }, { status: 409 });

    const { data: inningsRows, error: inningsError } = await supabase.from("innings").select("*").eq("match_id", matchId).order("innings_number");
    if (inningsError) throw inningsError;
    const innings = inningsRows ?? [];
    const firstInnings = innings.find((row) => row.innings_number === 1);
    const secondInnings = innings.find((row) => row.innings_number === 2);
    if (!firstInnings || firstInnings.status !== "completed") return NextResponse.json({ message: "First innings must be completed before starting the chase." }, { status: 400 });
    if (secondInnings) return NextResponse.json({ message: "Second innings has already been created." }, { status: 409 });

    const { data: firstDeliveries, error: deliveryError } = await supabase.from("deliveries").select("*").eq("innings_id", firstInnings.id);
    if (deliveryError) throw deliveryError;
    const firstTotal = (firstDeliveries ?? []).reduce((sum, delivery) => sum + deliveryRuns(delivery), 0);
    const battingSide = oppositeSide(firstInnings.batting_team_side);

    const { data: squads, error: squadError } = await supabase.from("match_squads").select("*").eq("match_id", matchId);
    if (squadError) throw squadError;
    const battingPlayers = playerIdsForSide(squads ?? [], match, battingSide);
    const bowlingPlayers = playerIdsForSide(squads ?? [], match, oppositeSide(battingSide));
    if (!battingPlayers.includes(body.strikerId) || !battingPlayers.includes(body.nonStrikerId) || !bowlingPlayers.includes(body.bowlerId)) {
      return NextResponse.json({ message: "Second-innings players must belong to the correct teams." }, { status: 400 });
    }
    if ([body.strikerId, body.nonStrikerId].includes(body.bowlerId)) {
      return NextResponse.json({ message: "The bowler cannot also be one of the current batters." }, { status: 400 });
    }

    const { data: inningsRow, error: insertError } = await supabase.from("innings").insert({
      match_id: matchId,
      batting_team_side: battingSide,
      innings_number: 2,
      status: "in_progress",
      target_runs: firstTotal + 1,
      striker_id: body.strikerId,
      non_striker_id: body.nonStrikerId,
      bowler_id: body.bowlerId,
      started_at: new Date().toISOString(),
    }).select("*").single();
    if (insertError) throw insertError;

    return NextResponse.json({ innings: inningsRow });
  } catch (error) {
    return apiErrorResponse(error, "Unable to start second innings.");
  }
}

function oppositeSide(side: "a" | "b") {
  return side === "a" ? "b" : "a";
}

function playerIdsForSide(squads: { player_id: string; team_side: string }[], match: { joker_enabled?: boolean | null; joker_player_id?: string | null }, side: "a" | "b") {
  const ids = squads.filter((row) => row.team_side === side).map((row) => row.player_id);
  if (match.joker_enabled && match.joker_player_id && !ids.includes(match.joker_player_id)) ids.push(match.joker_player_id);
  return ids;
}
