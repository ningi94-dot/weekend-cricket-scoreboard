"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRate, type DeliveryRow, type InningsRow, type MatchRow, type PlayerRow } from "@/lib/cricket/stats";
import { formatTournamentDate, tournamentLeaders, type CapDisplayRow, type CapTone, type SquadRow, type TournamentRow } from "@/lib/cricket/tournament-stats";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type TournamentForm = { name: string; startDate: string; location: string };

const emptyForm: TournamentForm = { name: "", startDate: "", location: "" };

export function TournamentsClient() {
  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [squads, setSquads] = useState<SquadRow[]>([]);
  const [innings, setInnings] = useState<InningsRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => { void load(); }, []);

  async function load() {
    try {
      const supabase = getSupabaseBrowserClient();
      const [tournamentResult, matchResult, playerResult] = await Promise.all([
        supabase.from("tournaments").select("*").order("start_date", { ascending: false }),
        supabase.from("matches").select("*").not("tournament_id", "is", null).order("match_date", { ascending: false }),
        supabase.from("players").select("*").order("name"),
      ]);
      if (tournamentResult.error) throw tournamentResult.error;
      if (matchResult.error) throw matchResult.error;
      if (playerResult.error) throw playerResult.error;

      const matchRows = matchResult.data ?? [];
      const matchIds = matchRows.map((match) => match.id);
      let squadRows: SquadRow[] = [];
      let inningsRows: InningsRow[] = [];
      let deliveryRows: DeliveryRow[] = [];

      if (matchIds.length) {
        const squadResult = await supabase.from("match_squads").select("*").in("match_id", matchIds);
        if (squadResult.error) throw squadResult.error;
        squadRows = squadResult.data ?? [];

        const inningsResult = await supabase.from("innings").select("*").in("match_id", matchIds);
        if (inningsResult.error) throw inningsResult.error;
        inningsRows = inningsResult.data ?? [];

        const inningsIds = inningsRows.map((inningsRow) => inningsRow.id);
        if (inningsIds.length) {
          const deliveryResult = await supabase.from("deliveries").select("*").in("innings_id", inningsIds).order("sequence_number");
          if (deliveryResult.error) throw deliveryResult.error;
          deliveryRows = deliveryResult.data ?? [];
        }
      }

      setTournaments(tournamentResult.data ?? []);
      setMatches(matchRows);
      setPlayers(playerResult.data ?? []);
      setSquads(squadRows);
      setInnings(inningsRows);
      setDeliveries(deliveryRows);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load tournaments.");
    } finally {
      setIsLoading(false);
    }
  }

  async function submitTournament(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim()) return;
    const { error } = await getSupabaseBrowserClient().from("tournaments").insert({
      name: form.name.trim(),
      start_date: form.startDate || null,
      location: form.location.trim() || null,
    });
    if (error) setMessage(error.message);
    else {
      setForm(emptyForm);
      setIsFormOpen(false);
      await load();
    }
  }

  if (isLoading) return <p className="text-sm text-[var(--muted)]">Loading tournaments...</p>;

  return (
    <section className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--brand)]">Tournaments</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Tournament Hub</h1>
        </div>
        <button
          type="button"
          onClick={() => setIsFormOpen(true)}
          aria-label="Create tournament"
          className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--brand)] text-2xl font-black leading-none text-white shadow-sm"
        >
          +
        </button>
      </header>
      {message && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</p>}
      {tournaments.length ? tournaments.map((tournament) => <TournamentCard key={tournament.id} tournament={tournament} matches={matches.filter((match) => match.tournament_id === tournament.id)} players={players} squads={squads} innings={innings} deliveries={deliveries} />) : <EmptyState title="No tournaments yet" description="Create a tournament, then attach matches to it from the New Match form." />}
      {isFormOpen && <div className="fixed inset-0 z-30 flex items-end bg-black/35 sm:items-center sm:justify-center sm:p-4"><form onSubmit={(event) => void submitTournament(event)} className="w-full rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-3xl"><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-bold">Create tournament</h2><button type="button" onClick={() => setIsFormOpen(false)} className="p-2 text-[var(--muted)]">Close</button></div><Field label="Tournament name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} placeholder="e.g. Summer Cup" /><Field label="Start date" type="date" value={form.startDate} onChange={(value) => setForm({ ...form, startDate: value })} required={false} /><Field label="Location" value={form.location} onChange={(value) => setForm({ ...form, location: value })} placeholder="Optional" required={false} /><button className="mt-6 min-h-11 w-full rounded-lg bg-[var(--brand)] text-sm font-bold text-white">Save tournament</button></form></div>}
    </section>
  );
}

function TournamentCard({ tournament, matches, players, squads, innings, deliveries }: { tournament: TournamentRow; matches: MatchRow[]; players: PlayerRow[]; squads: SquadRow[]; innings: InningsRow[]; deliveries: DeliveryRow[] }) {
  const leaders = useMemo(() => tournamentLeaders(matches, players, squads, innings, deliveries), [matches, players, squads, innings, deliveries]);
  return (
    <article className="rounded-lg border border-[var(--line)] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black">{tournament.name}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{tournament.location ?? "Tournament"}{tournament.start_date ? ` - ${formatTournamentDate(tournament.start_date)}` : ""}</p>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold capitalize text-[var(--brand)]">{tournament.status}</span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <CapTable title="Orange cap" tone="orange" rows={leaders.batting.slice(0, 1).map((row, index) => ({ id: row.playerId, rank: index + 1, name: row.name, value: `${row.runs} runs`, detail: `SR ${formatRate(row.strikeRate)}`, isLeader: index === 0 }))} />
        <CapTable title="Purple cap" tone="purple" rows={leaders.bowling.slice(0, 1).map((row, index) => ({ id: row.playerId, rank: index + 1, name: row.name, value: `${row.wickets} wkts`, detail: `Econ ${formatRate(row.economy)}`, isLeader: index === 0 }))} />
      </div>
      <Link href={`/history/${tournament.id}/leaders`} className="mt-4 flex min-h-11 items-center justify-between rounded-lg border border-[var(--line)] bg-emerald-50 px-3 text-sm font-black text-[var(--brand-dark)]">
        <span>Tournament leaders</span>
        <span aria-hidden="true">-&gt;</span>
      </Link>
      <Link href={`/history/${tournament.id}/records`} className="mt-4 flex min-h-11 items-center justify-between rounded-lg border border-[var(--line)] bg-stone-50 px-3 text-sm font-black text-[var(--brand)]">
        <span>View tournament records</span>
        <span aria-hidden="true">-&gt;</span>
      </Link>
      <p className="mt-3 text-xs font-semibold text-[var(--muted)]">{matches.length} match{matches.length === 1 ? "" : "es"} attached</p>
    </article>
  );
}

function CapTable({ title, rows, tone }: { title: string; rows: CapDisplayRow[]; tone: CapTone }) {
  const toneClass = tone === "orange" ? "bg-orange-50 text-orange-800" : "bg-purple-50 text-purple-800";

  return (
    <section className={`rounded-lg p-3 ${toneClass}`}>
      <h3 className="font-black">{title}</h3>
      <ul className="mt-2 space-y-2 text-sm">
        {rows.length ? rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="shrink-0 font-bold">{row.rank}.</span>
              <span className="truncate font-semibold">{row.name}</span>
              {row.isLeader && <CapIcon tone={tone} />}
            </span>
            <span className="shrink-0 text-right text-xs font-bold">
              {row.value}
              <span className="block font-semibold opacity-75">{row.detail}</span>
            </span>
          </li>
        )) : <li>No data yet.</li>}
      </ul>
    </section>
  );
}

function CapIcon({ tone }: { tone: CapTone }) {
  const src = tone === "orange" ? "/images/cap-orange.png" : "/images/cap-purple.png";

  return (
    <Image
      src={src}
      alt=""
      aria-hidden="true"
      width={28}
      height={22}
      className="h-5 w-6 shrink-0 object-contain"
      title={`${tone} cap leader`}
    />
  );
}

function Field({ label, value, onChange, type = "text", placeholder, required = true }: { label: string; value: string; onChange: (value: string) => void; type?: "text" | "date"; placeholder?: string; required?: boolean }) {
  return <label className="mt-4 block text-sm font-semibold">{label}<input required={required} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-1.5 min-h-11 w-full rounded-lg border border-[var(--line)] px-3 font-normal" /></label>;
}
