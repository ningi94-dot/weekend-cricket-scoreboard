import { TournamentsClient } from "@/components/tournaments/tournaments-client";

export default function TournamentsPage() {
  return (
    <section>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--brand)]">Tournaments</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight">Tournament Hub</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">Create tournaments, attach matches, and track orange and purple cap leaders.</p>
      <div className="mt-5">
        <TournamentsClient />
      </div>
    </section>
  );
}
