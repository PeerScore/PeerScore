import { test } from "node:test";
import assert from "node:assert/strict";
import {
  consensus,
  median,
  scoreBand,
  slugify,
  spread,
  weightedScore,
} from "./scoring";

const scores = { rigor: 80, reproducibility: 60, novelty: 70, impact: 90, clarity: 50 };

test("weightedScore applies weights and rounds", () => {
  const weights = { rigor: 0.4, reproducibility: 0.1, novelty: 0.2, impact: 0.2, clarity: 0.1 };
  // 32 + 6 + 14 + 18 + 5 = 75
  assert.equal(weightedScore(scores, weights), 75);
});

test("weightedScore normalises weights that do not sum to 1", () => {
  const weights = { rigor: 4, reproducibility: 1, novelty: 2, impact: 2, clarity: 1 };
  assert.equal(weightedScore(scores, weights), 75);
});

test("weightedScore falls back to the mean when all weights are 0", () => {
  const weights = { rigor: 0, reproducibility: 0, novelty: 0, impact: 0, clarity: 0 };
  assert.equal(weightedScore(scores, weights), 70);
});

test("weightedScore with equal weights equals the mean", () => {
  const weights = { rigor: 1, reproducibility: 1, novelty: 1, impact: 1, clarity: 1 };
  assert.equal(weightedScore(scores, weights), 70);
});

test("weightedScore clamps to 0–100", () => {
  const weights = { rigor: 1, reproducibility: 0, novelty: 0, impact: 0, clarity: 0 };
  assert.equal(weightedScore({ ...scores, rigor: 140 }, weights), 100);
  assert.equal(weightedScore({ ...scores, rigor: -5 }, weights), 0);
});

test("weightedScore rejects negative weights", () => {
  const weights = { rigor: -1, reproducibility: 1, novelty: 1, impact: 1, clarity: 1 };
  assert.throws(() => weightedScore(scores, weights), RangeError);
});

test("consensus is the rounded mean of model scores", () => {
  assert.equal(consensus([80, 85, 81]), 82);
  assert.equal(consensus([50, 51]), 51); // 50.5 rounds up
  assert.equal(consensus([64]), 64);
  assert.equal(consensus([]), null);
});

test("spread is max minus min", () => {
  assert.equal(spread([80, 85, 81]), 5);
  assert.equal(spread([64]), 0);
  assert.equal(spread([]), null);
});

test("scoreBand thresholds", () => {
  assert.equal(scoreBand(100), "high");
  assert.equal(scoreBand(70), "high");
  assert.equal(scoreBand(69), "mid");
  assert.equal(scoreBand(50), "mid");
  assert.equal(scoreBand(49), "low");
  assert.equal(scoreBand(0), "low");
});

test("slugify produces URL-safe lower-case slugs", () => {
  assert.equal(slugify("Leila Haddad"), "leila-haddad");
  assert.equal(slugify("  Émile   Zola-Durand "), "emile-zola-durand");
  assert.equal(slugify("José Ñandú O'Connor"), "jose-nandu-o-connor");
  assert.equal(slugify("Łukasz Søren Straße"), "lukasz-soren-strasse");
  assert.equal(slugify("--A.B.--"), "a-b");
  assert.equal(slugify(""), "");
});

test("median handles odd, even and empty lists", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 3); // 2.5 rounds to 3
  assert.equal(median([]), null);
});
