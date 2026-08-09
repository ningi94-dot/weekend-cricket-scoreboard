import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/error-response";
import { deliveryRuns, dismissalNeedsFielder } from "@/lib/cricket/stats";
import { requireScorerSession } from "@/lib/scorer/session";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

type AddDeliveryBody = {
  inningsId?: string;
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
};

export async function POST(request: Request, context: { params: Promise<{ matchId: string }> }) {
  try {
    await requireScorerSession();
    const { matchId } = await context.params;
    const body = await request.json().catch(() => ({})) as AddDeliveryBody;
    const supabase = getSupabaseServiceClient();

    const { data: match, error: matchError } = await supabase.from("matches").select("*").eq("id", matchId).single();
    if (matchError || !match) return NextResponse.json({ message: "Match not found." }, { status: 404 });
    if (!body.inningsId) return NextResponse.json({ message: "Choose which innings to add the ball to." }, { status: 400 });
    const { data: matchInningsRows, error: matchInningsError } = await supabase.from("innings").select("id,innings_number,status").eq("match_id", matchId).order("innings_number");
    if (matchInningsError) throw matchInningsError;
    if (!isCorrectionsReady(match, matchInningsRows ?? [])) {
      return NextResponse.json({ message: "Add-ball corrections are only available after the match is completed." }, { status: 409 });
    }

    const { data: innings, error: inningsError } = await supabase.from("innings").select("*").eq("id", body.inningsId).single();
    if (inningsError || !innings || innings.match_id !== matchId) return NextResponse.json({ message: "Innings not found for this match." }, { status: 404 });

    const allowNoNonStriker = Boolean(match.single_batter_mode);
    const strikerId = body.strikerId;
    const nonStrikerId = body.nonStrikerId || null;
    const bowlerId = body.bowlerId;
    const wicketKeeperId = body.wicketKeeperId ?? innings.wicket_keeper_id;
    const batterRuns = Math.max(0, Math.min(Number(body.batterRuns ?? 0), 6));
    const extraType = body.extraType ?? "";
    const extraRuns = Math.max(0, Math.min(Number(body.extraRuns ?? 0), 10));
    const wideRuns = extraType === "wide" ? Math.max(1, extraRuns || 1) : 0;
    const noBallRuns = extraType === "no_ball" ? Math.max(1, extraRuns || 1) : 0;
    const byeRuns = extraType === "bye" ? extraRuns : 0;
    const legByeRuns = extraType === "leg_bye" ? extraRuns : 0;
    const isWicket = Boolean(body.isWicket);
    const dismissal = isWicket ? body.dismissal ?? "bowled" : null;
    const dismissedPlayerId = isWicket ? body.dismissedPlayerId ?? strikerId : null;
    const fielderId = isWicket && dismissalNeedsFielder(dismissal) ? body.fielderId ?? null : null;

    if (!strikerId || (!allowNoNonStriker && !nonStrikerId) || !bowlerId || !wicketKeeperId) {
      return NextResponse.json({ message: allowNoNonStriker ? "Choose striker, bowler, and keeper. Non-striker is optional." : "Choose striker, non-striker, bowler, and keeper." }, { status: 400 });
    }
    if (nonStrikerId && strikerId === nonStrikerId) return NextResponse.json({ message: "Striker and non-striker must be different players." }, { status: 400 });

    const { data: squads, error: squadError } = await supabase.from("match_squads").select("*").eq("match_id", matchId);
    if (squadError) throw squadError;
    const battingPlayerIds = playerIdsForSide(squads ?? [], match, innings.batting_team_side);
    const bowlingPlayerIds = playerIdsForSide(squads ?? [], match, oppositeSide(innings.batting_team_side));
    const currentBatterIds = [strikerId, nonStrikerId].filter((playerId): playerId is string => Boolean(playerId));

    if (!battingPlayerIds.includes(strikerId) || (nonStrikerId && !battingPlayerIds.includes(nonStrikerId))) {
      return NextResponse.json({ message: "Selected batters must belong to the batting team." }, { status: 400 });
    }
    if (!bowlingPlayerIds.includes(bowlerId) || !bowlingPlayerIds.includes(wicketKeeperId)) {
      return NextResponse.json({ message: "Bowler and keeper must belong to the fielding team." }, { status: 400 });
    }
    if (currentBatterIds.includes(bowlerId) || currentBatterIds.includes(wicketKeeperId)) {
      return NextResponse.json({ message: "Bowler and keeper cannot be current batters." }, { status: 400 });
    }
    if (isWicket && (!dismissal || !dismissedPlayerId || !currentBatterIds.includes(dismissedPlayerId))) {
      return NextResponse.json({ message: "Choose a valid dismissal and dismissed batter." }, { status: 400 });
    }
    if (isWicket && dismissalNeedsFielder(dismissal) && !fielderId) {
      return NextResponse.json({ message: "Choose the fielder involved in this dismissal." }, { status: 400 });
    }
    if (fielderId && !bowlingPlayerIds.includes(fielderId)) {
      return NextResponse.json({ message: "Fielder must belong to the fielding team." }, { status: 400 });
    }

    const { data: deliveries, error: deliveryError } = await supabase.from("deliveries").select("*").eq("innings_id", innings.id).order("sequence_number", { ascending: true });
    if (deliveryError) throw deliveryError;
    const previousDeliveries = deliveries ?? [];
    const legalBalls = previousDeliveries.filter((delivery) => delivery.is_legal_delivery).length;
    const sequenceNumber = (previousDeliveries.at(-1)?.sequence_number ?? 0) + 1;

    const { data: delivery, error: insertError } = await supabase.from("deliveries").insert({
      innings_id: innings.id,
      sequence_number: sequenceNumber,
      over_number: Math.floor(legalBalls / 6),
      ball_in_over: (legalBalls % 6) + 1,
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
    }).select("*").single();
    if (insertError) throw insertError;

    const { error: inningsUpdateError } = await supabase.from("innings").update({ wicket_keeper_id: wicketKeeperId }).eq("id", innings.id);
    if (inningsUpdateError) throw inningsUpdateError;
    await recalculateMatchResult(matchId, match);

    return NextResponse.json({ delivery });
  } catch (error) {
    return apiErrorResponse(error, "Unable to add this delivery.");
  }
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
