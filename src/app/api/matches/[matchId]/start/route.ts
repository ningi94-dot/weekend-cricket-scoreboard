import { NextResponse } from "next/server";
import { requireScorerSession } from "@/lib/scorer/session";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

type StartBody = {
  battingSide?: "a" | "b";
  strikerId?: string;
  nonStrikerId?: string;
  bowlerId?: string;
  tossWinner?: string;
  tossDecision?: "bat" | "bowl";
};

export async function POST(request: Request, context: { params: Promise<{ matchId: string }> }) {
  try {
    await requireScorerSession();
    const { matchId } = await context.params;
    const body = await request.json().catch(() => ({})) as StartBody;
    if (!body.battingSide || !body.strikerId || !body.nonStrikerId || !body.bowlerId) {
      return NextResponse.json({ message: "Choose opening batters, opening bowler, and batting team." }, { status: 400 });
    }
    if (body.strikerId === body.nonStrikerId) {
      return NextResponse.json({ message: "Striker and non-striker must be different players." }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();
    const { data: match, error: matchError } = await supabase.from("matches").select("*").eq("id", matchId).single();
    if (matchError || !match) return NextResponse.json({ message: "Match not found." }, { status: 404 });
    if (match.status !== "upcoming") return NextResponse.json({ message: "This match has already started or finished." }, { status: 409 });

    const { data: squads, error: squadError } = await supabase.from("match_squads").select("*").eq("match_id", matchId);
    if (squadError) throw squadError;
    const teamA = (squads ?? []).filter((row) => row.team_side === "a");
    const teamB = (squads ?? []).filter((row) => row.team_side === "b");
    if (!teamA.length || !teamB.length) return NextResponse.json({ message: "Both teams need selected players before the match can start." }, { status: 400 });

    const battingPlayers = (body.battingSide === "a" ? teamA : teamB).map((row) => row.player_id);
    const bowlingPlayers = (body.battingSide === "a" ? teamB : teamA).map((row) => row.player_id);
    if (!battingPlayers.includes(body.strikerId) || !battingPlayers.includes(body.nonStrikerId) || !bowlingPlayers.includes(body.bowlerId)) {
      return NextResponse.json({ message: "Opening players must belong to the correct teams." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const { error: updateError } = await supabase.from("matches").update({
      status: "live",
      started_at: now,
      toss_winner: body.tossWinner || null,
      toss_decision: body.tossDecision || null,
    }).eq("id", matchId);
    if (updateError) throw updateError;

    const { data: innings, error: inningsError } = await supabase.from("innings").insert({
      match_id: matchId,
      batting_team_side: body.battingSide,
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
    const message = error instanceof Error && error.message === "Scorer login required." ? error.message : "Unable to start this match.";
    return NextResponse.json({ message }, { status: message === "Scorer login required." ? 401 : 500 });
  }
}
