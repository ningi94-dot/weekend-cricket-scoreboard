import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/error-response";
import { deliveryRuns } from "@/lib/cricket/stats";
import { requireScorerSession } from "@/lib/scorer/session";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

type CorrectionBody = {
  strikerId?: string;
  nonStrikerId?: string | null;
  bowlerId?: string;
  batterRuns?: number;
};

export async function PATCH(request: Request, context: { params: Promise<{ matchId: string; deliveryId: string }> }) {
  try {
    await requireScorerSession();
    const { matchId, deliveryId } = await context.params;
    const body = await request.json().catch(() => ({})) as CorrectionBody;
    const supabase = getSupabaseServiceClient();

    const { data: delivery, error: deliveryError } = await supabase.from("deliveries").select("*").eq("id", deliveryId).single();
    if (deliveryError || !delivery) return NextResponse.json({ message: "Delivery not found." }, { status: 404 });

    const { data: innings, error: inningsError } = await supabase.from("innings").select("*").eq("id", delivery.innings_id).single();
    if (inningsError || !innings || innings.match_id !== matchId) return NextResponse.json({ message: "Delivery does not belong to this match." }, { status: 404 });

    const { data: match, error: matchError } = await supabase.from("matches").select("*").eq("id", matchId).single();
    if (matchError || !match) return NextResponse.json({ message: "Match not found." }, { status: 404 });

    const strikerId = body.strikerId ?? delivery.striker_id;
    const nonStrikerId = match.single_batter_mode ? null : body.nonStrikerId === undefined ? delivery.non_striker_id : body.nonStrikerId;
    const bowlerId = body.bowlerId ?? delivery.bowler_id;
    const batterRuns = body.batterRuns === undefined ? delivery.batter_runs : Math.max(0, Math.min(Number(body.batterRuns), 6));

    if (!strikerId || (!match.single_batter_mode && !nonStrikerId) || !bowlerId) {
      return NextResponse.json({ message: match.single_batter_mode ? "Choose batter and bowler." : "Choose striker, non-striker, and bowler." }, { status: 400 });
    }
    if (nonStrikerId && strikerId === nonStrikerId) {
      return NextResponse.json({ message: "Striker and non-striker must be different players." }, { status: 400 });
    }
    if (!Number.isFinite(batterRuns)) {
      return NextResponse.json({ message: "Runs must be a valid number." }, { status: 400 });
    }

    const { data: squads, error: squadError } = await supabase.from("match_squads").select("*").eq("match_id", matchId);
    if (squadError) throw squadError;
    const battingPlayerIds = playerIdsForSide(squads ?? [], match, innings.batting_team_side);
    const bowlingPlayerIds = playerIdsForSide(squads ?? [], match, oppositeSide(innings.batting_team_side));
    const currentBatterIds = [strikerId, nonStrikerId].filter((playerId): playerId is string => Boolean(playerId));

    if (!battingPlayerIds.includes(strikerId) || (nonStrikerId && !battingPlayerIds.includes(nonStrikerId))) {
      return NextResponse.json({ message: "Selected batters must belong to the batting team." }, { status: 400 });
    }
    if (!bowlingPlayerIds.includes(bowlerId)) {
      return NextResponse.json({ message: "Selected bowler must belong to the fielding team." }, { status: 400 });
    }
    if (currentBatterIds.includes(bowlerId)) {
      return NextResponse.json({ message: "Bowler cannot also be a current batter." }, { status: 400 });
    }

    const { data: updatedDelivery, error: updateError } = await supabase
      .from("deliveries")
      .update({
        striker_id: strikerId,
        non_striker_id: nonStrikerId,
        bowler_id: bowlerId,
        batter_runs: batterRuns,
      })
      .eq("id", deliveryId)
      .select("*")
      .single();
    if (updateError) throw updateError;

    await recalculateMatchResult(matchId, match);

    return NextResponse.json({ delivery: updatedDelivery });
  } catch (error) {
    return apiErrorResponse(error, "Unable to correct this delivery.");
  }
}

async function recalculateMatchResult(matchId: string, match: { status: string; team_a_name: string; team_b_name: string }) {
  const supabase = getSupabaseServiceClient();
  const { data: inningsRows, error: inningsError } = await supabase.from("innings").select("*").eq("match_id", matchId).order("innings_number");
  if (inningsError) throw inningsError;
  const innings = inningsRows ?? [];
  const inningsIds = innings.map((row) => row.id);
  if (!inningsIds.length) return;

  const { data: deliveries, error: deliveryError } = await supabase.from("deliveries").select("*").in("innings_id", inningsIds);
  if (deliveryError) throw deliveryError;
  const runsByInnings = new Map<string, number>();
  for (const delivery of deliveries ?? []) {
    runsByInnings.set(delivery.innings_id, (runsByInnings.get(delivery.innings_id) ?? 0) + deliveryRuns(delivery));
  }

  const firstInnings = innings.find((row) => row.innings_number === 1);
  const secondInnings = innings.find((row) => row.innings_number === 2);
  if (!firstInnings || !secondInnings) return;

  const firstTotal = runsByInnings.get(firstInnings.id) ?? 0;
  const secondTotal = runsByInnings.get(secondInnings.id) ?? 0;
  const { error: targetError } = await supabase.from("innings").update({ target_runs: firstTotal + 1 }).eq("id", secondInnings.id);
  if (targetError) throw targetError;

  if (match.status !== "completed" || secondInnings.status !== "completed") return;
  const winner = secondTotal > firstTotal
    ? teamName(match, secondInnings.batting_team_side)
    : secondTotal === firstTotal
      ? "Tie"
      : teamName(match, oppositeSide(secondInnings.batting_team_side));
  const { error: matchUpdateError } = await supabase.from("matches").update({ winner }).eq("id", matchId);
  if (matchUpdateError) throw matchUpdateError;
}

function teamName(match: { team_a_name: string; team_b_name: string }, side: "a" | "b") {
  return side === "a" ? match.team_a_name : match.team_b_name;
}

function oppositeSide(side: "a" | "b") {
  return side === "a" ? "b" : "a";
}

function playerIdsForSide(squads: { player_id: string; team_side: string }[], match: { joker_enabled?: boolean | null; joker_player_id?: string | null }, side: "a" | "b") {
  const ids = squads.filter((row) => row.team_side === side).map((row) => row.player_id);
  if (match.joker_enabled && match.joker_player_id && !ids.includes(match.joker_player_id)) ids.push(match.joker_player_id);
  return ids;
}
