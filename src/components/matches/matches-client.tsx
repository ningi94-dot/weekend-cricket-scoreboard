"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CricketMatch, MatchStatus } from "@/lib/types";

type MatchForm = { homeTeam: string; awayTeam: string; date: string; startTime: string; location: string; overs: number; isTest: boolean };
type MatchCard = CricketMatch & { startTime: string | null; isTest: boolean };

const emptyForm: MatchForm = { homeTeam: "Green Giants", awayTeam: "", date: "", startTime: "", location: "", overs: 20, isTest: true };
const statusFromDb: Record<string, MatchStatus> = { upcoming: "Upcoming", live: "Live", completed: "Completed" };

export function MatchesClient() {
  const [matches, setMatches] = useState<MatchCard[]>([]);
  const [activeFilter, setActiveFilter] = useState<MatchStatus | "All">("All");
  const [form, setForm] = useState(emptyForm);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const visibleMatches = activeFilter === "All" ? matches : matches.filter((match) => match.status === activeFilter);

  useEffect(() => { void loadMatches(); }, []);

  async function loadMatches() {
    try {
      const { data, error } = await getSupabaseBrowserClient().from("matches").select("*").order("match_date", { ascending: false });
      if (error) throw error;
      setMatches((data ?? []).map((row) => ({
        id: row.id,
        homeTeam: row.team_a_name,
        awayTeam: row.team_b_name,
        date: row.match_date,
        startTime: row.start_time,
        location: row.location,
        overs: row.overs_per_innings,
        status: statusFromDb[row.status],
        isTest: row.is_test,
      })));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load matches.");
    } finally {
      setIsLoading(false);
    }
  }

  async function submitMatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.awayTeam.trim() || !form.date || !form.location.trim()) return;
    try {
      const { error } = await getSupabaseBrowserClient().from("matches").insert({
        team_a_name: form.homeTeam.trim(),
        team_b_name: form.awayTeam.trim(),
        match_date: form.date,
        start_time: form.startTime || null,
        location: form.location.trim(),
        overs_per_innings: form.overs,
        is_test: form.isTest,
      });
      if (error) throw error;
      setForm(emptyForm);
      setIsFormOpen(false);
      await loadMatches();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to create match.");
    }
  }

  if (isLoading) return <p className="text-sm text-[var(--muted)]">Loading shared fixtures...</p>;

  return (
    <>
      {message && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</p>}
      <p className="mb-3 text-xs text-[var(--muted)]">Demo mode: anyone with this website can create fixtures and select teams. Score recording is protected in the match center.</p>
      <div className="mb-5 flex gap-3 overflow-x-auto pb-1">
        {(["All", "Upcoming", "Live", "Completed"] as const).map((filter) => <button key={filter} onClick={() => setActiveFilter(filter)} className={`min-h-9 shrink-0 rounded-full px-4 text-sm font-semibold ${activeFilter === filter ? "bg-[var(--brand)] text-white" : "border border-[var(--line)] bg-white text-[var(--muted)]"}`}>{filter}</button>)}
        <button onClick={() => setIsFormOpen(true)} className="ml-auto min-h-9 shrink-0 rounded-full bg-[var(--accent)] px-4 text-sm font-bold text-stone-900">New match</button>
      </div>
      <div className="space-y-3">
        {visibleMatches.length ? visibleMatches.map((match) => (
          <article key={match.id} className="rounded-lg border border-[var(--line)] bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${match.status === "Live" ? "bg-red-50 text-red-700" : match.status === "Completed" ? "bg-stone-100 text-stone-600" : "bg-emerald-50 text-[var(--brand)]"}`}>{match.status}</span>
              <time className="text-xs text-[var(--muted)]">{formatDate(match.date)}{match.startTime ? `, ${match.startTime.slice(0, 5)}` : ""}</time>
            </div>
            <h2 className="mt-3 text-lg font-bold">{match.homeTeam} <span className="text-[var(--muted)]">vs</span> {match.awayTeam}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">{match.location} - {match.overs} overs{match.isTest ? " - Test match" : ""}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Link href={`/matches/${match.id}`} className="flex min-h-10 items-center justify-center rounded-lg bg-[var(--brand)] text-sm font-bold text-white">Match center</Link>
              <Link href={`/matches/${match.id}/teams`} className="flex min-h-10 items-center justify-center rounded-lg border border-[var(--line)] text-sm font-bold text-[var(--brand)]">Select teams</Link>
            </div>
          </article>
        )) : <EmptyState title="No matches here yet" description="Create your next fixture and bring the weekend cricket crew together." />}
      </div>
      {isFormOpen && <div className="fixed inset-0 z-30 flex items-end bg-black/35 sm:items-center sm:justify-center sm:p-4"><form onSubmit={(event) => void submitMatch(event)} className="w-full rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-3xl"><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-bold">Create match</h2><button type="button" onClick={() => setIsFormOpen(false)} className="p-2 text-[var(--muted)]">Close</button></div><Field label="Team A" value={form.homeTeam} onChange={(value) => setForm({ ...form, homeTeam: value })} /><Field label="Team B" value={form.awayTeam} onChange={(value) => setForm({ ...form, awayTeam: value })} placeholder="e.g. Sunday Strikers" /><div className="mt-4 grid grid-cols-2 gap-3"><Field label="Match date" type="date" value={form.date} onChange={(value) => setForm({ ...form, date: value })} /><Field label="Start time" type="time" value={form.startTime} onChange={(value) => setForm({ ...form, startTime: value })} required={false} /></div><div className="mt-4 grid grid-cols-2 gap-3"><Field label="Overs" type="number" value={String(form.overs)} onChange={(value) => setForm({ ...form, overs: Number(value) || 0 })} /><label className="flex items-center gap-2 pt-7 text-sm font-semibold"><input type="checkbox" checked={form.isTest} onChange={(event) => setForm({ ...form, isTest: event.target.checked })} /> Test/dummy</label></div><Field label="Location" value={form.location} onChange={(value) => setForm({ ...form, location: value })} placeholder="e.g. Riverside Ground" /><button className="mt-6 min-h-11 w-full rounded-lg bg-[var(--brand)] text-sm font-bold text-white">Create match</button></form></div>}
    </>
  );
}

function Field({ label, value, onChange, type = "text", placeholder, required = true }: { label: string; value: string; onChange: (value: string) => void; type?: "text" | "date" | "time" | "number"; placeholder?: string; required?: boolean }) {
  return <label className="mt-4 block text-sm font-semibold">{label}<input required={required} type={type} min={type === "number" ? 1 : undefined} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-1.5 min-h-11 w-full rounded-lg border border-[var(--line)] px-3 font-normal" /></label>;
}

function formatDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
