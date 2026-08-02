"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Player = { id: string; name: string; battingStyle: string; bowlingStyle: string };
type SelectedPlayer = { teamSide: "a" | "b"; isCaptain: boolean };
type Fixture = { id: string; teamA: string; teamB: string; date: string; location: string; overs: number };

export function TeamSelectionClient({ matchId }: { matchId: string }) {
  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selection, setSelection] = useState<Record<string, SelectedPlayer>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  const teamA = useMemo(() => players.filter((player) => selection[player.id]?.teamSide === "a"), [players, selection]);
  const teamB = useMemo(() => players.filter((player) => selection[player.id]?.teamSide === "b"), [players, selection]);

  useEffect(() => { void load(); }, [matchId]);
  async function load() {
    try {
      const supabase = getSupabaseBrowserClient();
      const [{ data: match, error: matchError }, { data: playerRows, error: playerError }, { data: squadRows, error: squadError }] = await Promise.all([
        supabase.from("matches").select("id,team_a_name,team_b_name,match_date,location,overs_per_innings").eq("id", matchId).single(),
        supabase.from("players").select("id,name,batting_style,bowling_style").order("name"),
        supabase.from("match_squads").select("player_id,team_side,is_captain").eq("match_id", matchId),
      ]);
      if (matchError) throw matchError; if (playerError) throw playerError; if (squadError) throw squadError;
      setFixture({ id: match.id, teamA: match.team_a_name, teamB: match.team_b_name, date: match.match_date, location: match.location, overs: match.overs_per_innings });
      setPlayers((playerRows ?? []).map((player) => ({ id: player.id, name: player.name, battingStyle: player.batting_style.replaceAll("_", " "), bowlingStyle: player.bowling_style.replaceAll("_", " ") })));
      setSelection(Object.fromEntries((squadRows ?? []).map((row) => [row.player_id, { teamSide: row.team_side, isCaptain: row.is_captain }])));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to load team selection."); } finally { setIsLoading(false); }
  }

  function assignPlayer(playerId: string, teamSide: "a" | "b") { setSelection((current) => ({ ...current, [playerId]: { teamSide, isCaptain: false } })); }
  function removePlayer(playerId: string) { setSelection((current) => { const next = { ...current }; delete next[playerId]; return next; }); }
  function toggleCaptain(playerId: string) { setSelection((current) => { const picked = current[playerId]; if (!picked) return current; const next = { ...current }; for (const [id, value] of Object.entries(next)) if (value.teamSide === picked.teamSide) next[id] = { ...value, isCaptain: id === playerId ? !value.isCaptain : false }; return next; }); }
  async function saveTeams() { if (!fixture) return; setIsSaving(true); setMessage(""); try { const supabase = getSupabaseBrowserClient(); const { error: deleteError } = await supabase.from("match_squads").delete().eq("match_id", matchId); if (deleteError) throw deleteError; const rows = Object.entries(selection).map(([playerId, entry]) => ({ match_id: matchId, player_id: playerId, team_side: entry.teamSide, is_captain: entry.isCaptain })); if (rows.length) { const { error: insertError } = await supabase.from("match_squads").insert(rows); if (insertError) throw insertError; } setMessage("Teams saved for everyone to see."); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save the teams."); } finally { setIsSaving(false); } }
  if (isLoading) return <p className="text-sm text-[var(--muted)]">Loading team selection…</p>;
  if (!fixture) return <EmptyState title="Match not found" description="Return to Matches and select a fixture from the upcoming list." />;
  return <section><Link href="/matches" className="text-sm font-bold text-[var(--brand)]">← Back to matches</Link><div className="mt-4 rounded-2xl bg-[var(--brand-dark)] p-5 text-white"><p className="text-xs font-bold uppercase tracking-wider text-amber-300">Upcoming fixture</p><h1 className="mt-1 text-xl font-bold">{fixture.teamA} vs {fixture.teamB}</h1><p className="mt-2 text-sm text-emerald-50">{fixture.location} · {fixture.overs} overs</p></div>{message && <p className={`mt-4 rounded-xl p-3 text-sm ${message.startsWith("Teams saved") ? "bg-emerald-50 text-[var(--brand-dark)]" : "bg-red-50 text-red-700"}`}>{message}</p>}<div className="mt-5 grid gap-4 md:grid-cols-2"><TeamPanel title={fixture.teamA} side="a" players={teamA} selection={selection} onRemove={removePlayer} onCaptain={toggleCaptain} /><TeamPanel title={fixture.teamB} side="b" players={teamB} selection={selection} onRemove={removePlayer} onCaptain={toggleCaptain} /></div><section className="mt-6"><h2 className="text-lg font-bold">Available players</h2><p className="mt-1 text-sm text-[var(--muted)]">Choose a side for each player. A player can only be selected once.</p><div className="mt-3 space-y-2">{players.filter((player) => !selection[player.id]).length ? players.filter((player) => !selection[player.id]).map((player) => <article key={player.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-white p-3"><div><h3 className="font-semibold">{player.name}</h3><p className="text-xs capitalize text-[var(--muted)]">{player.battingStyle} · {player.bowlingStyle}</p></div><div className="flex gap-2"><button onClick={() => assignPlayer(player.id, "a")} className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-[var(--brand)]">{fixture.teamA}</button><button onClick={() => assignPlayer(player.id, "b")} className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">{fixture.teamB}</button></div></article>) : <EmptyState title="All players are assigned" description="Remove a player from a team to change the selection." />}</div></section><button onClick={() => void saveTeams()} disabled={isSaving} className="sticky bottom-4 mt-6 min-h-12 w-full rounded-xl bg-[var(--brand)] text-sm font-bold text-white shadow-lg disabled:opacity-60">{isSaving ? "Saving teams…" : "Save team selection"}</button></section>;
}

function TeamPanel({ title, side, players, selection, onRemove, onCaptain }: { title: string; side: "a" | "b"; players: Player[]; selection: Record<string, SelectedPlayer>; onRemove: (id: string) => void; onCaptain: (id: string) => void }) { return <section className={`rounded-2xl border p-4 ${side === "a" ? "border-emerald-200 bg-emerald-50/40" : "border-amber-200 bg-amber-50/40"}`}><div className="flex items-baseline justify-between"><h2 className="font-bold">{title}</h2><span className="text-xs text-[var(--muted)]">{players.length} selected</span></div><div className="mt-3 space-y-2">{players.length ? players.map((player) => <div key={player.id} className="flex items-center justify-between gap-2 rounded-xl bg-white p-3"><div><p className="font-semibold">{player.name}</p>{selection[player.id]?.isCaptain && <p className="text-xs font-bold text-[var(--brand)]">Captain</p>}</div><div className="flex gap-1"><button onClick={() => onCaptain(player.id)} className="rounded-lg px-2 py-1 text-xs font-bold text-[var(--brand)]">{selection[player.id]?.isCaptain ? "Captain ✓" : "Make captain"}</button><button onClick={() => onRemove(player.id)} className="rounded-lg px-2 py-1 text-xs font-bold text-red-600">Remove</button></div></div>) : <p className="rounded-xl border border-dashed border-[var(--line)] bg-white/70 p-4 text-sm text-[var(--muted)]">No players selected yet.</p>}</div></section>; }
