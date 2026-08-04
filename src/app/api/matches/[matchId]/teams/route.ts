import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/error-response";
import { requireCaptainSession } from "@/lib/captain/session";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

type TeamRow = {
  playerId: string;
  teamSide: "a" | "b";
  isCaptain?: boolean;
};

export async function POST(request: Request, context: { params: Promise<{ matchId: string }> }) {
  try {
    await requireCaptainSession();
    const { matchId } = await context.params;
    const body = await request.json().catch(() => null) as { rows?: TeamRow[] } | null;
    const rows = body?.rows ?? [];

    if (!Array.isArray(rows)) return NextResponse.json({ message: "Invalid team selection." }, { status: 400 });
    if (rows.some((row) => !row.playerId || (row.teamSide !== "a" && row.teamSide !== "b"))) {
      return NextResponse.json({ message: "Invalid player or team side in selection." }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();
    const { data: match, error: matchError } = await supabase.from("matches").select("id,status").eq("id", matchId).single();
    if (matchError || !match) return NextResponse.json({ message: "Match not found." }, { status: 404 });
    if (match.status !== "upcoming") return NextResponse.json({ message: "Teams can only be changed before the match starts." }, { status: 409 });

    const teamA = rows.filter((row) => row.teamSide === "a");
    const teamB = rows.filter((row) => row.teamSide === "b");
    if (!teamA.length || !teamB.length) return NextResponse.json({ message: "Both teams need at least one player." }, { status: 400 });
    if (new Set(rows.map((row) => row.playerId)).size !== rows.length) return NextResponse.json({ message: "A player can only be selected once." }, { status: 400 });

    const { error: deleteError } = await supabase.from("match_squads").delete().eq("match_id", matchId);
    if (deleteError) throw deleteError;

    const insertRows = rows.map((row) => ({
      match_id: matchId,
      player_id: row.playerId,
      team_side: row.teamSide,
      is_captain: Boolean(row.isCaptain),
    }));
    const { error: insertError } = await supabase.from("match_squads").insert(insertRows);
    if (insertError) throw insertError;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "Unable to save team selection.");
  }
}
