import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/error-response";
import { deliveryRuns, dismissalNeedsFielder } from "@/lib/cricket/stats";
import { requireScorerSession } from "@/lib/scorer/session";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

type CorrectionBody = {
  strikerId?: string;
  nonStrikerId?: string | null;
  bowlerId?: string;
  wicketKeeperId?: string;
  batterRuns?: number;
  extraType?: "" | "wide" | "no_ball" | "bye" | "leg_bye";
  extraRuns?: number;
  isWicket?: boolean;
  dismissal?: "bowled" | "caught" | "lbw" | "run_out" | "stumped" | "hit_wicket" | "retired_hurt";
  dismissedPlayerId?: string | null;
  fielderId?: string | null;
  catchDropped?: boolean;
  catchDropFielderId?: string | null;
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

    const allowNoNonStriker = Boolean(match.single_batter_mode);
    const strikerId = body.strikerId ?? delivery.striker_id;
    const nonStrikerId = body.nonStrikerId === undefined ? delivery.non_striker_id : body.nonStrikerId || null;
    const bowlerId = body.bowlerId ?? delivery.bowler_id;
    const wicketKeeperId = body.wicketKeeperId ?? innings.wicket_keeper_id;
    const extraType = body.extraType === undefined ? deliveryExtraType(delivery) : body.extraType;
    const rawBatterRuns = body.batterRuns === undefined ? delivery.batter_runs : Math.max(0, Math.min(Number(body.batterRuns), 6));
    const batterRuns = extraType ? 0 : rawBatterRuns;
    const extraRuns = body.extraRuns === undefined ? deliveryExtraRuns(delivery) : Math.max(0, Math.min(Number(body.extraRuns), 10));
    const wideRuns = extraType === "wide" ? Math.max(1, extraRuns || 1) : 0;
    const noBallRuns = extraType === "no_ball" ? Math.max(1, extraRuns || 1) : 0;
    const byeRuns = extraType === "bye" ? extraRuns : 0;
    const legByeRuns = extraType === "leg_bye" ? extraRuns : 0;
    const isWicket = body.isWicket ?? delivery.is_wicket;
    const dismissal = isWicket ? body.dismissal ?? delivery.dismissal ?? "bowled" : null;
    const dismissedPlayerId = isWicket ? body.dismissedPlayerId ?? delivery.dismissed_player_id ?? strikerId : null;
    const fielderId = isWicket && dismissalNeedsFielder(dismissal) ? body.fielderId ?? delivery.fielder_id : null;
    const catchDropped = body.catchDropped ?? delivery.catch_dropped;
    const catchDropFielderId = catchDropped ? body.catchDropFielderId ?? delivery.catch_drop_fielder_id : null;

    if (!strikerId || (!allowNoNonStriker && !nonStrikerId) || !bowlerId || !wicketKeeperId) {
      return NextResponse.json({ message: allowNoNonStriker ? "Choose striker, bowler, and keeper. Non-striker is optional." : "Choose striker, non-striker, bowler, and keeper." }, { status: 400 });
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
    if (!bowlingPlayerIds.includes(wicketKeeperId)) {
      return NextResponse.json({ message: "Selected wicket keeper must belong to the fielding team." }, { status: 400 });
    }
    if (currentBatterIds.includes(bowlerId)) {
      return NextResponse.json({ message: "Bowler cannot also be a current batter." }, { status: 400 });
    }
    if (currentBatterIds.includes(wicketKeeperId)) {
      return NextResponse.json({ message: "Wicket keeper cannot also be a current batter." }, { status: 400 });
    }
    if (isWicket && (!dismissal || !dismissedPlayerId)) {
      return NextResponse.json({ message: "Choose dismissal type and dismissed batter." }, { status: 400 });
    }
    if (isWicket && dismissedPlayerId && !currentBatterIds.includes(dismissedPlayerId)) {
      return NextResponse.json({ message: "Dismissed batter must be the striker or non-striker for this ball." }, { status: 400 });
    }
    if (isWicket && dismissalNeedsFielder(dismissal) && !fielderId) {
      return NextResponse.json({ message: "Choose the fielder involved in this dismissal." }, { status: 400 });
    }
    if (fielderId && !bowlingPlayerIds.includes(fielderId)) {
      return NextResponse.json({ message: "Fielder must belong to the fielding team." }, { status: 400 });
    }
    if (catchDropped && !catchDropFielderId) {
      return NextResponse.json({ message: "Choose the fielder who dropped the catch." }, { status: 400 });
    }
    if (catchDropFielderId && !bowlingPlayerIds.includes(catchDropFielderId)) {
      return NextResponse.json({ message: "Dropped-catch fielder must belong to the fielding team." }, { status: 400 });
    }
    if (catchDropFielderId && currentBatterIds.includes(catchDropFielderId)) {
      return NextResponse.json({ message: "Dropped-catch fielder cannot be a current batter." }, { status: 400 });
    }

    const { data: updatedDelivery, error: updateError } = await supabase
      .from("deliveries")
      .update({
        striker_id: strikerId,
        non_striker_id: nonStrikerId,
        bowler_id: bowlerId,
        batter_runs: batterRuns,
        wide_runs: wideRuns,
        no_ball_runs: noBallRuns,
        bye_runs: byeRuns,
        leg_bye_runs: legByeRuns,
        is_wicket: isWicket,
        dismissed_player_id: isWicket ? dismissedPlayerId : null,
        dismissal,
        fielder_id: isWicket ? fielderId : null,
        catch_dropped: catchDropped,
        catch_drop_fielder_id: catchDropFielderId,
      })
      .eq("id", deliveryId)
      .select("*")
      .single();
    if (updateError) throw updateError;

    const { error: inningsUpdateError } = await supabase.from("innings").update({ wicket_keeper_id: wicketKeeperId }).eq("id", innings.id);
    if (inningsUpdateError) throw inningsUpdateError;
    await recalculateDeliveryBallNumbers(innings.id);
    await recalculateMatchResult(matchId, match);

    return NextResponse.json({ delivery: updatedDelivery });
  } catch (error) {
    return apiErrorResponse(error, "Unable to correct this delivery.");
  }
}

async function recalculateDeliveryBallNumbers(inningsId: string) {
  const supabase = getSupabaseServiceClient();
  const { data: deliveries, error } = await supabase.from("deliveries").select("*").eq("innings_id", inningsId).order("sequence_number", { ascending: true });
  if (error) throw error;
  let legalBalls = 0;
  for (const delivery of deliveries ?? []) {
    const overNumber = Math.floor(legalBalls / 6);
    const ballInOver = (legalBalls % 6) + 1;
    const { error: updateError } = await supabase.from("deliveries").update({ over_number: overNumber, ball_in_over: ballInOver }).eq("id", delivery.id);
    if (updateError) throw updateError;
    if (delivery.is_legal_delivery) legalBalls += 1;
  }
}

function deliveryExtraType(delivery: { wide_runs: number; no_ball_runs: number; bye_runs: number; leg_bye_runs: number }) {
  if (delivery.wide_runs > 0) return "wide";
  if (delivery.no_ball_runs > 0) return "no_ball";
  if (delivery.bye_runs > 0) return "bye";
  if (delivery.leg_bye_runs > 0) return "leg_bye";
  return "";
}

function deliveryExtraRuns(delivery: { wide_runs: number; no_ball_runs: number; bye_runs: number; leg_bye_runs: number }) {
  return delivery.wide_runs || delivery.no_ball_runs || delivery.bye_runs || delivery.leg_bye_runs || 0;
}

async function recalculateMatchResult(matchId: string, match: { status: string; winner?: string | null; team_a_name: string; team_b_name: string }) {
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

  if (!isCorrectionsReady(match, innings)) return;
  const winner = secondTotal > firstTotal
    ? teamName(match, secondInnings.batting_team_side)
    : secondTotal === firstTotal
      ? "Tie"
      : teamName(match, oppositeSide(secondInnings.batting_team_side));
  const { error: matchUpdateError } = await supabase.from("matches").update({ status: "completed", winner }).eq("id", matchId);
  if (matchUpdateError) throw matchUpdateError;
}

function teamName(match: { team_a_name: string; team_b_name: string }, side: "a" | "b") {
  return side === "a" ? match.team_a_name : match.team_b_name;
}

function oppositeSide(side: "a" | "b") {
  return side === "a" ? "b" : "a";
}

function isCorrectionsReady(match: { status: string; winner?: string | null }, innings: { innings_number: number; status: string }[]) {
  const hasLiveInnings = innings.some((row) => row.status === "in_progress");
  const secondInningsCompleted = innings.some((row) => row.innings_number === 2 && row.status === "completed");
  return !hasLiveInnings && (match.status === "completed" || Boolean(match.winner) || secondInningsCompleted);
}

function playerIdsForSide(squads: { player_id: string; team_side: string }[], match: { joker_enabled?: boolean | null; joker_player_id?: string | null }, side: "a" | "b") {
  const ids = squads.filter((row) => row.team_side === side).map((row) => row.player_id);
  if (match.joker_enabled && match.joker_player_id && !ids.includes(match.joker_player_id)) ids.push(match.joker_player_id);
  return ids;
}
