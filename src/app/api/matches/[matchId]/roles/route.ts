import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/error-response";
import { requireScorerSession } from "@/lib/scorer/session";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

type RolesBody = {
  wicketKeeperId?: string;
  umpireId?: string;
};

export async function POST(request: Request, context: { params: Promise<{ matchId: string }> }) {
  try {
    await requireScorerSession();
    const { matchId } = await context.params;
    const body = await request.json().catch(() => ({})) as RolesBody;
    if (!body.wicketKeeperId || !body.umpireId) return NextResponse.json({ message: "Choose wicket keeper and umpire." }, { status: 400 });

    const supabase = getSupabaseServiceClient();
    const { data: match, error: matchError } = await supabase.from("matches").select("*").eq("id", matchId).single();
    if (matchError || !match) return NextResponse.json({ message: "Match not found." }, { status: 404 });
    const { data: innings, error: inningsError } = await supabase.from("innings").select("*").eq("match_id", matchId).eq("status", "in_progress").order("innings_number", { ascending: false }).limit(1).single();
    if (inningsError || !innings) return NextResponse.json({ message: "No live innings is ready for keeper/umpire changes." }, { status: 400 });

    const { data: squads, error: squadError } = await supabase.from("match_squads").select("*").eq("match_id", matchId);
    if (squadError) throw squadError;
    const battingIds = playerIdsForSide(squads ?? [], match, innings.batting_team_side);
    const bowlingIds = playerIdsForSide(squads ?? [], match, oppositeSide(innings.batting_team_side));
    if (!bowlingIds.includes(body.wicketKeeperId)) return NextResponse.json({ message: "Wicket keeper must be from the bowling team." }, { status: 400 });
    if (!battingIds.includes(body.umpireId)) return NextResponse.json({ message: "Umpire must be from the batting team." }, { status: 400 });
    if ([innings.striker_id, innings.non_striker_id].includes(body.wicketKeeperId)) return NextResponse.json({ message: "Wicket keeper cannot also be a current batter." }, { status: 400 });

    const { error: updateError } = await supabase.from("innings").update({
      wicket_keeper_id: body.wicketKeeperId,
      umpire_id: body.umpireId,
    }).eq("id", innings.id);
    if (updateError) throw updateError;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error, "Unable to save keeper or umpire.");
  }
}

function oppositeSide(side: "a" | "b") {
  return side === "a" ? "b" : "a";
}

function playerIdsForSide(squads: { player_id: string; team_side: string }[], match: { joker_enabled?: boolean | null; joker_player_id?: string | null }, side: "a" | "b") {
  const ids = squads.filter((row) => row.team_side === side).map((row) => row.player_id);
  if (match.joker_enabled && match.joker_player_id && !ids.includes(match.joker_player_id)) ids.push(match.joker_player_id);
  return ids;
}
