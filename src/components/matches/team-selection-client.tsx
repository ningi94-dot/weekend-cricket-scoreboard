"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type Player = { id: string; name: string; battingStyle: string; bowlingStyle: string };
type SelectedPlayer = { teamSide: "a" | "b"; isCaptain: boolean; sortOrder: number };
type Fixture = { id: string; teamA: string; teamB: string; date: string; location: string; overs: number; status: string; jokerEnabled: boolean; jokerPlayerId: string | null };

export function TeamSelectionClient({ matchId }: { matchId: string }) {
  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selection, setSelection] = useState<Record<string, SelectedPlayer>>({});
  const [jokerIncluded, setJokerIncluded] = useState(false);
  const [jokerPlayerId, setJokerPlayerId] = useState("");
  const [isCaptain, setIsCaptain] = useState(false);
  const [password, setPassword] = useState("");
  const [isChecking, setIsChecking] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");

  const playersById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);
  const teamA = useMemo(() => selectedPlayersForSide(selection, playersById, "a"), [playersById, selection]);
  const teamB = useMemo(() => selectedPlayersForSide(selection, playersById, "b"), [playersById, selection]);
  const joker = players.find((player) => player.id === jokerPlayerId) ?? null;

  useEffect(() => {
    void checkCaptain();
    void load();
  }, [matchId]);

  async function checkCaptain() {
    try {
      const response = await fetch("/api/captain/me", { credentials: "include" });
      const data = await response.json();
      setIsCaptain(Boolean(data.isCaptain));
    } catch {
      setIsCaptain(false);
    } finally {
      setIsChecking(false);
    }
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/api/captain/login", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(data?.message ?? "Incorrect captain password.");
      return;
    }
    setPassword("");
    setIsCaptain(true);
  }

  async function load() {
    try {
      const supabase = getSupabaseBrowserClient();
      const [{ data: match, error: matchError }, { data: playerRows, error: playerError }, { data: squadRows, error: squadError }] = await Promise.all([
        supabase.from("matches").select("id,team_a_name,team_b_name,match_date,location,overs_per_innings,status,joker_enabled,joker_player_id").eq("id", matchId).single(),
        supabase.from("players").select("id,name,batting_style,bowling_style").eq("is_active", true).order("name"),
        supabase.from("match_squads").select("player_id,team_side,is_captain,sort_order").eq("match_id", matchId).order("team_side").order("sort_order"),
      ]);
      if (matchError) throw matchError;
      if (playerError) throw playerError;
      if (squadError) throw squadError;
      setFixture({ id: match.id, teamA: match.team_a_name, teamB: match.team_b_name, date: match.match_date, location: match.location, overs: match.overs_per_innings, status: match.status, jokerEnabled: match.joker_enabled, jokerPlayerId: match.joker_player_id });
      setPlayers((playerRows ?? []).map((player) => ({ id: player.id, name: player.name, battingStyle: player.batting_style.replaceAll("_", " "), bowlingStyle: player.bowling_style.replaceAll("_", " ") })));
      setSelection(Object.fromEntries((squadRows ?? []).map((row, index) => [row.player_id, { teamSide: row.team_side, isCaptain: row.is_captain, sortOrder: row.sort_order ?? index }])));
      setJokerIncluded(Boolean(match.joker_enabled));
      setJokerPlayerId(match.joker_player_id ?? "");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load team selection.");
    } finally {
      setIsLoading(false);
    }
  }

  function assignPlayer(playerId: string, teamSide: "a" | "b") {
    if (jokerIncluded && playerId === jokerPlayerId) return;
    setSelection((current) => ({ ...current, [playerId]: { teamSide, isCaptain: false, sortOrder: nextSelectionOrder(current) } }));
  }

  function updateJokerIncluded(checked: boolean) {
    setJokerIncluded(checked);
    if (!checked) {
      setJokerPlayerId("");
      return;
    }
    const firstAvailable = players.find((player) => !selection[player.id]) ?? players[0];
    if (firstAvailable) updateJokerPlayer(firstAvailable.id);
  }

  function updateJokerPlayer(playerId: string) {
    setJokerPlayerId(playerId);
    setSelection((current) => {
      const next = { ...current };
      delete next[playerId];
      return next;
    });
  }

  function removePlayer(playerId: string) {
    setSelection((current) => {
      const next = { ...current };
      delete next[playerId];
      return next;
    });
  }

  function toggleCaptain(playerId: string) {
    setSelection((current) => {
      const picked = current[playerId];
      if (!picked) return current;
      const next = { ...current };
      for (const [id, value] of Object.entries(next)) {
        if (value.teamSide === picked.teamSide) next[id] = { ...value, isCaptain: id === playerId ? !value.isCaptain : false };
      }
      return next;
    });
  }

  function switchPlayer(playerId: string) {
    setSelection((current) => {
      const picked = current[playerId];
      if (!picked) return current;
      const nextSide = picked.teamSide === "a" ? "b" : "a";
      const destinationHasCaptain = Object.entries(current).some(([id, value]) => id !== playerId && value.teamSide === nextSide && value.isCaptain);
      return {
        ...current,
        [playerId]: {
          ...picked,
          teamSide: nextSide,
          isCaptain: picked.isCaptain && !destinationHasCaptain,
          sortOrder: nextSelectionOrder(current),
        },
      };
    });
  }

  async function saveTeams() {
    if (!fixture) return;
    setIsSaving(true);
    setMessage("");
    try {
      const sideOrder = { a: 0, b: 0 };
      const rows = Object.entries(selection)
        .sort(([, first], [, second]) => first.sortOrder - second.sortOrder)
        .map(([playerId, entry]) => ({ playerId, teamSide: entry.teamSide, isCaptain: entry.isCaptain, sortOrder: sideOrder[entry.teamSide]++ }));
      const response = await fetch(`/api/matches/${matchId}/teams`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ rows, jokerIncluded, jokerPlayerId: jokerIncluded ? jokerPlayerId : null }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message ? `${data.message} (${response.status})` : `Unable to save the teams. (${response.status})`);
      setMessage("Teams saved for everyone to see.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save the teams.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading || isChecking) return <p className="text-sm text-[var(--muted)]">Loading team selection...</p>;
  if (!fixture) return <EmptyState title="Match not found" description="Return to Matches and select a fixture from the upcoming list." />;
  const isTeamEditingAllowed = fixture.status !== "completed";

  if (!isCaptain) {
    return (
      <section>
        <Link href="/matches" className="text-sm font-bold text-[var(--brand)]">Back to matches</Link>
        <form onSubmit={(event) => void login(event)} className="mt-4 rounded-lg bg-white p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--brand)]">Captain access</p>
          <h1 className="mt-1 text-xl font-bold">Select teams for {fixture.teamA} vs {fixture.teamB}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">Enter the captain password to create or change playing teams.</p>
          {message && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{message}</p>}
          <label className="mt-5 block text-sm font-semibold">Captain password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-lg border border-[var(--line)] px-3 font-normal" /></label>
          <button className="mt-5 min-h-11 w-full rounded-lg bg-[var(--brand)] text-sm font-bold text-white">Unlock team selection</button>
        </form>
      </section>
    );
  }

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <Link href="/matches" className="text-sm font-bold text-[var(--brand)]">Back to matches</Link>
        <button onClick={() => void saveTeams()} disabled={isSaving || !isTeamEditingAllowed} className="min-h-10 rounded-lg bg-[var(--brand)] px-4 text-sm font-bold text-white shadow-sm disabled:opacity-60">{isSaving ? "Saving..." : "Save"}</button>
      </div>
      <div className="mt-4 rounded-lg bg-[var(--brand-dark)] p-5 text-white">
        <p className="text-xs font-bold uppercase tracking-wider text-amber-300">Captain team selection</p>
        <h1 className="mt-1 text-xl font-bold">{fixture.teamA} vs {fixture.teamB}</h1>
        <p className="mt-2 text-sm text-emerald-50">{fixture.location} - {fixture.overs} overs</p>
      </div>
      {!isTeamEditingAllowed && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Teams cannot be changed after the match is completed.</p>}
      {message && <p className={`mt-4 rounded-lg p-3 text-sm ${message.startsWith("Teams saved") ? "bg-emerald-50 text-[var(--brand-dark)]" : "bg-red-50 text-red-700"}`}>{message}</p>}
      <div className="mt-5 grid grid-cols-2 gap-3">
        <TeamPanel title={fixture.teamA} side="a" players={teamA} selection={selection} isLocked={!isTeamEditingAllowed} onRemove={removePlayer} onCaptain={toggleCaptain} onSwitch={switchPlayer} />
        <TeamPanel title={fixture.teamB} side="b" players={teamB} selection={selection} isLocked={!isTeamEditingAllowed} onRemove={removePlayer} onCaptain={toggleCaptain} onSwitch={switchPlayer} />
      </div>
      <section className="mt-6 rounded-lg border border-[var(--line)] bg-white p-4">
        <label className="flex items-start gap-3 text-sm font-semibold">
          <input type="checkbox" checked={jokerIncluded} disabled={!isTeamEditingAllowed} onChange={(event) => updateJokerIncluded(event.target.checked)} className="mt-1" />
          <span><span className="block font-bold">Include Joker</span><span className="text-[var(--muted)]">A joker can bat or bowl for both teams.</span></span>
        </label>
        {jokerIncluded && (
          <div className="mt-4">
            <label className="block text-sm font-semibold">Joker player<select value={jokerPlayerId} disabled={!isTeamEditingAllowed} onChange={(event) => updateJokerPlayer(event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-[var(--line)] bg-white px-3 font-normal disabled:bg-stone-100">{players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>
            {joker && <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-[var(--brand-dark)]">{joker.name} will be available to bat and bowl for both {fixture.teamA} and {fixture.teamB}.</p>}
          </div>
        )}
      </section>
      <section className="mt-6">
        <h2 className="text-lg font-bold">Available players</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">Choose a side for each player. A player can only be selected once, except the Joker who is shared by both sides.</p>
        <div className="mt-3 space-y-2">
          {players.filter((player) => !selection[player.id] && (!jokerIncluded || player.id !== jokerPlayerId)).length ? players.filter((player) => !selection[player.id] && (!jokerIncluded || player.id !== jokerPlayerId)).map((player) => (
            <article key={player.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--line)] bg-white p-3">
              <div className="min-w-0">
                <h3 className="truncate font-semibold">{player.name}</h3>
                <p className="text-xs capitalize text-[var(--muted)]">{player.battingStyle} - {player.bowlingStyle}</p>
              </div>
              <div className="flex gap-2">
                <button disabled={!isTeamEditingAllowed} onClick={() => assignPlayer(player.id, "a")} className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-[var(--brand)] disabled:opacity-50">{fixture.teamA}</button>
                <button disabled={!isTeamEditingAllowed} onClick={() => assignPlayer(player.id, "b")} className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 disabled:opacity-50">{fixture.teamB}</button>
              </div>
            </article>
          )) : <EmptyState title="All players are assigned" description="Remove a player from a team to change the selection." />}
        </div>
      </section>
    </section>
  );
}

function TeamPanel({ title, side, players, selection, isLocked, onRemove, onCaptain, onSwitch }: { title: string; side: "a" | "b"; players: Player[]; selection: Record<string, SelectedPlayer>; isLocked: boolean; onRemove: (id: string) => void; onCaptain: (id: string) => void; onSwitch: (id: string) => void }) {
  const captainId = players.find((player) => selection[player.id]?.isCaptain)?.id ?? null;
  return (
    <section className={`rounded-lg border p-4 ${side === "a" ? "border-emerald-200 bg-emerald-50/40" : "border-amber-200 bg-amber-50/40"}`}>
      <div className="flex items-baseline justify-between"><h2 className="font-bold">{title}</h2><span className="text-xs text-[var(--muted)]">{players.length} selected</span></div>
      <div className="mt-3 space-y-2">
        {players.length ? players.map((player) => {
          const isPlayerCaptain = selection[player.id]?.isCaptain;
          const canShowCaptainAction = !captainId || isPlayerCaptain;
          return (
            <div key={player.id} className="rounded-lg bg-white p-2">
              <p className="truncate text-sm font-semibold">{player.name}</p>
              {isPlayerCaptain && <p className="text-xs font-bold text-[var(--brand)]">Captain</p>}
              <div className="mt-2 flex flex-wrap gap-1">
                {canShowCaptainAction && <button disabled={isLocked} onClick={() => onCaptain(player.id)} className="rounded-lg px-2 py-1 text-[11px] font-bold text-[var(--brand)] disabled:opacity-50">{isPlayerCaptain ? "Remove C" : "Captain"}</button>}
                <button disabled={isLocked} onClick={() => onSwitch(player.id)} className="rounded-lg px-2 py-1 text-[11px] font-bold text-amber-800 disabled:opacity-50">Switch</button>
                <button disabled={isLocked} onClick={() => onRemove(player.id)} className="rounded-lg px-2 py-1 text-[11px] font-bold text-red-600 disabled:opacity-50">Remove</button>
              </div>
            </div>
          );
        }) : <p className="rounded-lg border border-dashed border-[var(--line)] bg-white/70 p-4 text-sm text-[var(--muted)]">No players selected yet.</p>}
      </div>
    </section>
  );
}

function selectedPlayersForSide(selection: Record<string, SelectedPlayer>, playersById: Map<string, Player>, side: "a" | "b") {
  return Object.entries(selection)
    .filter(([, entry]) => entry.teamSide === side)
    .sort(([, first], [, second]) => first.sortOrder - second.sortOrder)
    .map(([playerId]) => playersById.get(playerId))
    .filter((player): player is Player => Boolean(player));
}

function nextSelectionOrder(selection: Record<string, SelectedPlayer>) {
  const orders = Object.values(selection).map((entry) => entry.sortOrder);
  return orders.length ? Math.max(...orders) + 1 : 0;
}
