import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/error-response";
import { requireScorerSession } from "@/lib/scorer/session";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

type PatchBody = {
  singleBatterMode?: boolean;
};

export async function PATCH(request: Request, context: { params: Promise<{ matchId: string }> }) {
  try {
    await requireScorerSession();
    const { matchId } = await context.params;
    const body = await request.json().catch(() => ({})) as PatchBody;
    const supabase = getSupabaseServiceClient();
    const { data: match, error: matchError } = await supabase.from("matches").select("*").eq("id", matchId).single();
    if (matchError || !match) return NextResponse.json({ message: "Match not found." }, { status: 404 });

    if (typeof body.singleBatterMode !== "boolean") {
      return NextResponse.json({ message: "Choose a match setting to update." }, { status: 400 });
    }

    const { data: updatedMatch, error: updateError } = await supabase
      .from("matches")
      .update({ single_batter_mode: body.singleBatterMode })
      .eq("id", matchId)
      .select("*")
      .single();
    if (updateError) throw updateError;

    if (body.singleBatterMode) {
      const { data: inningsRows, error: inningsError } = await supabase.from("innings").select("id").eq("match_id", matchId);
      if (inningsError) throw inningsError;
      const inningsIds = (inningsRows ?? []).map((innings) => innings.id);
      const { error: inningsUpdateError } = await supabase.from("innings").update({ non_striker_id: null }).eq("match_id", matchId);
      if (inningsUpdateError) throw inningsUpdateError;
      if (inningsIds.length) {
        const { error: deliveryUpdateError } = await supabase.from("deliveries").update({ non_striker_id: null }).in("innings_id", inningsIds);
        if (deliveryUpdateError) throw deliveryUpdateError;
      }
    }

    return NextResponse.json({ match: updatedMatch });
  } catch (error) {
    return apiErrorResponse(error, "Unable to update match settings.");
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ matchId: string }> }) {
  try {
    await requireScorerSession();
    const { matchId } = await context.params;
    const body = await request.json().catch(() => ({})) as { confirmLive?: boolean };
    const supabase = getSupabaseServiceClient();
    const { data: match, error: matchError } = await supabase.from("matches").select("*").eq("id", matchId).single();
    if (matchError || !match) return NextResponse.json({ message: "Match not found." }, { status: 404 });
    if (match.status === "live" && !body.confirmLive) {
      return NextResponse.json({ message: "Confirm live match deletion before deleting." }, { status: 409 });
    }

    const { error } = await supabase.from("matches").delete().eq("id", matchId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "Unable to delete this match.");
  }
}
