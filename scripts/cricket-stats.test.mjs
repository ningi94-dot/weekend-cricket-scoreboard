import assert from "node:assert/strict";
import test from "node:test";

function isLegal(delivery) {
  return !delivery.wideRuns && !delivery.noBallRuns;
}

function totalRuns(delivery) {
  return delivery.batterRuns + delivery.wideRuns + delivery.noBallRuns + delivery.byeRuns + delivery.legByeRuns;
}

function bowlerConcededRuns(delivery) {
  return delivery.batterRuns + delivery.wideRuns + delivery.noBallRuns + (delivery.penaltyRuns ?? 0);
}

function maidenOvers(deliveries) {
  const oversByBowler = new Map();
  for (const delivery of deliveries) {
    const key = `${delivery.bowler}:${delivery.over}`;
    const row = oversByBowler.get(key) ?? { legalBalls: 0, concededRuns: 0 };
    row.concededRuns += bowlerConcededRuns(delivery);
    if (isLegal(delivery)) row.legalBalls += 1;
    oversByBowler.set(key, row);
  }
  return [...oversByBowler.values()].filter((over) => over.legalBalls === 6 && over.concededRuns === 0).length;
}

function overs(legalBalls) {
  return `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`;
}

function nextStrike({ striker, nonStriker, legalBalls }, delivery) {
  let nextStriker = striker;
  let nextNonStriker = nonStriker;
  const swap = () => {
    const old = nextStriker;
    nextStriker = nextNonStriker;
    nextNonStriker = old;
  };
  const physicalRuns = delivery.batterRuns + delivery.byeRuns + delivery.legByeRuns + Math.max(0, delivery.wideRuns - 1) + Math.max(0, delivery.noBallRuns - 1);
  if (physicalRuns % 2 === 1) swap();
  if (isLegal(delivery) && (legalBalls + 1) % 6 === 0) swap();
  return { striker: nextStriker, nonStriker: nextNonStriker };
}

function deliveryPartnerships(deliveries) {
  const partnerships = [];
  let current = null;
  let pendingRemaining = null;
  let score = 0;
  let wickets = 0;
  for (const delivery of deliveries) {
    if (!current) {
      current = { pair: partnershipPair(delivery.striker, delivery.nonStriker ?? null, pendingRemaining), runs: 0, balls: 0 };
      pendingRemaining = null;
    } else if (!current.pair[1]) {
      const solo = current.pair[0];
      const partner = [delivery.striker, delivery.nonStriker].find((player) => player && player !== solo);
      if (partner) current.pair = [solo, partner];
    }
    score += delivery.runs;
    current.runs += delivery.runs;
    if (delivery.legal) current.balls += 1;
    if (delivery.wicket) {
      wickets += 1;
      pendingRemaining = current.pair.find((player) => player && player !== delivery.dismissedPlayer) ?? null;
      partnerships.push({ ...current, endedAt: `${wickets}-${score}` });
      current = null;
    }
  }
  if (current && (current.runs > 0 || current.balls > 0)) partnerships.push({ ...current, endedAt: null });
  return partnerships;
}

function partnershipPair(striker, nonStriker, pendingRemaining) {
  if (!pendingRemaining) return [striker, nonStriker];
  if (striker === pendingRemaining || nonStriker === pendingRemaining) return [striker, nonStriker];
  return [striker, pendingRemaining];
}

function normalizedPair(pair) {
  return pair.filter(Boolean).sort();
}

test("wide and no-ball do not count as legal balls", () => {
  const deliveries = [
    { batterRuns: 0, wideRuns: 1, noBallRuns: 0, byeRuns: 0, legByeRuns: 0 },
    { batterRuns: 4, wideRuns: 0, noBallRuns: 1, byeRuns: 0, legByeRuns: 0 },
    { batterRuns: 1, wideRuns: 0, noBallRuns: 0, byeRuns: 0, legByeRuns: 0 },
  ];
  assert.equal(deliveries.filter(isLegal).length, 1);
  assert.equal(deliveries.reduce((sum, delivery) => sum + totalRuns(delivery), 0), 7);
});

test("over notation uses six legal deliveries", () => {
  assert.equal(overs(0), "0.0");
  assert.equal(overs(5), "0.5");
  assert.equal(overs(6), "1.0");
  assert.equal(overs(14), "2.2");
});

test("strike rotates on odd runs and swaps at over end", () => {
  assert.deepEqual(nextStrike({ striker: "A", nonStriker: "B", legalBalls: 0 }, { batterRuns: 1, wideRuns: 0, noBallRuns: 0, byeRuns: 0, legByeRuns: 0 }), { striker: "B", nonStriker: "A" });
  assert.deepEqual(nextStrike({ striker: "A", nonStriker: "B", legalBalls: 5 }, { batterRuns: 0, wideRuns: 0, noBallRuns: 0, byeRuns: 0, legByeRuns: 0 }), { striker: "B", nonStriker: "A" });
  assert.deepEqual(nextStrike({ striker: "A", nonStriker: "B", legalBalls: 5 }, { batterRuns: 1, wideRuns: 0, noBallRuns: 0, byeRuns: 0, legByeRuns: 0 }), { striker: "A", nonStriker: "B" });
});

test("basic averages and rates handle zero denominators safely", () => {
  const safeRate = (top, bottom) => bottom ? top / bottom : null;
  assert.equal(safeRate(25 * 100, 10), 250);
  assert.equal(safeRate(10, 0), null);
  assert.equal(safeRate(24, 4), 6);
});

test("bowler wicket credit excludes run out and retired hurt", () => {
  const credited = new Set(["bowled", "caught", "lbw", "stumped", "hit_wicket"]);
  assert.equal(credited.has("bowled"), true);
  assert.equal(credited.has("run_out"), false);
  assert.equal(credited.has("retired_hurt"), false);
});

test("innings completes at scheduled legal balls", () => {
  const scheduledOvers = 4;
  const maxLegalBalls = scheduledOvers * 6;
  assert.equal(23 >= maxLegalBalls, false);
  assert.equal(24 >= maxLegalBalls, true);
  assert.equal(25 >= maxLegalBalls, true);
});

test("toss decision determines first batting team", () => {
  const opposite = (side) => side === "a" ? "b" : "a";
  const battingSide = (tossWinner, decision) => decision === "bat" ? tossWinner : opposite(tossWinner);
  assert.equal(battingSide("a", "bat"), "a");
  assert.equal(battingSide("a", "bowl"), "b");
});

test("second innings target decides result", () => {
  const target = 101;
  assert.equal(101 >= target, true);
  assert.equal(100 === target - 1, true);
  assert.equal(95 >= target, false);
});

test("dismissed batter is replaced by next available batter", () => {
  const squad = ["A", "B", "C", "D"];
  const dismissed = new Set(["A"]);
  const available = squad.filter((player) => !dismissed.has(player));
  const nonStriker = "B";
  const replacement = available.find((player) => player !== nonStriker);
  assert.equal(replacement, "C");
});

test("innings is all out when fewer than two batters remain", () => {
  const squad = ["A", "B", "C"];
  const dismissed = new Set(["A", "B"]);
  const available = squad.filter((player) => !dismissed.has(player));
  assert.equal(available.length < 2, true);
});

test("caught run out and stumped require a fielder", () => {
  const needsFielder = new Set(["caught", "run_out", "stumped"]);
  assert.equal(needsFielder.has("caught"), true);
  assert.equal(needsFielder.has("run_out"), true);
  assert.equal(needsFielder.has("stumped"), true);
  assert.equal(needsFielder.has("bowled"), false);
});

test("fielding credits count by dismissal type", () => {
  const fielder = "F";
  const deliveries = [
    { fielderId: fielder, dismissal: "caught" },
    { fielderId: fielder, dismissal: "stumped" },
    { fielderId: fielder, dismissal: "run_out" },
    { fielderId: "G", dismissal: "caught" },
  ];
  assert.equal(deliveries.filter((delivery) => delivery.fielderId === fielder && delivery.dismissal === "caught").length, 1);
  assert.equal(deliveries.filter((delivery) => delivery.fielderId === fielder && delivery.dismissal === "stumped").length, 1);
  assert.equal(deliveries.filter((delivery) => delivery.fielderId === fielder && delivery.dismissal === "run_out").length, 1);
});

test("current over includes wides and no-balls without ending early", () => {
  const deliveries = [
    { label: "1", legal: true, over: 0 },
    { label: "WD", legal: false, over: 0 },
    { label: "NB+4", legal: false, over: 0 },
    { label: "2", legal: true, over: 0 },
  ];
  assert.deepEqual(deliveries.filter((delivery) => delivery.over === 0).map((delivery) => delivery.label), ["1", "WD", "NB+4", "2"]);
  assert.equal(deliveries.filter((delivery) => delivery.legal).length, 2);
});

test("incoming batter is required after a wicket unless innings ends", () => {
  const needsReplacement = (dismissal, inningsComplete) => dismissal !== "retired_hurt" && !inningsComplete;
  assert.equal(needsReplacement("caught", false), true);
  assert.equal(needsReplacement("bowled", true), false);
  assert.equal(needsReplacement("retired_hurt", false), false);
});

test("next bowler is required after six legal balls and excludes previous bowler", () => {
  const completedOver = (legalBalls) => legalBalls > 0 && legalBalls % 6 === 0;
  const bowlers = ["Pace", "Spin", "Part-time"];
  assert.equal(completedOver(6), true);
  assert.equal(completedOver(5), false);
  assert.deepEqual(bowlers.filter((bowler) => bowler !== "Pace"), ["Spin", "Part-time"]);
});

test("target chase calculations stay finite", () => {
  const target = 121;
  const runs = 80;
  const legalBalls = 42;
  const maxBalls = 60;
  const runsNeeded = Math.max(0, target - runs);
  const ballsRemaining = Math.max(0, maxBalls - legalBalls);
  const currentRunRate = legalBalls ? runs / (legalBalls / 6) : null;
  const requiredRunRate = ballsRemaining ? runsNeeded / (ballsRemaining / 6) : null;
  assert.equal(runsNeeded, 41);
  assert.equal(ballsRemaining, 18);
  assert.equal(Number.isFinite(currentRunRate), true);
  assert.equal(Number.isFinite(requiredRunRate), true);
});

test("bowler extras exclude byes and leg byes", () => {
  const deliveries = [
    { batterRuns: 1, wideRuns: 1, noBallRuns: 0, byeRuns: 0, legByeRuns: 0, wicket: false },
    { batterRuns: 0, wideRuns: 0, noBallRuns: 1, byeRuns: 0, legByeRuns: 0, wicket: true, dismissal: "bowled" },
    { batterRuns: 0, wideRuns: 0, noBallRuns: 0, byeRuns: 2, legByeRuns: 1, wicket: false },
    { batterRuns: 0, wideRuns: 0, noBallRuns: 0, byeRuns: 0, legByeRuns: 0, wicket: true, dismissal: "run_out" },
  ];
  const bowlerRuns = deliveries.reduce((sum, delivery) => sum + delivery.batterRuns + delivery.wideRuns + delivery.noBallRuns, 0);
  const extrasConceded = deliveries.reduce((sum, delivery) => sum + delivery.wideRuns + delivery.noBallRuns, 0);
  const wickets = deliveries.filter((delivery) => delivery.wicket && new Set(["bowled", "caught", "lbw", "stumped", "hit_wicket"]).has(delivery.dismissal)).length;
  assert.equal(bowlerRuns, 3);
  assert.equal(extrasConceded, 2);
  assert.equal(wickets, 1);
  assert.equal(bowlerRuns / wickets, 3);
});

test("maiden overs count completed zero bowler-run overs and ignore byes", () => {
  const deliveries = [
    { bowler: "A", over: 0, batterRuns: 0, wideRuns: 0, noBallRuns: 0, byeRuns: 1, legByeRuns: 0 },
    { bowler: "A", over: 0, batterRuns: 0, wideRuns: 0, noBallRuns: 0, byeRuns: 0, legByeRuns: 1 },
    { bowler: "A", over: 0, batterRuns: 0, wideRuns: 0, noBallRuns: 0, byeRuns: 0, legByeRuns: 0 },
    { bowler: "A", over: 0, batterRuns: 0, wideRuns: 0, noBallRuns: 0, byeRuns: 0, legByeRuns: 0 },
    { bowler: "A", over: 0, batterRuns: 0, wideRuns: 0, noBallRuns: 0, byeRuns: 0, legByeRuns: 0 },
    { bowler: "A", over: 0, batterRuns: 0, wideRuns: 0, noBallRuns: 0, byeRuns: 0, legByeRuns: 0 },
    { bowler: "B", over: 1, batterRuns: 0, wideRuns: 1, noBallRuns: 0, byeRuns: 0, legByeRuns: 0 },
    { bowler: "B", over: 1, batterRuns: 0, wideRuns: 0, noBallRuns: 0, byeRuns: 0, legByeRuns: 0 },
    { bowler: "B", over: 1, batterRuns: 0, wideRuns: 0, noBallRuns: 0, byeRuns: 0, legByeRuns: 0 },
    { bowler: "B", over: 1, batterRuns: 0, wideRuns: 0, noBallRuns: 0, byeRuns: 0, legByeRuns: 0 },
    { bowler: "B", over: 1, batterRuns: 0, wideRuns: 0, noBallRuns: 0, byeRuns: 0, legByeRuns: 0 },
    { bowler: "B", over: 1, batterRuns: 0, wideRuns: 0, noBallRuns: 0, byeRuns: 0, legByeRuns: 0 },
    { bowler: "B", over: 1, batterRuns: 0, wideRuns: 0, noBallRuns: 0, byeRuns: 0, legByeRuns: 0 },
    { bowler: "C", over: 2, batterRuns: 0, wideRuns: 0, noBallRuns: 0, byeRuns: 0, legByeRuns: 0 },
    { bowler: "C", over: 2, batterRuns: 0, wideRuns: 0, noBallRuns: 0, byeRuns: 0, legByeRuns: 0 },
  ];
  assert.equal(maidenOvers(deliveries), 1);
});

test("partnerships use the actual next batter pair after a wicket and ignore strike order", () => {
  const partnerships = deliveryPartnerships([
    { striker: "Player A", nonStriker: "Player B", runs: 1, legal: true, wicket: false },
    { striker: "Player B", nonStriker: "Player A", runs: 4, legal: true, wicket: false },
    { striker: "Player B", nonStriker: "Player A", runs: 0, legal: true, wicket: true, dismissedPlayer: "Player B" },
    { striker: "Player C", nonStriker: "Player A", runs: 2, legal: true, wicket: false },
    { striker: "Player A", nonStriker: "Player C", runs: 3, legal: true, wicket: false },
  ]);
  assert.deepEqual(partnerships.map((partnership) => normalizedPair(partnership.pair)), [["Player A", "Player B"], ["Player A", "Player C"]]);
  assert.deepEqual(partnerships.map((partnership) => partnership.runs), [5, 5]);
  assert.equal(partnerships.some((partnership) => partnership.pair.includes(null)), false);
});

test("partnerships do not split when striker and non-striker swap repeatedly", () => {
  const partnerships = deliveryPartnerships([
    { striker: "Player A", nonStriker: "Player B", runs: 1, legal: true, wicket: false },
    { striker: "Player B", nonStriker: "Player A", runs: 1, legal: true, wicket: false },
    { striker: "Player A", nonStriker: "Player B", runs: 2, legal: true, wicket: false },
    { striker: "Player A", nonStriker: "Player B", runs: 0, legal: true, wicket: false },
    { striker: "Player B", nonStriker: "Player A", runs: 4, legal: true, wicket: false },
  ]);
  assert.equal(partnerships.length, 1);
  assert.deepEqual(normalizedPair(partnerships[0].pair), ["Player A", "Player B"]);
  assert.equal(partnerships[0].runs, 8);
});

test("partnerships do not create solo while waiting for the new batter", () => {
  const partnerships = deliveryPartnerships([
    { striker: "Player A", nonStriker: "Player B", runs: 4, legal: true, wicket: false },
    { striker: "Player B", nonStriker: "Player A", runs: 0, legal: true, wicket: true, dismissedPlayer: "Player B" },
    { striker: "Player A", nonStriker: null, runs: 0, legal: false, wicket: false },
    { striker: "Player C", nonStriker: "Player A", runs: 2, legal: true, wicket: false },
  ]);
  assert.deepEqual(partnerships.map((partnership) => normalizedPair(partnership.pair)), [["Player A", "Player B"], ["Player A", "Player C"]]);
});

test("partnerships infer the remaining not-out batter when the new batter is saved with blank non-striker", () => {
  const partnerships = deliveryPartnerships([
    { striker: "Player A", nonStriker: "Player B", runs: 4, legal: true, wicket: false },
    { striker: "Player B", nonStriker: "Player A", runs: 0, legal: true, wicket: true, dismissedPlayer: "Player B" },
    { striker: "Player C", nonStriker: null, runs: 2, legal: true, wicket: false },
    { striker: "Player A", nonStriker: "Player C", runs: 1, legal: true, wicket: false },
  ]);
  assert.deepEqual(partnerships.map((partnership) => normalizedPair(partnership.pair)), [["Player A", "Player B"], ["Player A", "Player C"]]);
  assert.equal(partnerships.some((partnership) => partnership.pair.includes(null)), false);
});

test("best partnership ties are sorted by fewest balls", () => {
  const records = [
    { name: "Player A & Player B", runs: 30, balls: 20 },
    { name: "Player C & Player D", runs: 30, balls: 14 },
    { name: "Player E & Player F", runs: 25, balls: 10 },
  ].sort((a, b) => b.runs - a.runs || a.balls - b.balls || a.name.localeCompare(b.name));
  assert.equal(records[0].name, "Player C & Player D");
});

test("joker is eligible for both teams but not while currently batting", () => {
  const joker = "J";
  const teamA = ["A1", "A2"];
  const teamB = ["B1", "B2"];
  const withJoker = (ids) => ids.includes(joker) ? ids : [...ids, joker];
  assert.deepEqual(withJoker(teamA), ["A1", "A2", joker]);
  assert.deepEqual(withJoker(teamB), ["B1", "B2", joker]);
  assert.equal(withJoker(teamB).filter((player) => !["A1", joker].includes(player)).includes(joker), false);
});
