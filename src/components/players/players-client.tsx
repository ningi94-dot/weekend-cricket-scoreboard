"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRate, summarizePlayer, type DeliveryRow, type InningsRow, type PlayerRow } from "@/lib/cricket/stats";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { BattingStyle, BowlingStyle, Player, PlayerType } from "@/lib/types";

type FormPlayerType = Exclude<PlayerType, "Unspecified">;
type PlayerStatKey = "runs" | "battingAverage" | "strikeRate" | "wickets" | "economy" | "catches" | "matches";
type PlayerSort = "name" | PlayerStatKey;
type SortDirection = "asc" | "desc";
type PlayerCard = Player & { strikeRate: number | null; battingAverage: number | null; economy: number | null; catches: number };

const battingStyles: BattingStyle[] = ["Right-hand bat", "Left-hand bat"];
const bowlingStyles: BowlingStyle[] = ["Right-arm pace", "Left-arm pace", "Right-arm off spin", "Left-arm orthodox", "Leg spin", "No bowling"];
const playerTypes: FormPlayerType[] = ["Batting player", "Bowling player", "All rounder"];
const emptyForm = { name: "", battingStyle: "Right-hand bat" as BattingStyle, bowlingStyle: "No bowling" as BowlingStyle, playerType: "" as FormPlayerType | "", isActive: true };
const battingToDb = { "Right-hand bat": "right_hand", "Left-hand bat": "left_hand" } as const;
const bowlingToDb = { "Right-arm pace": "right_arm_pace", "Left-arm pace": "left_arm_pace", "Right-arm off spin": "right_arm_off_spin", "Left-arm orthodox": "left_arm_orthodox", "Leg spin": "leg_spin", "No bowling": "none" } as const;
const playerTypeToDb = { "Batting player": "batting", "Bowling player": "bowling", "All rounder": "fielding" } as const;
const battingFromDb: Record<string, BattingStyle> = { right_hand: "Right-hand bat", left_hand: "Left-hand bat" };
const bowlingFromDb: Record<string, BowlingStyle> = { right_arm_pace: "Right-arm pace", left_arm_pace: "Left-arm pace", right_arm_off_spin: "Right-arm off spin", left_arm_orthodox: "Left-arm orthodox", leg_spin: "Leg spin", none: "No bowling" };
const playerTypeFromDb: Record<string, PlayerType> = { batting: "Batting player", bowling: "Bowling player", fielding: "All rounder" };
const defaultColumns: PlayerStatKey[] = ["runs", "battingAverage", "wickets", "economy"];
const statOptions: { value: PlayerStatKey; label: string; shortLabel: string }[] = [
  { value: "runs", label: "Total runs", shortLabel: "Runs" },
  { value: "battingAverage", label: "Batting average", shortLabel: "Avg" },
  { value: "strikeRate", label: "Strike rate", shortLabel: "SR" },
  { value: "wickets", label: "Wickets", shortLabel: "Wkts" },
  { value: "economy", label: "Economy", shortLabel: "Eco" },
  { value: "catches", label: "Total catches", shortLabel: "Ct" },
  { value: "matches", label: "Matches", shortLabel: "Mat" },
];

export function PlayersClient() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [playerRows, setPlayerRows] = useState<PlayerRow[]>([]);
  const [innings, setInnings] = useState<InningsRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<"active" | "inactive" | "all">("active");
  const [sortBy, setSortBy] = useState<PlayerSort>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [visibleColumns, setVisibleColumns] = useState<PlayerStatKey[]>(defaultColumns);
  const [isColumnMenuOpen, setIsColumnMenuOpen] = useState(false);
  const [isScorer, setIsScorer] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [username, setUsername] = useState("Umpire");
  const [password, setPassword] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");
  const playerCards = useMemo<PlayerCard[]>(() => players.map((player) => {
    const row = playerRows.find((item) => item.id === player.id);
    const stats = row ? summarizePlayer(row.id, { players: playerRows, innings, deliveries }) : null;
    return {
      ...player,
      matches: stats?.matches ?? player.matches,
      runs: stats?.runs ?? player.runs,
      highestScore: stats?.highest.runs ?? player.highestScore,
      wickets: stats?.wickets ?? player.wickets,
      strikeRate: stats?.strikeRate ?? null,
      battingAverage: stats?.average ?? null,
      economy: stats?.economy ?? null,
      catches: stats?.catches ?? 0,
    };
  }), [players, playerRows, innings, deliveries]);
  const filteredPlayers = useMemo(() => playerCards
    .filter((player) => player.name.toLowerCase().includes(search.toLowerCase()) && (activeFilter === "all" || (activeFilter === "active" ? player.isActive : !player.isActive)))
    .sort((first, second) => comparePlayers(first, second, sortBy, sortDirection)), [playerCards, search, activeFilter, sortBy, sortDirection]);

  useEffect(() => { void loadPlayers(); }, []);
  useEffect(() => { void loadScorerSession(); }, []);

  async function loadPlayers() {
    try {
      const supabase = getSupabaseBrowserClient();
      const [playerResult, inningsResult, deliveryResult] = await Promise.all([
        supabase.from("players").select("*").order("name"),
        supabase.from("innings").select("*"),
        supabase.from("deliveries").select("*").order("sequence_number"),
      ]);
      if (playerResult.error) throw playerResult.error;
      if (inningsResult.error) throw inningsResult.error;
      if (deliveryResult.error) throw deliveryResult.error;
      const rows = playerResult.data ?? [];
      setPlayerRows(rows);
      setInnings(inningsResult.data ?? []);
      setDeliveries(deliveryResult.data ?? []);
      setPlayers(rows.map((row) => {
        const stats = summarizePlayer(row.id, { players: rows, innings: inningsResult.data ?? [], deliveries: deliveryResult.data ?? [] });
        return { id: row.id, name: row.name, battingStyle: battingFromDb[row.batting_style], bowlingStyle: bowlingFromDb[row.bowling_style], playerType: row.player_type ? playerTypeFromDb[row.player_type] : "Unspecified", isActive: row.is_active, matches: stats.matches, runs: stats.runs, highestScore: stats.highest.runs, wickets: stats.wickets };
      }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load players.");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadScorerSession() {
    const response = await fetch("/api/scorer/me");
    const body = await response.json().catch(() => null);
    setIsScorer(Boolean(body?.isScorer));
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch("/api/scorer/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username, password }) });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(body?.message ?? "Unable to login.");
      return;
    }
    setIsScorer(true);
    setPassword("");
    setIsLoginOpen(false);
    setMessage("");
  }

  async function logout() {
    await fetch("/api/scorer/logout", { method: "POST" });
    setIsScorer(false);
    setIsFormOpen(false);
  }

  function changeSort(nextSort: PlayerSort) {
    if (sortBy === nextSort) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
      return;
    }
    setSortBy(nextSort);
    setSortDirection(defaultSortDirection(nextSort));
  }

  function replaceColumn(index: number, value: PlayerStatKey) {
    setVisibleColumns((columns) => columns.map((column, columnIndex) => columnIndex === index ? value : column));
  }

  function openCreateForm() {
    setEditingId(null);
    setForm(emptyForm);
    setIsFormOpen(true);
  }

  async function submitPlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    if (!form.playerType) {
      setMessage("Choose a player type before saving.");
      return;
    }
    try {
      const supabase = getSupabaseBrowserClient();
      const record = { name, batting_style: battingToDb[form.battingStyle], bowling_style: bowlingToDb[form.bowlingStyle], player_type: form.playerType ? playerTypeToDb[form.playerType] : null, is_active: form.isActive };
      const { error } = editingId ? await supabase.from("players").update(record).eq("id", editingId) : await supabase.from("players").insert(record);
      if (error) throw error;
      setIsFormOpen(false);
      await loadPlayers();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save player.");
    }
  }

  async function removePlayer(id: string) {
    const player = players.find((item) => item.id === id);
    if (!player || !window.confirm(`Remove ${player.name} from the squad?`)) return;
    const { error } = await getSupabaseBrowserClient().from("players").delete().eq("id", id);
    if (error) setMessage(error.message);
    else await loadPlayers();
  }

  if (isLoading) return <p className="text-sm text-[var(--muted)]">Loading shared squad...</p>;

  return (
    <>
      {message && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</p>}
      <div className="mb-5 flex gap-3">
        <label className="flex min-h-11 flex-1 items-center rounded-lg border border-[var(--line)] bg-white px-3">
          <span className="mr-2 text-[var(--muted)]">Search</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="Player name" />
        </label>
        {isScorer ? (
          <>
            <button onClick={openCreateForm} className="min-h-11 rounded-lg bg-[var(--brand)] px-4 text-sm font-bold text-white">Add</button>
            <button onClick={() => void logout()} className="min-h-11 rounded-lg border border-[var(--line)] bg-white px-4 text-sm font-bold text-[var(--brand)]">Logout</button>
          </>
        ) : (
          <button onClick={() => setIsLoginOpen(true)} className="min-h-11 rounded-lg bg-[var(--brand)] px-4 text-sm font-bold text-white">Login</button>
        )}
      </div>
      <div className="mb-4 flex items-center gap-2">
        {(["active", "inactive", "all"] as const).map((filter) => <button key={filter} onClick={() => setActiveFilter(filter)} className={`min-h-9 shrink-0 rounded-full px-4 text-sm font-bold capitalize ${activeFilter === filter ? "bg-[var(--brand)] text-white" : "border border-[var(--line)] bg-white text-[var(--muted)]"}`}>{filter}</button>)}
        <div className="relative ml-auto shrink-0">
          <button
            type="button"
            aria-expanded={isColumnMenuOpen}
            onClick={() => setIsColumnMenuOpen(!isColumnMenuOpen)}
            className="min-h-9 rounded-full border border-[var(--line)] bg-white px-4 text-sm font-bold text-[var(--brand)]"
          >
            Columns
          </button>
        </div>
      </div>
      {isColumnMenuOpen && (
        <section className="mb-4 rounded-lg border border-[var(--line)] bg-white p-3">
          <p className="text-sm font-bold">Replace table columns</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            {visibleColumns.map((column, index) => (
              <label key={`${column}-${index}`} className="block text-xs font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
                Column {index + 1}
                <select value={column} onChange={(event) => replaceColumn(index, event.target.value as PlayerStatKey)} className="mt-1 min-h-10 w-full rounded-lg border border-[var(--line)] bg-white px-2 text-sm font-normal normal-case tracking-normal text-stone-900">
                  {statOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            ))}
          </div>
        </section>
      )}
      <div className="overflow-x-auto rounded-lg border border-[var(--line)] bg-white">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="bg-stone-50 text-xs uppercase tracking-[0.08em] text-[var(--muted)]">
            <tr>
              <SortableHeader label="Name" active={sortBy === "name"} direction={sortDirection} onClick={() => changeSort("name")} />
              {visibleColumns.map((column, index) => <SortableHeader key={`${column}-${index}`} label={statLabel(column)} active={sortBy === column} direction={sortDirection} onClick={() => changeSort(column)} alignRight />)}
              {isScorer && <th className="px-3 py-3 text-right font-black">Manage</th>}
            </tr>
          </thead>
          <tbody>
            {filteredPlayers.length ? filteredPlayers.map((player) => (
              <tr key={player.id} className="border-t border-[var(--line)]">
                <td className="max-w-[260px] px-3 py-3">
                  <Link href={`/players/${player.id}`} className="flex min-w-0 items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-emerald-100 font-bold text-[var(--brand-dark)]">{initials(player.name)}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-bold text-stone-950">{player.name}</span>
                      <span className="block truncate text-xs text-[var(--muted)]">{player.playerType}{!player.isActive ? " · Inactive" : ""}</span>
                    </span>
                  </Link>
                </td>
                {visibleColumns.map((column, index) => <td key={`${player.id}-${column}-${index}`} className="px-3 py-3 text-right font-bold">{formatPlayerStat(player, column)}</td>)}
                {isScorer && (
                  <td className="px-3 py-3 text-right">
                    <button onClick={() => { setEditingId(player.id); setForm({ name: player.name, battingStyle: player.battingStyle, bowlingStyle: player.bowlingStyle, playerType: player.playerType === "Unspecified" ? "" : player.playerType, isActive: player.isActive }); setIsFormOpen(true); }} className="rounded-lg px-2 py-1 text-xs font-semibold text-[var(--brand)]">Edit</button>
                    <button onClick={() => void removePlayer(player.id)} className="rounded-lg px-2 py-1 text-xs font-semibold text-red-600">Delete</button>
                  </td>
                )}
              </tr>
            )) : <tr><td colSpan={visibleColumns.length + (isScorer ? 2 : 1)} className="p-4"><EmptyState title="No players yet" description="Add the first player to your shared squad." /></td></tr>}
          </tbody>
        </table>
      </div>
      {isLoginOpen && <div className="fixed inset-0 z-30 flex items-end bg-black/35 sm:items-center sm:justify-center sm:p-4"><form onSubmit={(event) => void login(event)} className="w-full rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-3xl"><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-bold">Player management login</h2><button type="button" onClick={() => setIsLoginOpen(false)} className="p-2 text-[var(--muted)]">Close</button></div><p className="text-sm text-[var(--muted)]">Use the Umpire login or the captain password.</p><label className="mt-4 block text-sm font-semibold">Username<input value={username} onChange={(event) => setUsername(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-lg border border-[var(--line)] px-3 font-normal" /></label><label className="mt-4 block text-sm font-semibold">Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-lg border border-[var(--line)] px-3 font-normal" /></label><button className="mt-6 min-h-11 w-full rounded-lg bg-[var(--brand)] text-sm font-bold text-white">Login</button></form></div>}
      {isFormOpen && <div className="fixed inset-0 z-30 flex items-end bg-black/35 sm:items-center sm:justify-center sm:p-4"><form onSubmit={(event) => void submitPlayer(event)} className="w-full rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-3xl"><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-bold">{editingId ? "Edit player" : "Add player"}</h2><button type="button" onClick={() => setIsFormOpen(false)} className="p-2 text-[var(--muted)]">Close</button></div><label className="block text-sm font-semibold">Player name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1.5 min-h-11 w-full rounded-lg border border-[var(--line)] px-3 font-normal" /></label><Select label="Player type" value={form.playerType} options={playerTypes} onChange={(value) => setForm({ ...form, playerType: value as FormPlayerType })} placeholder="Choose player type" /><Select label="Batting style" value={form.battingStyle} options={battingStyles} onChange={(value) => setForm({ ...form, battingStyle: value as BattingStyle })} /><Select label="Bowling style" value={form.bowlingStyle} options={bowlingStyles} onChange={(value) => setForm({ ...form, bowlingStyle: value as BowlingStyle })} /><label className="mt-4 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} /> Active player</label><p className="mt-1 text-xs text-[var(--muted)]">Inactive players stay in old stats but are hidden from team picking.</p><button className="mt-6 min-h-11 w-full rounded-lg bg-[var(--brand)] text-sm font-bold text-white">Save player</button></form></div>}
    </>
  );
}

function SortableHeader({ label, active, direction, onClick, alignRight = false }: { label: string; active: boolean; direction: SortDirection; onClick: () => void; alignRight?: boolean }) {
  return <th className={`px-3 py-3 font-black ${alignRight ? "text-right" : "text-left"}`}><button type="button" onClick={onClick} className={`inline-flex items-center gap-1 ${alignRight ? "justify-end" : "justify-start"} ${active ? "text-[var(--brand)]" : ""}`}>{label}{active && <span aria-hidden="true">{direction === "asc" ? "↑" : "↓"}</span>}</button></th>;
}

function statLabel(key: PlayerStatKey) {
  return statOptions.find((option) => option.value === key)?.shortLabel ?? key;
}

function formatPlayerStat(player: PlayerCard, key: PlayerStatKey) {
  if (key === "runs") return player.runs;
  if (key === "battingAverage") return formatRate(player.battingAverage);
  if (key === "strikeRate") return formatRate(player.strikeRate);
  if (key === "wickets") return player.wickets;
  if (key === "economy") return formatRate(player.economy);
  if (key === "catches") return player.catches;
  return player.matches;
}

function numericPlayerStat(player: PlayerCard, key: PlayerStatKey) {
  if (key === "runs") return player.runs;
  if (key === "battingAverage") return player.battingAverage;
  if (key === "strikeRate") return player.strikeRate;
  if (key === "wickets") return player.wickets;
  if (key === "economy") return player.economy;
  if (key === "catches") return player.catches;
  return player.matches;
}

function defaultSortDirection(sortBy: PlayerSort): SortDirection {
  return sortBy === "name" || sortBy === "economy" ? "asc" : "desc";
}

function comparePlayers(first: PlayerCard, second: PlayerCard, sortBy: PlayerSort, direction: SortDirection) {
  if (sortBy === "name") {
    const result = first.name.localeCompare(second.name);
    return direction === "asc" ? result : -result;
  }

  const result =
    direction === "asc"
      ? compareNullableAsc(numericPlayerStat(first, sortBy), numericPlayerStat(second, sortBy))
      : compareNullableDesc(numericPlayerStat(first, sortBy), numericPlayerStat(second, sortBy));

  return result || first.name.localeCompare(second.name);
}

function compareNullableDesc(first: number | null, second: number | null) {
  if (first === null && second === null) return 0;
  if (first === null) return 1;
  if (second === null) return -1;
  return second - first;
}

function compareNullableAsc(first: number | null, second: number | null) {
  if (first === null && second === null) return 0;
  if (first === null) return 1;
  if (second === null) return -1;
  return first - second;
}

function Select({ label, value, options, onChange, placeholder, required = true }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void; placeholder?: string; required?: boolean }) {
  return <label className="mt-4 block text-sm font-semibold">{label}<select required={required} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 font-normal">{placeholder && <option value="">{placeholder}</option>}{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}
