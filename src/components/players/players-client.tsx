"use client";

import { FormEvent, useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import type { BattingStyle, BowlingStyle, Player } from "@/lib/types";

const battingStyles: BattingStyle[] = ["Right-hand bat", "Left-hand bat"];
const bowlingStyles: BowlingStyle[] = ["Right-arm pace", "Left-arm pace", "Right-arm off spin", "Left-arm orthodox", "Leg spin", "No bowling"];

type PlayerForm = Pick<Player, "name" | "battingStyle" | "bowlingStyle">;
const emptyForm: PlayerForm = { name: "", battingStyle: "Right-hand bat", bowlingStyle: "No bowling" };

export function PlayersClient({ initialPlayers }: { initialPlayers: Player[] }) {
  const [players, setPlayers] = useState(initialPlayers);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<PlayerForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const filteredPlayers = useMemo(() => players.filter((player) => player.name.toLowerCase().includes(search.toLowerCase())), [players, search]);

  function openCreateForm() { setEditingId(null); setForm(emptyForm); setIsFormOpen(true); }
  function openEditForm(player: Player) { setEditingId(player.id); setForm({ name: player.name, battingStyle: player.battingStyle, bowlingStyle: player.bowlingStyle }); setIsFormOpen(true); }
  function closeForm() { setIsFormOpen(false); setEditingId(null); }

  function submitPlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    if (editingId) {
      setPlayers((current) => current.map((player) => player.id === editingId ? { ...player, ...form, name } : player));
    } else {
      setPlayers((current) => [{ id: crypto.randomUUID(), ...form, name, matches: 0, runs: 0, highestScore: 0, wickets: 0 }, ...current]);
    }
    closeForm();
  }

  function removePlayer(id: string) {
    const player = players.find((item) => item.id === id);
    if (player && window.confirm(`Remove ${player.name} from the squad?`)) setPlayers((current) => current.filter((item) => item.id !== id));
  }

  return <>
    <div className="mb-5 flex gap-3"><label className="flex min-h-11 flex-1 items-center rounded-xl border border-[var(--line)] bg-white px-3"><span className="mr-2 text-[var(--muted)]">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="Search players" aria-label="Search players" /></label><button onClick={openCreateForm} className="min-h-11 rounded-xl bg-[var(--brand)] px-4 text-sm font-bold text-white">+ Add</button></div>
    <div className="space-y-3">{filteredPlayers.length ? filteredPlayers.map((player) => <article key={player.id} className="rounded-2xl border border-[var(--line)] bg-white p-4"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-100 font-bold text-[var(--brand-dark)]">{player.name.split(" ").map((part) => part[0]).join("")}</span><div className="min-w-0"><h2 className="truncate font-bold">{player.name}</h2><p className="mt-0.5 text-xs text-[var(--muted)]">{player.battingStyle} · {player.bowlingStyle}</p></div></div><div className="flex gap-1"><button onClick={() => openEditForm(player)} className="rounded-lg px-2 py-1 text-xs font-semibold text-[var(--brand)]">Edit</button><button onClick={() => removePlayer(player.id)} className="rounded-lg px-2 py-1 text-xs font-semibold text-red-600">Delete</button></div></div><dl className="mt-4 grid grid-cols-4 border-t border-[var(--line)] pt-3 text-center"><Stat label="Matches" value={player.matches} /><Stat label="Runs" value={player.runs} /><Stat label="High" value={player.highestScore} /><Stat label="Wickets" value={player.wickets} /></dl></article>) : <EmptyState title="No players found" description="Try a different search or add a new player to your squad." />}</div>
    {isFormOpen && <div className="fixed inset-0 z-30 flex items-end bg-black/35 sm:items-center sm:justify-center sm:p-4"><form onSubmit={submitPlayer} className="w-full rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-3xl"><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-bold">{editingId ? "Edit player" : "Add player"}</h2><button type="button" onClick={closeForm} className="p-2 text-[var(--muted)]" aria-label="Close">✕</button></div><label className="block text-sm font-semibold">Player name<input required autoFocus value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1.5 min-h-11 w-full rounded-xl border border-[var(--line)] px-3 font-normal outline-none focus:border-[var(--brand)]" placeholder="e.g. Priya Sharma" /></label><Select label="Batting style" value={form.battingStyle} options={battingStyles} onChange={(value) => setForm({ ...form, battingStyle: value as BattingStyle })} /><Select label="Bowling style" value={form.bowlingStyle} options={bowlingStyles} onChange={(value) => setForm({ ...form, bowlingStyle: value as BowlingStyle })} /><div className="mt-6 flex gap-3"><button type="button" onClick={closeForm} className="min-h-11 flex-1 rounded-xl border border-[var(--line)] text-sm font-bold">Cancel</button><button className="min-h-11 flex-1 rounded-xl bg-[var(--brand)] text-sm font-bold text-white">{editingId ? "Save changes" : "Add player"}</button></div></form></div>}
  </>;
}

function Stat({ label, value }: { label: string; value: number }) { return <div><dd className="font-bold">{value}</dd><dt className="mt-0.5 text-[10px] uppercase tracking-wide text-[var(--muted)]">{label}</dt></div>; }
function Select({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void }) { return <label className="mt-4 block text-sm font-semibold">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border border-[var(--line)] bg-white px-3 font-normal outline-none focus:border-[var(--brand)]">{options.map((option) => <option key={option}>{option}</option>)}</select></label>; }
