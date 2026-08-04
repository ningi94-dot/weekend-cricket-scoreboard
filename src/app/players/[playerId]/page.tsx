import { Suspense } from "react";
import { PlayerProfileClient } from "@/components/players/player-profile-client";

export default async function PlayerProfilePage({ params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  return (
    <Suspense fallback={<p className="text-sm text-[var(--muted)]">Loading player profile...</p>}>
      <PlayerProfileClient playerId={playerId} />
    </Suspense>
  );
}
