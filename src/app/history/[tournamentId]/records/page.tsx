import { Suspense } from "react";
import { TournamentRecordsClient } from "@/components/tournaments/tournament-records-client";

export default async function TournamentRecordsPage({ params }: { params: Promise<{ tournamentId: string }> }) {
  const { tournamentId } = await params;
  return (
    <Suspense fallback={<p className="text-sm text-[var(--muted)]">Loading tournament records...</p>}>
      <TournamentRecordsClient tournamentId={tournamentId} />
    </Suspense>
  );
}
