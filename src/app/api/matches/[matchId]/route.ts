import { NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api/error-response";
import { requireScorerSession } from "@/lib/scorer/session";
import { getSupabaseServiceClient } from "@/lib/supabase/server";

type PatchBody = {
  singleBatterMode?: boolean;
  location?: string;
  oversPerInnings?: number;
};

export async function PATCH(request: Request, context: { params: Promise<{ matchId: string }> }) {
  try {
    await requireScorerSession();
    const { matchId } = await context.params;
    const body = await request.json().catch(() => ({})) as PatchBody;
    const supabase = getSupabaseServiceClient();
    const { data: match, error: matchError } = await supabase.from("matches").select("*").eq("id", matchId).single();
    if (matchError || !match) return NextResponse.json({ message: "Match not found." }, { status: 404 });

    const update: { single_batter_mode?: boolean; location?: string; overs_per_innings?: number } = {};

    if (typeof body.singleBatterMode === "boolean") {
      update.single_batter_mode = body.singleBatterMode;
    }

    if (body.location !== undefined || body.oversPerInnings !== undefined) {
      if (match.status !== "upcoming") {
        return NextResponse.json({ message: "Venue and overs can only be changed before the match starts." }, { status: 409 });
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
