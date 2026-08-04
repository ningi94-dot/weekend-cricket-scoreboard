import { Suspense } from "react";
import { MatchCenterClient } from "@/components/matches/match-center-client";

export default async function MatchCenterPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  return (
    <Suspense fallback={<p className="text-sm text-[var(--muted)]">Loading match center...</p>}>
      <MatchCenterClient matchId={matchId} />
    </Suspense>
  );
}
