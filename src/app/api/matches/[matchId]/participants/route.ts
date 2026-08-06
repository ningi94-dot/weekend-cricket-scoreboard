import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/error-response";
import { requireScorerSession } from "@/lib/scorer/session";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

type ParticipantsBody =
  | { action?: "incoming_batter"; playerId?: string }
  | { action?: "next_bowler"; playerId?: string; allowConsecutive?: boolean };

export async function POST(request: Request, context: { params: Promise<{ matchId: string }> }) {
  try {
    await requireScorerSession();
    const { matchId } = await context.params;
    const body = await request.json().catch(() => ({})) as ParticipantsBody;
    if (!body.action || !body.playerId) return NextResponse.json({ message: "Choose the required player." }, { status: 400 });

    const supabase = getSupabaseServiceClient();
    const { data: match, error: matchError } = await supabase.from("matches").select("*").eq("id", matchId).single();
    if (matchError || !match) return NextResponse.json({ message: "Match not found." }, { status: 404 });
    const { data: innings, error: inningsError } = await supabase
      .from("innings")
      .select("*")
      .eq("match_id", matchId)
      .eq("status", "in_progress")
      .order("innings_number", { ascending: false })
      .limit(1)
      .single();
    if (inningsError || !innings) return NextResponse.json({ message: "No live innings is waiting for a player selection." }, { status: 400 });
    if (innings.pending_action !== body.action) return NextResponse.json({ message: "This selection is not currently required." }, { status: 409 });

    const { data: squads, error: squadError } = await supabase.from("match_squads").select("*").eq("match_id", matchId);
    if (squadError) throw squadError;
    const battingIds = playerIdsForSide(squads ?? [], match, innings.batting_team_side);
    const bowlingIds = playerIdsForSide(squads ?? [], match, oppositeSide(innings.batting_team_side));

    if (body.action === "incoming_batter") {
      if (!battingIds.includes(body.playerId)) return NextResponse.json({ message: "Incoming batter must be from the batting team." }, { status: 400 });
      const { data: deliveries, error: deliveryError } = await supabase.from("deliveries").select("dismissed_player_id").eq("innings_id", innings.id);
      if (deliveryError) throw deliveryError;
      const dismissed = new Set((deliveries ?? []).map((delivery) => delivery.dismissed_player_id).filter(Boolean));
      if (dismissed.has(body.playerId)) return NextResponse.json({ message: "That player has already been dismissed." }, { status: 400 });
      if ([innings.striker_id, innings.non_striker_id].includes(body.playerId)) return NextResponse.json({ message: "That player is already at the crease." }, { status: 400 });

      const strikerId = innings.striker_id ?? body.playerId;
      const nonStrikerId = innings.non_striker_id ?? body.playerId;
      if (strikerId === nonStrikerId) return NextResponse.json({ message: "Choose a different incoming batter." }, { status: 400 });
      const needsBowler = Boolean(innings.pending_previous_bowler_id);
      const { error: updateError } = await supabase.from("innings").update({
        striker_id: strikerId,
        non_striker_id: nonStrikerId,
        bowler_id: needsBowler ? null : innings.bowler_id,
        pending_action: needsBowler ? "next_bowler" : null,
        pending_dismissed_player_id: null,
      }).eq("id", innings.id);
      if (updateError) throw updateError;
      return NextResponse.json({ ok: true, nextAction: needsBowler ? "next_bowler" : null });
    }

    if (!bowlingIds.includes(body.playerId)) return NextResponse.json({ message: "Next bowler must be from the fielding team." }, { status: 400 });
    if ([innings.striker_id, innings.non_striker_id].includes(body.playerId)) return NextResponse.json({ message: "The bowler cannot also be one of the current batters." }, { status: 400 });
    const allowConsecutive = "allowConsecutive" in body && Boolean(body.allowConsecutive);
    if (body.playerId === innings.pending_previous_bowler_id && !allowConsecutive) {
      return NextResponse.json({ message: "The same bowler cannot bowl consecutive overs. Pick another bowler, or confirm the friendly-match override." }, { status: 400 });
    }
    const { error: updateError } = await supabase.from("innings").update({
      bowler_id: body.playerId,
      pending_action: null,
      pending_previous_bowler_id: null,
      pending_completed_over: null,
    }).eq("id", innings.id);
    if (updateError) throw updateError;
    return NextResponse.json({ ok: true, nextAction: null });
  } catch (error) {
    return apiErrorResponse(error, "Unable to save player selection.");
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
