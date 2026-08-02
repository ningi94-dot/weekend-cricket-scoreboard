import { TeamSelectionClient } from "@/components/matches/team-selection-client";

export default async function TeamSelectionPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  return <TeamSelectionClient matchId={matchId} />;
}
