import { MatchesClient } from "@/components/matches/matches-client";
import { PageHeader } from "@/components/ui/page-header";

export default function MatchesPage() {
  return <section><PageHeader eyebrow="Fixtures" title="Matches" description="Set up a fixture, select teams, start the match, and open the match center." /><MatchesClient /></section>;
}
