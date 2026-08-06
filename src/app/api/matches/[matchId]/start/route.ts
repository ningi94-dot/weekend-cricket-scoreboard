import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/error-response";
import { requireScorerSession } from "@/lib/scorer/session";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

type StartBody = {
  tossWinnerSide?: "a" | "b";
  tossDecision?: "bat" | "bowl";
  strikerId?: string;
  nonStrikerId?: string;
  bowlerId?: string;
};

export async function POST(request: Request, context: { params: Promise<{ matchId: string }> }) {
  try {
    await requireScorerSession();
    const { matchId } = await context.params;
    const body = await request.json().catch(() => ({})) as StartBody;
    if (!body.strikerId || !body.nonStrikerId || !body.bowlerId) {
      return NextResponse.json({ message: "Choose opening batters and opening bowler." }, { status: 400 });
    }
    if (body.strikerId === body.nonStrikerId) {
      return NextResponse.json({ message: "Striker and non-striker must be different players." }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();
    const { data: match, error: matchError } = await supabase.from("matches").select("*").eq("id", matchId).single();
    if (matchError || !match) return NextResponse.json({ message: "Match not found." }, { status: 404 });
    if (match.status !== "upcoming") return NextResponse.json({ message: "This match has already started or finished." }, { status: 409 });
    const tossWinnerSide = body.tossWinnerSide ?? (match.toss_winner === match.team_a_name ? "a" : match.toss_winner === match.team_b_name ? "b" : undefined);
    const tossDecision = body.tossDecision ?? match.toss_decision ?? undefined;
    if (!tossWinnerSide || !tossDecision) {
      return NextResponse.json({ message: "Save the toss winner and toss decision before starting the match." }, { status: 400 });
    }
    const { data: existingInnings, error: existingInningsError } = await supabase.from("innings").select("id").eq("match_id", matchId).limit(1);
    if (existingInningsError) throw existingInningsError;
    if ((existingInnings ?? []).length) return NextResponse.json({ message: "This match has already been initialized." }, { status: 409 });

    const { data: squads, error: squadError } = await supabase.from("match_squads").select("*").eq("match_id", matchId);
    if (squadError) throw squadError;
    const teamA = (squads ?? []).filter((row) => row.team_side === "a");
    const teamB = (squads ?? []).filter((row) => row.team_side === "b");
    if (!teamA.length || !teamB.length) return NextResponse.json({ message: "Both teams need selected players before the match can start." }, { status: 400 });

    const battingSide = tossDecision === "bat" ? tossWinnerSide : oppositeSide(tossWinnerSide);
    const battingPlayers = playerIdsForSide(squads ?? [], match, battingSide);
    const bowlingPlayers = playerIdsForSide(squads ?? [], match, oppositeSide(battingSide));
    if (!battingPlayers.includes(body.strikerId) || !battingPlayers.includes(body.nonStrikerId) || !bowlingPlayers.includes(body.bowlerId)) {
      return NextResponse.json({ message: "Opening players must belong to the correct teams." }, { status: 400 });
    }
    if ([body.strikerId, body.nonStrikerId].includes(body.bowlerId)) {
      return NextResponse.json({ message: "The bowler cannot also be one of the current batters." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const { error: updateError } = await supabase.from("matches").update({
      status: "live",
      started_at: now,
      toss_winner: tossWinnerSide === "a" ? match.team_a_name : match.team_b_name,
      toss_decision: tossDecision,
    }).eq("id", matchId);
    if (updateError) throw updateError;

    const { data: innings, error: inningsError } = await supabase.from("innings").insert({
      match_id: matchId,
      batting_team_side: battingSide,
      innings_number: 1,
      status: "in_progress",
      striker_id: body.strikerId,
      non_striker_id: body.nonStrikerId,
      bowler_id: body.bowlerId,
      started_at: now,
    }).select("*").single();
    if (inningsError) throw inningsError;

    return NextResponse.json({ innings });
  } catch (error) {
    return apiErrorResponse(error, "Unable to start this match.");
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
