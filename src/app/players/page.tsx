import { PlayersClient } from "@/components/players/players-client";
import { PageHeader } from "@/components/ui/page-header";

export default function PlayersPage() {
  return <section><PageHeader eyebrow="Squad" title="Players" description="Build your playing group and open player profiles with career records." /><PlayersClient /></section>;
}
