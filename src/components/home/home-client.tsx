"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { chooseFeaturedMatch, formatRate, getChaseInfo, summarizeInnings, teamName, type DeliveryRow, type InningsRow, type MatchRow, type PlayerRow } from "@/lib/cricket/stats";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchAllPages, fetchAllPagesByIdChunks } from "@/lib/supabase/fetch-all";

type TournamentRow = { id: string; name: string; start_date: string | null; location: string | null; status: string };

export function HomeClient() {
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [innings, setInnings] = useState<InningsRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [isCaptain, setIsCaptain] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [captainPassword, setCaptainPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isCleanDataOpen, setIsCleanDataOpen] = useState(false);
  const [maintenanceTournaments, setMaintenanceTournaments] = useState<TournamentRow[]>([]);
  const [isLoadingMaintenance, setIsLoadingMaintenance] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const [maintenanceMessageTone, setMaintenanceMessageTone] = useState<"error" | "success">("error");
  const [deleteTarget, setDeleteTarget] = useState<TournamentRow | null>(null);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  async function load() {
    try {
      const supabase = getSupabaseBrowserClient();
      const today = new Date().toISOString().slice(0, 10);
      const [liveResult, upcomingResult, completedResult, playerResult, tournamentResult] = await Promise.all([
        supabase.from("matches").select("*").eq("status", "live").order("updated_at", { ascending: false }).limit(1),
        supabase.from("matches").select("*").eq("status", "upcoming").gte("match_date", today).order("match_date", { ascending: true }).limit(5),
        supabase.from("matches").select("*").eq("status", "completed").order("match_date", { ascending: false }).limit(1),
        supabase.from("players").select("*").eq("is_active", true).order("name").limit(1),
        supabase.from("tournaments").select("*").order("start_date", { ascending: false }).limit(1),
      ]);
      if (liveResult.error) throw liveResult.error;
      if (upcomingResult.error) throw upcomingResult.error;
      if (completedResult.error) throw completedResult.error;
      if (playerResult.error) throw playerResult.error;
      if (tournamentResult.error) throw tournamentResult.error;

      const loadedMatches = [...(liveResult.data ?? []), ...(upcomingResult.data ?? []), ...(completedResult.data ?? [])];
      const featuredMatch = chooseFeaturedMatch(loadedMatches);
      setPlayers(playerResult.data ?? []);
      setTournaments(tournamentResult.data ?? []);

      if (!featuredMatch) {
        setMatches([]);
        setInnings([]);
        setDeliveries([]);
        return;
      }

      setMatches(loadedMatches);
      const inningsRows = await fetchAllPages<InningsRow>((from, to) => supabase.from("innings").select("*").eq("match_id", featuredMatch.id).order("innings_number").order("id").range(from, to));
      setInnings(inningsRows);

      const inningsIds = inningsRows.map((innings) => innings.id);
      if (!inningsIds.length) {
        setDeliveries([]);
        return;
      }

      const deliveryRows = await fetchAllPagesByIdChunks<DeliveryRow>(
        inningsIds,
        (ids, from, to) => supabase.from("deliveries").select("*").in("innings_id", ids).order("innings_id").order("sequence_number").order("id").range(from, to),
      );
      setDeliveries(deliveryRows);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load the home page.");
    } finally {
      setIsLoading(false);
    }
  }

  async function checkCaptain() {
    try {
      const response = await fetch("/api/captain/me", { credentials: "include" });
      const body = await response.json().catch(() => null);
      setIsCaptain(Boolean(body?.isCaptain));
    } catch {
      setIsCaptain(false);
    }
  }

  useEffect(() => {
    void load();
    void checkCaptain();
  }, []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!captainPassword || isLoggingIn) return;
    setIsLoggingIn(true);
    setMaintenanceMessage("");
    const response = await fetch("/api/captain/login", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: captainPassword }),
    });
    const body = await response.json().catch(() => null);
    setIsLoggingIn(false);
    if (!response.ok) {
      setMaintenanceMessageTone("error");
      setMaintenanceMessage(body?.message ?? "Incorrect captain password.");
      return;
    }
    setIsCaptain(true);
    setCaptainPassword("");
    setIsLoginOpen(false);
    setMaintenanceMessage("");
  }

  async function openCleanData() {
    if (!isCaptain) {
      setIsLoginOpen(true);
      return;
    }
    setIsCleanDataOpen(true);
    setIsLoadingMaintenance(true);
    setMaintenanceMessage("");
    try {
      const supabase = getSupabaseBrowserClient();
      const rows = await fetchAllPages<TournamentRow>((from, to) => supabase.from("tournaments").select("id,name,start_date,location,status").order("start_date", { ascending: false }).order("id").range(from, to));
      setMaintenanceTournaments(rows);
    } catch (error) {
      setMaintenanceMessageTone("error");
      setMaintenanceMessage(error instanceof Error ? error.message : "Unable to load tournaments for maintenance.");
    } finally {
      setIsLoadingMaintenance(false);
    }
  }

  function requestTournamentDeletion(tournament: TournamentRow) {
    setDeleteTarget(tournament);
    setDeleteStep(1);
    setDeleteConfirmation("");
    setMaintenanceMessage("");
  }

  async function deleteTournament() {
    if (!deleteTarget || deleteConfirmation !== deleteTarget.name || isDeleting) return;
    setIsDeleting(true);
    setMaintenanceMessage("");
    try {
      const response = await fetch(`/api/tournaments/${deleteTarget.id}`, { method: "DELETE", credentials: "include" });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 401) setIsCaptain(false);
        throw new Error(body?.message ?? "Unable to delete this tournament.");
      }
      setMaintenanceTournaments((current) => current.filter((tournament) => tournament.id !== deleteTarget.id));
      setTournaments((current) => current.filter((tournament) => tournament.id !== deleteTarget.id));
      setMaintenanceMessageTone("success");
      setMaintenanceMessage(`${deleteTarget.name} was deleted. ${body?.detachedMatches ?? 0} match scorecard${body?.detachedMatches === 1 ? " was" : "s were"} preserved and detached.`);
      setDeleteTarget(null);
      setDeleteConfirmation("");
    } catch (error) {
      setMaintenanceMessageTone("error");
      setMaintenanceMessage(error instanceof Error ? error.message : "Unable to delete this tournament.");
    } finally {
      setIsDeleting(false);
    }
  }

  const featured = useMemo(() => chooseFeaturedMatch(matches), [matches]);
  const featuredInnings = featured ? innings.filter((item) => item.match_id === featured.id).sort((a, b) => b.innings_number - a.innings_number)[0] : null;
  const featuredScore = featuredInnings ? summarizeInnings(featuredInnings, deliveries, players) : null;
  const featuredChase = featured && featuredScore ? getChaseInfo(featured, featuredScore) : null;
  const featuredTournament = tournaments[0] ?? null;

  if (isLoading) return <p className="text-sm text-[var(--muted)]">Loading cricket hub...</p>;

  return (
    <div className="space-y-8">
      {message && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</p>}
      <section>
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--brand)]">Upcoming Match</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">Let&apos;s Play Cricket</h1>
          </div>
          <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
            <Link href="/matches" className="text-sm font-bold text-[var(--brand)]">All matches</Link>
            <button type="button" onClick={() => isCaptain ? void openCleanData() : setIsLoginOpen(true)} className="min-h-9 rounded-lg border border-[var(--line)] bg-white px-3 text-sm font-bold text-[var(--brand)]">{isCaptain ? "Clean data" : "Login"}</button>
          </div>
        </div>
        {featured ? (
          <Link href={`/matches/${featured.id}`} className="block rounded-lg bg-[var(--brand-dark)] p-5 text-white shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <StatusBadge status={featured.status} />
              <span className="text-xs text-emerald-50">{formatDate(featured.match_date)}{featured.start_time ? `, ${featured.start_time.slice(0, 5)}` : ""}</span>
            </div>
            <h2 className="mt-4 text-2xl font-bold">{featured.team_a_name} vs {featured.team_b_name}</h2>
            <p className="mt-2 text-sm text-emerald-50">{featured.location} - {featured.overs_per_innings} overs</p>
            <div className="mt-5 rounded-lg bg-white/10 p-4">
              {featuredScore ? (
                <>
                  <p className="text-xs uppercase tracking-[0.16em] text-amber-200">{teamName(featured, featuredScore.innings.batting_team_side)} batting</p>
                  <p className="mt-1 text-4xl font-bold">{featuredScore.runs}-{featuredScore.wickets}</p>
                  <p className="text-sm text-emerald-50">Overs {featuredScore.overs} - CRR {formatRate(featuredScore.runRate)}</p>
                  {featuredChase && <p className="mt-2 rounded-lg bg-white/10 p-2 text-sm font-bold text-amber-100">{featuredChase.sentence} · Req RR {formatRate(featuredChase.requiredRunRate)}</p>}
                </>
              ) : (
                <p className="text-sm text-emerald-50">Teams and score will appear here once the match starts.</p>
              )}
            </div>
          </Link>
        ) : (
          <div className="rounded-lg border border-dashed border-[var(--line)] bg-white p-6">
            <p className="font-bold">No matches yet</p>
            <p className="mt-2 text-sm text-[var(--muted)]">Create your first fixture and it will become the main card here.</p>
            <Link href="/matches" className="mt-4 inline-flex rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-bold text-white">Create match</Link>
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Player Profiles</h2>
          <Link href="/players" className="text-sm font-bold text-[var(--brand)]">View squad</Link>
        </div>
        <div className="grid gap-3">
          {players.map((player) => (
            <Link key={player.id} href={`/players/${player.id}`} className="rounded-lg border border-[var(--line)] bg-white p-4">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-full bg-emerald-100 font-bold text-[var(--brand-dark)]">{initials(player.name)}</span>
                <div className="min-w-0">
                  <h3 className="truncate font-bold">{player.name}</h3>
                  <p className="text-xs capitalize text-[var(--muted)]">{player.batting_style.replaceAll("_", " ")} - {player.bowling_style.replaceAll("_", " ")}</p>
                </div>
              </div>
              <p className="mt-4 rounded-lg bg-stone-50 p-3 text-sm text-[var(--muted)]">Featured active squad member. Open the full profile for career stats.</p>
            </Link>
          ))}
          {!players.length && <p className="rounded-lg border border-dashed border-[var(--line)] bg-white p-5 text-sm text-[var(--muted)]">Active player profiles will appear here.</p>}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Tournaments</h2>
          <Link href="/history" className="text-sm font-bold text-[var(--brand)]">View tournaments</Link>
        </div>
        {featuredTournament ? (
          <Link href="/history" className="block rounded-lg border border-[var(--line)] bg-white p-4">
            <h3 className="font-bold">{featuredTournament.name}</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">{featuredTournament.location ?? "Tournament"}{featuredTournament.start_date ? ` - ${formatDate(featuredTournament.start_date)}` : ""}</p>
            <span className="mt-3 inline-flex text-sm font-bold text-[var(--brand)]">Open tournament</span>
          </Link>
        ) : <p className="rounded-lg border border-dashed border-[var(--line)] bg-white p-5 text-sm text-[var(--muted)]">Create a tournament to group matches and track caps.</p>}
      </section>

      {isLoginOpen && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/35 sm:items-center sm:justify-center sm:p-4">
          <form onSubmit={(event) => void login(event)} className="w-full rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-3xl">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--brand)]">Captain access</p><h2 className="mt-1 text-xl font-black">Login</h2></div>
              <button type="button" disabled={isLoggingIn} onClick={() => { setIsLoginOpen(false); setMaintenanceMessage(""); }} aria-label="Close captain login" className="grid size-9 place-items-center rounded-full text-2xl text-[var(--muted)] disabled:opacity-50">&times;</button>
            </div>
            <p className="mt-3 text-sm text-[var(--muted)]">Captain login is required before destructive data-cleanup tools are displayed.</p>
            <label className="mt-4 block text-sm font-semibold">Captain password<input required type="password" value={captainPassword} onChange={(event) => setCaptainPassword(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] px-3 font-normal" /></label>
            {maintenanceMessage && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{maintenanceMessage}</p>}
            <button disabled={isLoggingIn || !captainPassword} className="mt-5 min-h-11 w-full rounded-lg bg-[var(--brand)] text-sm font-bold text-white disabled:opacity-60">{isLoggingIn ? "Checking..." : "Login"}</button>
          </form>
        </div>
      )}

      {isCleanDataOpen && (
        <div className="fixed inset-0 z-30 overflow-y-auto bg-black/35 sm:p-4">
          <section className="mx-auto min-h-full w-full bg-white p-5 sm:min-h-0 sm:max-w-lg sm:rounded-3xl sm:shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-red-700">Captain maintenance</p><h2 className="mt-1 text-xl font-black">Clean data</h2></div>
              <button type="button" onClick={() => setIsCleanDataOpen(false)} aria-label="Close data cleanup" className="grid size-9 place-items-center rounded-full text-2xl text-[var(--muted)]">&times;</button>
            </div>
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">Warning: this area contains destructive actions. Tournament deletion cannot be undone. Existing match scorecards will be preserved but removed from the deleted tournament.</p>
            {maintenanceMessage && <p className={`mt-4 rounded-lg p-3 text-sm ${maintenanceMessageTone === "success" ? "bg-emerald-50 text-[var(--brand-dark)]" : "bg-red-50 text-red-700"}`}>{maintenanceMessage}</p>}
            {isLoadingMaintenance ? <p className="mt-5 text-sm text-[var(--muted)]">Loading tournaments...</p> : (
              <div className="mt-5 space-y-3">
                {maintenanceTournaments.map((tournament) => (
                  <article key={tournament.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--line)] p-3">
                    <div className="min-w-0"><h3 className="truncate font-bold">{tournament.name}</h3><p className="text-xs text-[var(--muted)]">{tournament.location ?? "No location"}{tournament.start_date ? ` · ${formatDate(tournament.start_date)}` : ""}</p></div>
                    <button type="button" onClick={() => requestTournamentDeletion(tournament)} className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">Delete</button>
                  </article>
                ))}
                {!maintenanceTournaments.length && <p className="rounded-lg border border-dashed border-[var(--line)] p-4 text-sm text-[var(--muted)]">There are no tournaments to clean up.</p>}
              </div>
            )}
          </section>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/45 sm:items-center sm:justify-center sm:p-4">
          <section className="w-full rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-3xl">
            <div className="flex items-start justify-between gap-3">
              <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-red-700">Confirmation {deleteStep} of 2</p><h2 className="mt-1 text-xl font-black">Delete {deleteTarget.name}?</h2></div>
              <button type="button" disabled={isDeleting} onClick={() => setDeleteTarget(null)} aria-label="Cancel tournament deletion" className="grid size-9 place-items-center rounded-full text-2xl text-[var(--muted)] disabled:opacity-50">&times;</button>
            </div>
            {deleteStep === 1 ? (
              <>
                <p className="mt-4 rounded-lg bg-red-50 p-4 text-sm font-semibold text-red-800">Are you sure? The tournament itself will be permanently deleted. Its matches and scorecards will remain available, but they will no longer belong to this tournament.</p>
                <div className="mt-5 grid grid-cols-2 gap-3"><button type="button" onClick={() => setDeleteTarget(null)} className="min-h-11 rounded-lg border border-[var(--line)] font-bold">Cancel</button><button type="button" onClick={() => setDeleteStep(2)} className="min-h-11 rounded-lg bg-red-600 font-bold text-white">Continue</button></div>
              </>
            ) : (
              <>
                <p className="mt-4 rounded-lg border border-red-300 bg-red-50 p-4 text-sm font-black text-red-900">Final warning: this action cannot be undone. Type the tournament name exactly to confirm deletion.</p>
                <label className="mt-4 block text-sm font-semibold">Type “{deleteTarget.name}”<input autoFocus value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-red-300 px-3 font-normal" /></label>
                <div className="mt-5 grid grid-cols-2 gap-3"><button type="button" disabled={isDeleting} onClick={() => { setDeleteStep(1); setDeleteConfirmation(""); }} className="min-h-11 rounded-lg border border-[var(--line)] font-bold disabled:opacity-50">Go back</button><button type="button" disabled={isDeleting || deleteConfirmation !== deleteTarget.name} onClick={() => void deleteTournament()} className="min-h-11 rounded-lg bg-red-700 font-bold text-white disabled:opacity-50">{isDeleting ? "Deleting..." : "Delete permanently"}</button></div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: MatchRow["status"] }) {
  const label = status === "live" ? "Live" : status === "completed" ? "Completed" : "Upcoming";
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${status === "live" ? "bg-red-500 text-white" : status === "completed" ? "bg-white/20 text-white" : "bg-amber-300 text-stone-950"}`}>{label}</span>;
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function formatDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
