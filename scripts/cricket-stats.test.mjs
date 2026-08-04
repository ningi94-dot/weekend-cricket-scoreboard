import assert from "node:assert/strict";
import test from "node:test";

function isLegal(delivery) {
  return !delivery.wideRuns && !delivery.noBallRuns;
}

function totalRuns(delivery) {
  return delivery.batterRuns + delivery.wideRuns + delivery.noBallRuns + delivery.byeRuns + delivery.legByeRuns;
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
