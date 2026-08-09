import { Suspense } from "react";
import { TournamentLeadersClient } from "@/components/tournaments/tournament-leaders-client";

export default async function TournamentLeadersPage({ params }: { params: Promise<{ tournamentId: string }> }) {
  const { tournamentId } = await params;
  return (
    <Suspense fallback={<p className="text-sm text-[var(--muted)]">Loading tournament leaders...</p>}>
      <TournamentLeadersClient tournamentId={tournamentId} />
    </Suspense>
  );
}
