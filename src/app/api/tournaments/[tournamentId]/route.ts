import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/error-response";
import { requireCaptainSession } from "@/lib/captain/session";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

export async function DELETE(_request: Request, context: { params: Promise<{ tournamentId: string }> }) {
  try {
    await requireCaptainSession();
    const { tournamentId } = await context.params;
    const supabase = getSupabaseServiceClient();

    const { data: tournament, error: tournamentError } = await supabase
      .from("tournaments")
      .select("id,name")
      .eq("id", tournamentId)
      .single();
    if (tournamentError || !tournament) return NextResponse.json({ message: "Tournament not found." }, { status: 404 });

    const { count: attachedMatches, error: countError } = await supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("tournament_id", tournamentId);
    if (countError) throw countError;

    const { error: deleteError } = await supabase.from("tournaments").delete().eq("id", tournamentId);
    if (deleteError) throw deleteError;

    return NextResponse.json({ ok: true, name: tournament.name, detachedMatches: attachedMatches ?? 0 });
  } catch (error) {
    return apiErrorResponse(error, "Unable to delete this tournament.");
  }
}
