import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/error-response";
import { deliveryRuns, dismissalNeedsFielder, replacementIsNeeded } from "@/lib/cricket/stats";
import { requireScorerSession } from "@/lib/scorer/session";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

type RecordBody = {
  batterRuns?: number;
  extraType?: "wide" | "no_ball" | "bye" | "leg_bye";
  extraRuns?: number;
  isWicket?: boolean;
  dismissal?: "bowled" | "caught" | "lbw" | "run_out" | "stumped" | "hit_wicket" | "retired_hurt";
  dismissedPlayerId?: string;
  fielderId?: string;
  strikerId?: string;
  nonStrikerId?: string;
  bowlerId?: string;
};

export async function POST(request: Request, context: { params: Promise<{ matchId: string }> }) {
  try {
    await requireScorerSession();
    const { matchId } = await context.params;
    const body = await request.json().catch(() => ({})) as RecordBody;
    const supabase = getSupabaseServiceClient();
    const { data: match, error: matchError } = await supabase.from("matches").select("id,overs_per_innings,team_a_name,team_b_name").eq("id", matchId).single();
    if (matchError || !match) return NextResponse.json({ message: "Match not found." }, { status: 404 });
    const { data: innings, error: inningsError } = await supabase
      .from("innings")
      .select("*")
      .eq("match_id", matchId)
      .eq("status", "in_progress")
      .order("innings_number", { ascending: false })
      .limit(1)
      .single();
    if (inningsError || !innings) return NextResponse.json({ message: "No live innings is ready for scoring." }, { status: 400 });
    if (innings.pending_action) {
      return NextResponse.json({ message: innings.pending_action === "incoming_batter" ? "Choose the incoming batter before recording the next delivery." : "Choose the next bowler before recording the next delivery." }, { status: 409 });
    }

    const strikerId = body.strikerId ?? innings.striker_id;
    const nonStrikerId = body.nonStrikerId ?? innings.non_striker_id;
    const bowlerId = body.bowlerId ?? innings.bowler_id;
    if (!strikerId || !nonStrikerId || !bowlerId) return NextResponse.json({ message: "Choose striker, non-striker, and bowler before recording." }, { status: 400 });
    if (strikerId === nonStrikerId) return NextResponse.json({ message: "Striker and non-striker must be different." }, { status: 400 });

    const { data: deliveries, error: deliveriesError } = await supabase
      .from("deliveries")
      .select("*")
      .eq("innings_id", innings.id)
      .order("sequence_number", { ascending: true });
    if (deliveriesError) throw deliveriesError;

    const previousDeliveries = deliveries ?? [];
    const isWicket = Boolean(body.isWicket);
    const dismissedBefore = new Set(previousDeliveries.filter((delivery) => delivery.is_wicket && delivery.dismissed_player_id).map((delivery) => delivery.dismissed_player_id!));
    if (dismissedBefore.has(strikerId) || dismissedBefore.has(nonStrikerId)) {
      return NextResponse.json({ message: "One of the selected batters is already out. Refresh the scorer and choose active batters." }, { status: 400 });
    }

    const { data: squads, error: squadError } = await supabase.from("match_squads").select("*").eq("match_id", matchId);
    if (squadError) throw squadError;
    const battingPlayerIds = (squads ?? []).filter((row) => row.team_side === innings.batting_team_side).map((row) => row.player_id);
    if (!battingPlayerIds.includes(strikerId) || !battingPlayerIds.includes(nonStrikerId)) {
      return NextResponse.json({ message: "Selected batters must belong to the batting team." }, { status: 400 });
    }
    if (isWicket && body.dismissedPlayerId && ![strikerId, nonStrikerId].includes(body.dismissedPlayerId)) {
      return NextResponse.json({ message: "The dismissed player must be one of the current batters." }, { status: 400 });
    }
    const fieldingPlayerIds = (squads ?? []).filter((row) => row.team_side !== innings.batting_team_side).map((row) => row.player_id);
    const fielderId = dismissalNeedsFielder(body.dismissal) ? body.fielderId : null;
    if (isWicket && dismissalNeedsFielder(body.dismissal) && !fielderId) {
      return NextResponse.json({ message: "Choose the fielder involved in this dismissal." }, { status: 400 });
    }
    if (fielderId && !fieldingPlayerIds.includes(fielderId)) {
      return NextResponse.json({ message: "The fielder must be from the fielding team." }, { status: 400 });
    }

    const legalBalls = previousDeliveries.filter((delivery) => delivery.is_legal_delivery).length;
    const previousRuns = previousDeliveries.reduce((sum, delivery) => sum + deliveryRuns(delivery), 0);
    const maxLegalBalls = match.overs_per_innings * 6;
    if (legalBalls >= maxLegalBalls) {
      await supabase.from("innings").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", innings.id);
      return NextResponse.json({ message: `This innings is complete after ${match.overs_per_innings} overs.` }, { status: 409 });
    }
    const sequenceNumber = ((deliveries ?? []).at(-1)?.sequence_number ?? 0) + 1;
    const batterRuns = Math.max(0, Math.min(Number(body.batterRuns ?? 0), 6));
    const extraRuns = Math.max(0, Math.min(Number(body.extraRuns ?? 0), 10));
    const wideRuns = body.extraType === "wide" ? Math.max(1, extraRuns || 1) : 0;
    const noBallRuns = body.extraType === "no_ball" ? Math.max(1, extraRuns || 1) : 0;
    const byeRuns = body.extraType === "bye" ? extraRuns : 0;
    const legByeRuns = body.extraType === "leg_bye" ? extraRuns : 0;

    if (isWicket && (!body.dismissedPlayerId || !body.dismissal)) {
      return NextResponse.json({ message: "Choose the dismissed batter and dismissal type." }, { status: 400 });
    }

    const overNumber = Math.floor(legalBalls / 6);
    const ballInOver = (legalBalls % 6) + 1;
    const { data: delivery, error: insertError } = await supabase.from("deliveries").insert({
      innings_id: innings.id,
      sequence_number: sequenceNumber,
      over_number: overNumber,
      ball_in_over: ballInOver,
      striker_id: strikerId,
      non_striker_id: nonStrikerId,
      bowler_id: bowlerId,
      batter_runs: batterRuns,
      wide_runs: wideRuns,
      no_ball_runs: noBallRuns,
      bye_runs: byeRuns,
      leg_bye_runs: legByeRuns,
      is_wicket: isWicket,
      dismissed_player_id: isWicket ? body.dismissedPlayerId! : null,
      dismissal: isWicket ? body.dismissal! : null,
      fielder_id: isWicket ? fielderId : null,
    }).select("*").single();
    if (insertError) throw insertError;

    const isLegal = wideRuns === 0 && noBallRuns === 0;
    const physicalRuns = batterRuns + byeRuns + legByeRuns + Math.max(0, wideRuns - 1) + Math.max(0, noBallRuns - 1);
    let nextStriker = strikerId;
    let nextNonStriker = nonStrikerId;
    const swap = () => {
      const old = nextStriker;
      nextStriker = nextNonStriker;
      nextNonStriker = old;
    };
    if (physicalRuns % 2 === 1) swap();
    if (isLegal && (legalBalls + 1) % 6 === 0) swap();

    const nextLegalBalls = legalBalls + (isLegal ? 1 : 0);
    const nextRuns = previousRuns + deliveryRuns(delivery);
    const dismissedAfter = new Set(dismissedBefore);
    if (isWicket && body.dismissedPlayerId) dismissedAfter.add(body.dismissedPlayerId);
    const availableBatters = battingPlayerIds.filter((playerId) => !dismissedAfter.has(playerId));
    const allOut = isWicket && availableBatters.length < 2;
    const chaseCompleted = innings.innings_number === 2 && innings.target_runs !== null && nextRuns >= innings.target_runs;
    const inningsIsComplete = nextLegalBalls >= maxLegalBalls || chaseCompleted || allOut;
    const overCompleted = isLegal && nextLegalBalls % 6 === 0;
    const needsIncomingBatter = isWicket && !inningsIsComplete && replacementIsNeeded(body.dismissal) && Boolean(body.dismissedPlayerId);
    const needsNextBowler = overCompleted && !inningsIsComplete;
    if (!allOut && !needsIncomingBatter) {
      if (dismissedAfter.has(nextStriker) || nextStriker === nextNonStriker) {
        nextStriker = availableBatters.find((playerId) => playerId !== nextNonStriker) ?? nextStriker;
      }
      if (dismissedAfter.has(nextNonStriker) || nextNonStriker === nextStriker) {
        nextNonStriker = availableBatters.find((playerId) => playerId !== nextStriker) ?? nextNonStriker;
      }
    }
    const pendingAction = inningsIsComplete ? null : needsIncomingBatter ? "incoming_batter" as const : needsNextBowler ? "next_bowler" as const : null;
    const inningsUpdate = inningsIsComplete
      ? { striker_id: nextStriker, non_striker_id: nextNonStriker, bowler_id: bowlerId, status: "completed" as const, completed_at: new Date().toISOString() }
      : {
        striker_id: needsIncomingBatter && dismissedAfter.has(nextStriker) ? null : nextStriker,
        non_striker_id: needsIncomingBatter && dismissedAfter.has(nextNonStriker) ? null : nextNonStriker,
        bowler_id: needsNextBowler && !needsIncomingBatter ? null : bowlerId,
        pending_action: pendingAction,
        pending_dismissed_player_id: needsIncomingBatter ? body.dismissedPlayerId! : null,
        pending_previous_bowler_id: needsNextBowler ? bowlerId : null,
        pending_completed_over: needsNextBowler ? overNumber + 1 : null,
      };
    const { error: inningsUpdateError } = await supabase.from("innings").update(inningsUpdate).eq("id", innings.id);
    if (inningsUpdateError) throw inningsUpdateError;

    let matchComplete = false;
    let winner: string | null = null;
    if (innings.innings_number === 2 && inningsIsComplete) {
      matchComplete = true;
      if (innings.target_runs !== null && nextRuns >= innings.target_runs) {
        winner = innings.batting_team_side === "a" ? match.team_a_name : match.team_b_name;
      } else if (innings.target_runs !== null && nextRuns === innings.target_runs - 1) {
        winner = "Tie";
      } else {
        const defendingSide = innings.batting_team_side === "a" ? "b" : "a";
        winner = defendingSide === "a" ? match.team_a_name : match.team_b_name;
      }
      const { error: matchUpdateError } = await supabase.from("matches").update({ status: "completed", winner }).eq("id", matchId);
      if (matchUpdateError) throw matchUpdateError;
    }

    return NextResponse.json({ delivery, runs: deliveryRuns(delivery), inningsComplete: inningsIsComplete, matchComplete, winner, pendingAction });
  } catch (error) {
    return apiErrorResponse(error, "Unable to record this delivery.");
  }
}
