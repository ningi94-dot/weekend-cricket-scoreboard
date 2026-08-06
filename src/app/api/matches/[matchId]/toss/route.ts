import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/error-response";
import { requireScorerSession } from "@/lib/scorer/session";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

type TossBody = {
  tossWinnerSide?: "a" | "b";
  tossDecision?: "bat" | "bowl";
};

export async function POST(request: Request, context: { params: Promise<{ matchId: string }> }) {
  try {
    await requireScorerSession();
    const { matchId } = await context.params;
    const body = await request.json().catch(() => ({})) as TossBody;
    if (!body.tossWinnerSide || !body.tossDecision) {
      return NextResponse.json({ message: "Choose the toss winner and whether they elected to bat or bowl." }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();
    const { data: match, error: matchError } = await supabase.from("matches").select("*").eq("id", matchId).single();
    if (matchError || !match) return NextResponse.json({ message: "Match not found." }, { status: 404 });
    if (match.status === "completed") return NextResponse.json({ message: "The toss cannot be changed after the match is completed." }, { status: 409 });

    const { data: inningsRows, error: inningsError } = await supabase.from("innings").select("id").eq("match_id", matchId);
    if (inningsError) throw inningsError;
    if ((inningsRows ?? []).length) {
      const { data: deliveries, error: deliveryError } = await supabase
        .from("deliveries")
        .select("id")
        .in("innings_id", (inningsRows ?? []).map((innings) => innings.id))
        .limit(1);
      if (deliveryError) throw deliveryError;
      if ((deliveries ?? []).length) {
        return NextResponse.json({ message: "The toss cannot be changed after scoring has started." }, { status: 409 });
      }
    }

    const tossWinner = body.tossWinnerSide === "a" ? match.team_a_name : match.team_b_name;
    const { error: updateError } = await supabase.from("matches").update({
      toss_winner: tossWinner,
      toss_decision: body.tossDecision,
    }).eq("id", matchId);
    if (updateError) throw updateError;

    return NextResponse.json({ tossWinnerSide: body.tossWinnerSide, tossDecision: body.tossDecision });
  } catch (error) {
    return apiErrorResponse(error, "Unable to save toss details.");
  }
}
