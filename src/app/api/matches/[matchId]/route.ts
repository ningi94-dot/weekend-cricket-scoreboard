import { NextResponse } from "next/server";
import { requireScorerSession } from "@/lib/scorer/session";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

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
    const message = error instanceof Error && error.message === "Scorer login required." ? error.message : "Unable to delete this match.";
    return NextResponse.json({ message }, { status: message === "Scorer login required." ? 401 : 500 });
  }
}
