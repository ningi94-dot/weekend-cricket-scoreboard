import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/error-response";
import { requireScorerSession } from "@/lib/scorer/session";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export async function POST(_request: Request, context: { params: Promise<{ matchId: string }> }) {
  try {
    await requireScorerSession();
    const { matchId } = await context.params;
    const supabase = getSupabaseServiceClient();
    const { data: innings, error: inningsError } = await supabase
      .from("innings")
      .select("*")
      .eq("match_id", matchId)
      .eq("status", "in_progress")
      .order("innings_number", { ascending: false })
      .limit(1)
      .single();
    if (inningsError || !innings) return NextResponse.json({ message: "No live innings is ready for undo." }, { status: 400 });

    const { data: latest, error: latestError } = await supabase
      .from("deliveries")
      .select("*")
      .eq("innings_id", innings.id)
      .order("sequence_number", { ascending: false })
      .limit(1)
      .single();
    if (latestError || !latest) return NextResponse.json({ message: "There is no delivery to undo." }, { status: 400 });

    const { error: updateError } = await supabase.from("innings").update({
      striker_id: latest.striker_id,
      non_striker_id: latest.non_striker_id,
      bowler_id: latest.bowler_id,
      pending_action: null,
      pending_dismissed_player_id: null,
      pending_previous_bowler_id: null,
      pending_completed_over: null,
    }).eq("id", innings.id);
    if (updateError) throw updateError;

    const { error: deleteError } = await supabase.from("deliveries").delete().eq("id", latest.id);
    if (deleteError) throw deleteError;

    return NextResponse.json({ ok: true, undoneDeliveryId: latest.id });
  } catch (error) {
    return apiErrorResponse(error, "Unable to undo the latest delivery.");
  }
}
