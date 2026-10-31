"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRate, type DeliveryRow, type InningsRow, type MatchRow, type PlayerRow } from "@/lib/cricket/stats";
import { loadTournamentHubData } from "@/lib/cricket/tournament-data";
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
  const [isCaptain, setIsCaptain] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TournamentRow | null>(null);
  const [captainPassword, setCaptainPassword] = useState("");
  const [deleteMessage, setDeleteMessage] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"error" | "success">("error");

  useEffect(() => {
    void load();
    void checkCaptain();
  }, []);

  async function checkCaptain() {
    try {
      const response = await fetch("/api/captain/me", { credentials: "include" });
      const body = await response.json().catch(() => null);
      setIsCaptain(Boolean(body?.isCaptain));
    } catch {
      setIsCaptain(false);
    }
  }

  async function load() {
    try {
      const data = await loadTournamentHubData();
      setTournaments(data.tournaments);
      setMatches(data.matches);
      setPlayers(data.players);
      setSquads(data.squads);
      setInnings(data.innings);
      setDeliveries(data.deliveries);
      setMessage("");
    } catch (error) {
      setMessageTone("error");
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
    if (error) {
      setMessageTone("error");
      setMessage(error.message);
    }
    else {
      setForm(emptyForm);
      setIsFormOpen(false);
      await load();
    }
  }

  function openDeleteTournament(tournament: TournamentRow) {
    setDeleteTarget(tournament);
    setCaptainPassword("");
    setDeleteMessage("");
  }

  async function deleteTournament(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deleteTarget || isDeleting) return;
    setIsDeleting(true);
    setDeleteMessage("");

    try {
      if (!isCaptain) {
        const loginResponse = await fetch("/api/captain/login", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ password: captainPassword }),
        });
        const loginBody = await loginResponse.json().catch(() => null);
        if (!loginResponse.ok) throw new Error(loginBody?.message ?? "Incorrect captain password.");
        setIsCaptain(true);
      }

      const response = await fetch(`/api/tournaments/${deleteTarget.id}`, { method: "DELETE", credentials: "include" });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message ?? "Unable to delete this tournament.");

      const removedMatchIds = new Set(matches.filter((match) => match.tournament_id === deleteTarget.id).map((match) => match.id));
      const removedInningsIds = new Set(innings.filter((row) => removedMatchIds.has(row.match_id)).map((row) => row.id));
      setTournaments((current) => current.filter((tournament) => tournament.id !== deleteTarget.id));
      setMatches((current) => current.filter((match) => !removedMatchIds.has(match.id)));
      setSquads((current) => current.filter((row) => !removedMatchIds.has(row.match_id)));
      setInnings((current) => current.filter((row) => !removedMatchIds.has(row.match_id)));
      setDeliveries((current) => current.filter((delivery) => !removedInningsIds.has(delivery.innings_id)));
      setMessageTone("success");
      setMessage(`${deleteTarget.name} deleted. Match scorecards were preserved and detached from the tournament.`);
      setDeleteTarget(null);
      setCaptainPassword("");
    } catch (error) {
      setDeleteMessage(error instanceof Error ? error.message : "Unable to delete this tournament.");
    } finally {
      setIsDeleting(false);
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
      {message && <p className={`rounded-lg p-3 text-sm ${messageTone === "success" ? "bg-emerald-50 text-[var(--brand-dark)]" : "bg-red-50 text-red-700"}`}>{message}</p>}
      {tournaments.length ? tournaments.map((tournament) => <TournamentCard key={tournament.id} tournament={tournament} matches={matches.filter((match) => match.tournament_id === tournament.id)} players={players} squads={squads} innings={innings} deliveries={deliveries} onDelete={() => openDeleteTournament(tournament)} />) : <EmptyState title="No tournaments yet" description="Create a tournament, then attach matches to it from the New Match form." />}
      {isFormOpen && <div className="fixed inset-0 z-30 flex items-end bg-black/35 sm:items-center sm:justify-center sm:p-4"><form onSubmit={(event) => void submitTournament(event)} className="w-full rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-3xl"><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-bold">Create tournament</h2><button type="button" onClick={() => setIsFormOpen(false)} className="p-2 text-[var(--muted)]">Close</button></div><Field label="Tournament name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} placeholder="e.g. Summer Cup" /><Field label="Start date" type="date" value={form.startDate} onChange={(value) => setForm({ ...form, startDate: value })} required={false} /><Field label="Location" value={form.location} onChange={(value) => setForm({ ...form, location: value })} placeholder="Optional" required={false} /><button className="mt-6 min-h-11 w-full rounded-lg bg-[var(--brand)] text-sm font-bold text-white">Save tournament</button></form></div>}
      {deleteTarget && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/35 sm:items-center sm:justify-center sm:p-4">
          <form onSubmit={(event) => void deleteTournament(event)} className="w-full rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-3xl">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-red-700">Captain action</p><h2 className="mt-1 text-xl font-black">Delete {deleteTarget.name}?</h2></div>
              <button type="button" disabled={isDeleting} onClick={() => setDeleteTarget(null)} aria-label="Close tournament deletion" className="grid size-9 place-items-center rounded-full text-2xl text-[var(--muted)] disabled:opacity-50">&times;</button>
            </div>
            <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">The tournament will be removed. Its {matches.filter((match) => match.tournament_id === deleteTarget.id).length} attached match scorecard{matches.filter((match) => match.tournament_id === deleteTarget.id).length === 1 ? "" : "s"} will be preserved and moved outside the tournament.</p>
            {!isCaptain && <label className="mt-4 block text-sm font-semibold">Captain password<input required type="password" value={captainPassword} onChange={(event) => setCaptainPassword(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] px-3 font-normal" /></label>}
            {deleteMessage && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{deleteMessage}</p>}
            <button disabled={isDeleting || (!isCaptain && !captainPassword)} className="mt-5 min-h-11 w-full rounded-lg bg-red-600 text-sm font-bold text-white disabled:opacity-60">{isDeleting ? "Deleting..." : "Delete tournament"}</button>
          </form>
        </div>
      )}
    </section>
  );
}

function TournamentCard({ tournament, matches, players, squads, innings, deliveries, onDelete }: { tournament: TournamentRow; matches: MatchRow[]; players: PlayerRow[]; squads: SquadRow[]; innings: InningsRow[]; deliveries: DeliveryRow[]; onDelete: () => void }) {
  const leaders = useMemo(() => tournamentLeaders(matches, players, squads, innings, deliveries), [matches, players, squads, innings, deliveries]);
  return (
    <article className="rounded-lg border border-[var(--line)] bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black">{tournament.name}</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">{tournament.location ?? "Tournament"}{tournament.start_date ? ` - ${formatTournamentDate(tournament.start_date)}` : ""}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold capitalize text-[var(--brand)]">{tournament.status}</span>
          <button type="button" onClick={onDelete} className="rounded-lg px-2 py-1 text-xs font-bold text-red-700">Delete</button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <CapTable title="Orange cap" tone="orange" rows={orangeCapRows(leaders.batting)} />
        <CapTable title="Purple cap" tone="purple" rows={purpleCapRows(leaders.bowling)} />
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

function orangeCapRows(rows: { playerId: string; name: string; runs: number; strikeRate: number | null }[]): CapDisplayRow[] {
  const topRuns = rows[0]?.runs;
  return rows
    .slice(0, 2)
    .filter((row, index) => index === 0 || row.runs === topRuns)
    .map((row, index) => ({ id: row.playerId, rank: index + 1, name: row.name, value: `${row.runs} runs`, detail: `SR ${formatRate(row.strikeRate)}`, isLeader: true }));
}

function purpleCapRows(rows: { playerId: string; name: string; wickets: number; economy: number | null }[]): CapDisplayRow[] {
  const topWickets = rows[0]?.wickets;
  return rows
    .slice(0, 2)
    .filter((row, index) => index === 0 || row.wickets === topWickets)
    .map((row, index) => ({ id: row.playerId, rank: index + 1, name: row.name, value: `${row.wickets} wkts`, detail: `Econ ${formatRate(row.economy)}`, isLeader: true }));
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
