import test from "node:test";
import assert from "node:assert/strict";
import { buildChain, ChainVerifier, dieFace, newSeed } from "../js/fair.js";

test("chain values verify against the anchor; forged or swapped values do not", async () => {
  const chain = await buildChain(newSeed(), 64);
  const other = await buildChain(newSeed(), 64);
  const v = new ChainVerifier();
  v.setAnchor(0, chain[0]);
  assert.equal(await v.verify(0, 5, chain[5]), true);
  assert.equal(await v.verify(0, 3, chain[3]), true, "earlier index is already known");
  assert.equal(await v.verify(0, 40, chain[40]), true);
  assert.equal(await v.verify(0, 41, other[41]), false, "value from another chain");
  assert.equal(await v.verify(0, 42, chain[43]), false, "value at the wrong index");
  assert.equal(await v.verify(0, 64, chain[64]), true);
});

test("die faces are uniform (chi-square, 60,000 rolls)", async () => {
  const counts = [0, 0, 0, 0, 0, 0];
  const N = 60000;
  for (let k = 1; k <= N; k++) {
    const d = await dieFace("482913", k, { 0: "a".repeat(64), 1: "b".repeat(63) + (k % 10) });
    counts[d - 1]++;
  }
  const exp = N / 6;
  const chi = counts.reduce((a, c) => a + (c - exp) ** 2 / exp, 0);
  // 5 degrees of freedom: p = 0.001 at 20.5
  assert.ok(chi < 20.5, `chi-square ${chi.toFixed(2)} counts ${counts}`);
});

test("the die depends on every included value and on seat order", async () => {
  const a = "1".repeat(64), b = "2".repeat(64);
  const faces = new Set();
  for (let k = 1; k < 40; k++) faces.add(await dieFace("1", k, { 0: a, 1: b }));
  assert.equal(faces.size, 6);
  let differ = 0;
  for (let k = 1; k < 40; k++) if ((await dieFace("1", k, { 0: a, 1: b })) !== (await dieFace("1", k, { 0: b, 1: a }))) differ++;
  assert.ok(differ > 0);
});
