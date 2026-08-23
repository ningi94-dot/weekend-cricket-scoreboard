"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRate, summarizePlayer, type DeliveryRow, type InningsRow, type PlayerRow } from "@/lib/cricket/stats";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { BattingStyle, BowlingStyle, Player, PlayerType } from "@/lib/types";

type FormPlayerType = Exclude<PlayerType, "Unspecified">;
type PlayerSort = "name" | "runs" | "strikeRate" | "battingAverage" | "wickets" | "economy" | "catches";
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
const sortOptions: { value: PlayerSort; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "runs", label: "Total runs" },
  { value: "strikeRate", label: "Strike rate" },
  { value: "battingAverage", label: "Batting average" },
  { value: "wickets", label: "Wickets" },
  { value: "economy", label: "Economy" },
  { value: "catches", label: "Total catches" },
];

export function PlayersClient() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [playerRows, setPlayerRows] = useState<PlayerRow[]>([]);
  const [innings, setInnings] = useState<InningsRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<"active" | "inactive" | "all">("active");
  const [sortBy, setSortBy] = useState<PlayerSort>("name");
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
    .sort((first, second) => comparePlayers(first, second, sortBy)), [playerCards, search, activeFilter, sortBy]);

  useEffect(() => { void loadPlayers(); }, []);

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
      <p className="mb-3 text-xs text-[var(--muted)]">Demo mode: anyone with this website can manage the shared squad.</p>
      <div className="mb-5 flex gap-3">
        <label className="flex min-h-11 flex-1 items-center rounded-lg border border-[var(--line)] bg-white px-3">
          <span className="mr-2 text-[var(--muted)]">Search</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full bg-transparent text-sm outline-none" placeholder="Player name" />
        </label>
        <button onClick={openCreateForm} className="min-h-11 rounded-lg bg-[var(--brand)] px-4 text-sm font-bold text-white">Add</button>
      </div>
      <div className="mb-4 flex gap-2 overflow-x-auto">
        {(["active", "inactive", "all"] as const).map((filter) => <button key={filter} onClick={() => setActiveFilter(filter)} className={`min-h-9 shrink-0 rounded-full px-4 text-sm font-bold capitalize ${activeFilter === filter ? "bg-[var(--brand)] text-white" : "border border-[var(--line)] bg-white text-[var(--muted)]"}`}>{filter}</button>)}
      </div>
      <label className="mb-4 block rounded-lg border border-[var(--line)] bg-white p-3 text-sm font-semibold">
        Sort players by
        <select value={sortBy} onChange={(event) => setSortBy(event.target.value as PlayerSort)} className="mt-2 min-h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 font-normal">
          {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <div className="space-y-3">
        {filteredPlayers.length ? filteredPlayers.map((player) => {
          return (
            <article key={player.id} className="rounded-lg border border-[var(--line)] bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <Link href={`/players/${player.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-100 font-bold text-[var(--brand-dark)]">{initials(player.name)}</span>
                  <div className="min-w-0">
                    <h2 className="truncate font-bold">{player.name}</h2>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">{player.playerType} - {player.battingStyle} - {player.bowlingStyle}</p>
                    {!player.isActive && <p className="mt-1 text-xs font-bold text-amber-700">Inactive</p>}
                  </div>
                </Link>
                <div className="flex gap-1">
                  <button onClick={() => { setEditingId(player.id); setForm({ name: player.name, battingStyle: player.battingStyle, bowlingStyle: player.bowlingStyle, playerType: player.playerType === "Unspecified" ? "" : player.playerType, isActive: player.isActive }); setIsFormOpen(true); }} className="rounded-lg px-2 py-1 text-xs font-semibold text-[var(--brand)]">Edit</button>
                  <button onClick={() => void removePlayer(player.id)} className="rounded-lg px-2 py-1 text-xs font-semibold text-red-600">Delete</button>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
                <SmallStat label="Runs" value={player.runs} />
                <SmallStat label="Avg" value={formatRate(player.battingAverage)} />
                <SmallStat label="SR" value={formatRate(player.strikeRate)} />
                <SmallStat label="Wkts" value={player.wickets} />
                <SmallStat label="Eco" value={formatRate(player.economy)} />
                <SmallStat label="Ct" value={player.catches} />
              </div>
            </article>
          );
        }) : <EmptyState title="No players yet" description="Add the first player to your shared squad." />}
      </div>
      {isFormOpen && <div className="fixed inset-0 z-30 flex items-end bg-black/35 sm:items-center sm:justify-center sm:p-4"><form onSubmit={(event) => void submitPlayer(event)} className="w-full rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-md sm:rounded-3xl"><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-bold">{editingId ? "Edit player" : "Add player"}</h2><button type="button" onClick={() => setIsFormOpen(false)} className="p-2 text-[var(--muted)]">Close</button></div><label className="block text-sm font-semibold">Player name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1.5 min-h-11 w-full rounded-lg border border-[var(--line)] px-3 font-normal" /></label><Select label="Player type" value={form.playerType} options={playerTypes} onChange={(value) => setForm({ ...form, playerType: value as FormPlayerType })} placeholder="Choose player type" /><Select label="Batting style" value={form.battingStyle} options={battingStyles} onChange={(value) => setForm({ ...form, battingStyle: value as BattingStyle })} /><Select label="Bowling style" value={form.bowlingStyle} options={bowlingStyles} onChange={(value) => setForm({ ...form, bowlingStyle: value as BowlingStyle })} /><label className="mt-4 flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} /> Active player</label><p className="mt-1 text-xs text-[var(--muted)]">Inactive players stay in old stats but are hidden from team picking.</p><button className="mt-6 min-h-11 w-full rounded-lg bg-[var(--brand)] text-sm font-bold text-white">Save player</button></form></div>}
    </>
  );
}

function comparePlayers(first: PlayerCard, second: PlayerCard, sortBy: PlayerSort) {
  if (sortBy === "name") return first.name.localeCompare(second.name);

  const result =
    sortBy === "runs" ? second.runs - first.runs :
      sortBy === "strikeRate" ? compareNullableDesc(first.strikeRate, second.strikeRate) :
        sortBy === "battingAverage" ? compareNullableDesc(first.battingAverage, second.battingAverage) :
          sortBy === "wickets" ? second.wickets - first.wickets :
            sortBy === "economy" ? compareNullableAsc(first.economy, second.economy) :
              second.catches - first.catches;

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

function SmallStat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-lg bg-stone-50 p-2"><p className="font-bold">{value}</p><p className="text-[11px] text-[var(--muted)]">{label}</p></div>;
}

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}
