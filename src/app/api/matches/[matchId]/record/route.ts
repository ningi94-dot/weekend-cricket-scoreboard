import { NextResponse } from "next/server";
import { deliveryRuns } from "@/lib/cricket/stats";
import { requireScorerSession } from "@/lib/scorer/session";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

type RecordBody = {
  batterRuns?: number;
  extraType?: "wide" | "no_ball" | "bye" | "leg_bye";
  extraRuns?: number;
  isWicket?: boolean;
  dismissal?: "bowled" | "caught" | "lbw" | "run_out" | "stumped" | "hit_wicket" | "retired_hurt";
  dismissedPlayerId?: string;
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
    const { data: innings, error: inningsError } = await supabase
      .from("innings")
      .select("*")
      .eq("match_id", matchId)
      .eq("status", "in_progress")
      .order("innings_number", { ascending: false })
      .limit(1)
      .single();
    if (inningsError || !innings) return NextResponse.json({ message: "No live innings is ready for scoring." }, { status: 400 });

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

    const legalBalls = (deliveries ?? []).filter((delivery) => delivery.is_legal_delivery).length;
    const sequenceNumber = ((deliveries ?? []).at(-1)?.sequence_number ?? 0) + 1;
    const batterRuns = Math.max(0, Math.min(Number(body.batterRuns ?? 0), 6));
    const extraRuns = Math.max(0, Math.min(Number(body.extraRuns ?? 0), 10));
    const wideRuns = body.extraType === "wide" ? Math.max(1, extraRuns || 1) : 0;
    const noBallRuns = body.extraType === "no_ball" ? Math.max(1, extraRuns || 1) : 0;
    const byeRuns = body.extraType === "bye" ? extraRuns : 0;
    const legByeRuns = body.extraType === "leg_bye" ? extraRuns : 0;
    const isWicket = Boolean(body.isWicket);

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

    await supabase.from("innings").update({ striker_id: nextStriker, non_striker_id: nextNonStriker, bowler_id: bowlerId }).eq("id", innings.id);

    return NextResponse.json({ delivery, runs: deliveryRuns(delivery) });
  } catch (error) {
    const message = error instanceof Error && error.message === "Scorer login required." ? error.message : "Unable to record this delivery.";
    return NextResponse.json({ message }, { status: message === "Scorer login required." ? 401 : 500 });
  }
}
