import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/error-response";
import { requireScorerSession } from "@/lib/scorer/session";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

type PatchBody = {
  singleBatterMode?: boolean;
  teamAName?: string;
  teamBName?: string;
  startTime?: string | null;
  location?: string;
  oversPerInnings?: number;
};

export async function PATCH(request: Request, context: { params: Promise<{ matchId: string }> }) {
  try {
    const { matchId } = await context.params;
    const body = await request.json().catch(() => ({})) as PatchBody;
    const updatesPublicPreStartInfo =
      body.teamAName !== undefined ||
      body.teamBName !== undefined ||
      body.startTime !== undefined ||
      body.location !== undefined ||
      body.oversPerInnings !== undefined;
    if (!updatesPublicPreStartInfo || typeof body.singleBatterMode === "boolean") {
      await requireScorerSession();
    }

    const supabase = getSupabaseServiceClient();
    const { data: match, error: matchError } = await supabase.from("matches").select("*").eq("id", matchId).single();
    if (matchError || !match) return NextResponse.json({ message: "Match not found." }, { status: 404 });

    const update: {
      single_batter_mode?: boolean;
      team_a_name?: string;
      team_b_name?: string;
      start_time?: string | null;
      location?: string;
      overs_per_innings?: number;
      toss_winner?: string | null;
    } = {};

    if (typeof body.singleBatterMode === "boolean") {
      update.single_batter_mode = body.singleBatterMode;
    }

    if (updatesPublicPreStartInfo) {
      if (match.status !== "upcoming") {
        return NextResponse.json({ message: "Match info can only be changed before the match starts." }, { status: 409 });
      }
      if (body.teamAName !== undefined) {
        const teamAName = body.teamAName.trim();
        if (teamAName.length < 1 || teamAName.length > 80) {
          return NextResponse.json({ message: "Team A name must be between 1 and 80 characters." }, { status: 400 });
        }
        update.team_a_name = teamAName;
        if (match.toss_winner === match.team_a_name) update.toss_winner = teamAName;
      }
      if (body.teamBName !== undefined) {
        const teamBName = body.teamBName.trim();
        if (teamBName.length < 1 || teamBName.length > 80) {
          return NextResponse.json({ message: "Team B name must be between 1 and 80 characters." }, { status: 400 });
        }
        update.team_b_name = teamBName;
        if (match.toss_winner === match.team_b_name) update.toss_winner = teamBName;
      }
      if ((update.team_a_name ?? match.team_a_name).toLowerCase() === (update.team_b_name ?? match.team_b_name).toLowerCase()) {
        return NextResponse.json({ message: "Team names must be different." }, { status: 400 });
      }
      if (body.startTime !== undefined) {
        const startTime = body.startTime?.trim() ?? "";
        if (startTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) {
          return NextResponse.json({ message: "Start time must use HH:MM format." }, { status: 400 });
        }
        update.start_time = startTime || null;
      }
      if (body.location !== undefined) {
        const location = body.location.trim();
        if (location.length < 1 || location.length > 200) {
          return NextResponse.json({ message: "Venue must be between 1 and 200 characters." }, { status: 400 });
        }
        update.location = location;
      }
      if (body.oversPerInnings !== undefined) {
        const overs = Number(body.oversPerInnings);
        if (!Number.isInteger(overs) || overs < 1 || overs > 100) {
          return NextResponse.json({ message: "Overs must be a whole number between 1 and 100." }, { status: 400 });
        }
        update.overs_per_innings = overs;
      }
    }

    if (!Object.keys(update).length) {
      return NextResponse.json({ message: "Choose a match setting to update." }, { status: 400 });
    }

    const { data: updatedMatch, error: updateError } = await supabase
      .from("matches")
      .update(update)
      .eq("id", matchId)
      .select("*")
      .single();
    if (updateError) throw updateError;

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
