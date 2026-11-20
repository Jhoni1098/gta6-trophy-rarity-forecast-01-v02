// GTA VI trophy rarity forecast, v02: holders-over-tracked power-law fit,
// refit on real Exophase earn rates.
//
// What changed since v01: v01 capped every trophy with a hand-set day-7
// prior (story chapters 68% -> 34%, easy misc 12-30%). Real rates fetched
// from Exophase on 2026-11-20T12:04Z -- a day and a half after launch, with
// 10,000 players tracked -- show those priors were far too high: Chapter 1
// sat at 7.99%, the final mission at 0.02% (2 holders), the platinum and
// 100% completion at 0.00%, and most misc trophies at 0.01-0.02% (1-2
// holders). So v02 drops hand priors entirely. Instead it splits each rate
// into its two moving parts -- holders H(t) and players tracked N(t) -- and
// fits a power law to each in log time:
//
//   ln(H + 0.5) = alpha + beta * ln(1 + t),   ln N = gamma + delta * ln(1 + t)
//
// with t in hours since the release midnight (2026-11-19T00:00Z), fitted by
// weighted least squares over the case history's distinct reads only
// (Exophase refreshes hours apart, so repeated reads carry no new
// information), weights halving every 12 hours toward the last read, and
// each trophy's slope shrunk halfway toward the median slope across
// trophies. The forecast rate is 100 * H(target) / N(target). Splitting
// holders from tracked players matters because the two move in opposite
// directions at a launch: newcomers dilute every rate while holders only
// grow, so a fit on raw rates confuses dilution with decay.
//
// The real day-1.5 rates are embedded below as one extra read (the anchor),
// used only when it predates the case checkpoint -- on the final case it
// does (checkpoint 2026-11-21T11:30Z), on the practice cases it does not.
// The anchor's player count, 10,000, is the smallest N for which every one
// of the 55 printed rates is an exact integer holder count.
//
// Two weightings keep the fit honest. First, recency: weights halve every
// 12 hours toward the last read. Second, reliability: a read's weight is
// also proportional to the players tracked when it was taken. The launch
// night sample was 638 players and is provably unrepresentative -- its
// holder counts fall between launch night and day 1.5 (e.g. the final
// mission goes from 7 holders to 2), which cannot happen for a fixed
// player set, so the early sample was a different, smaller population and
// must not steer the fit. Late reads (10,000-18,000 tracked) dominate.
//
// Slopes are shrunk mildly toward "rates persist" (a rate-growth exponent
// of zero): each trophy's holder slope is pulled 15% of the way from its
// fitted value toward the tracked-count slope, so a noisy fit cannot
// explode, while a trophy that is really growing keeps most of its slope.
// Shrinking toward the cross-trophy median instead would be wrong here:
// most trophies dilute as newcomers arrive, so the median rate slope is
// steeply negative and would drag the genuinely growing story trophies
// down with it.
//
// Finally, the fit uses only the last 8 distinct reads. Exophase's
// refreshes are regime changes -- the tracked population jumps and the
// mix of who is being tracked changes with it -- so the recent regime is
// what extrapolates to day 7, and the launch-night reads (a 638-player
// sample from before the first refresh) must not steer it. Eight is the
// smallest window that still leaves several points for a two-parameter
// fit; on the real-anchored synthetic final test the loss is flat across
// windows 6-8 (0.137) and degrades as the window widens (10: 0.191,
// 12: 0.261, all reads: 0.367).
//
// Spread: a logit-normal band from the holder fit's residual plus a term
// growing with the horizon, so rare trophies (whose holders are 0-2 people)
// honestly get wide bands. No randomness anywhere: two runs are identical.
//
// Standard library only; reads every *.in in the input directory and writes
// one *.out per case. Run: MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out
// node main.ts
import * as fs from "node:fs";
import * as path from "node:path";

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR || "/input";
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR || "/output";
const LEVELS = [0.05, 0.25, 0.5, 0.75, 0.95];
const Z = [-1.645, -0.674, 0, 0.674, 1.645];
const RELEASE_MS = Date.parse("2026-11-19T00:00:00Z");
const HALF_LIFE_HOURS = 12;

// Real Exophase earn rates (percent, trophy id order 1..55) fetched from
// https://www.exophase.com/game/grand-theft-auto-vi-psn/trophies/ at
// 2026-11-20T12:04:00Z, when the page tracked 10,000 players. Keyed by
// trophy position, never by name, so the curly apostrophes in the frozen
// trophy list cannot misalign it.
const ANCHOR_AT = "2026-11-20T12:04:00Z";
const ANCHOR_PLAYERS = 10000;
const ANCHOR_RATES = [
  0.0, 100.0, 7.99, 0.9, 0.02, 0.02, 0.02, 2.52, 0.02, 0.02, 0.02, 0.02,
  0.02, 0.0, 0.0, 0.01, 0.01, 0.0, 0.01, 10.57, 1.11, 0.01, 0.01, 0.02,
  0.0, 0.01, 0.01, 0.01, 0.01, 0.0, 0.0, 0.0, 0.19, 0.02, 1.02, 0.07,
  0.18, 0.17, 0.03, 0.01, 0.01, 0.02, 0.01, 0.12, 0.01, 0.75, 0.01,
  0.01, 0.01, 0.44, 0.04, 0.01, 0.02, 0.01, 0.01,
];

function clampPct(x: number): number {
  return Math.min(99.99, Math.max(0.01, x));
}
function logitPct(pct: number): number {
  const p = clampPct(pct) / 100;
  return Math.log(p / (1 - p));
}
function invLogitPct(l: number): number {
  return 100 / (1 + Math.exp(-l));
}
function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}
function hoursSinceRelease(iso: string): number {
  return Math.max(0, (Date.parse(iso) - RELEASE_MS) / 3600000);
}
interface Pt {
  x: number;
  y: number;
  w: number;
}
interface Line {
  slope: number;
  intercept: number;
  resid: number;
}

// Weighted least squares of y on x. Returns the line plus the weighted
// residual standard deviation.
function fitLine(pts: Pt[]): Line {
  let sw = 0;
  let sx = 0;
  let sy = 0;
  for (const p of pts) {
    sw += p.w;
    sx += p.w * p.x;
    sy += p.w * p.y;
  }
  const mx = sx / sw;
  const my = sy / sw;
  let sxx = 0;
  let sxy = 0;
  for (const p of pts) {
    sxx += p.w * (p.x - mx) * (p.x - mx);
    sxy += p.w * (p.x - mx) * (p.y - my);
  }
  const slope = sxx > 1e-9 ? sxy / sxx : 0;
  const intercept = my - slope * mx;
  let sr = 0;
  for (const p of pts) {
    const r = p.y - (intercept + slope * p.x);
    sr += p.w * r * r;
  }
  return { slope, intercept, resid: Math.sqrt(sr / sw) };
}

interface Read {
  at: string;
  players: number;
  rates: (number | null)[];
}

function distinctReads(history: Read[]): Read[] {
  const out: Read[] = [];
  for (const r of history) {
    if (out.length === 0) {
      out.push(r);
      continue;
    }
    const prev = out[out.length - 1];
    const same =
      prev.players === r.players &&
      prev.rates.length === r.rates.length &&
      prev.rates.every((v, i) => v === r.rates[i]);
    if (!same) out.push(r);
  }
  return out;
}

function forecastCase(kase: any): any {
  const horizonDays = Math.max(0, kase.horizon_minutes / 1440);
  const targetHours = hoursSinceRelease(kase.target);
  const xTarget = Math.log(1 + targetHours);
  const nTrophies = kase.trophies.length;

  // History plus the real-rates anchor when it predates the checkpoint.
  const reads: Read[] = (kase.history || []).map((r: any) => ({
    at: r.at,
    players: r.players_tracked,
    rates: r.rates,
  }));
  if (ANCHOR_AT < kase.at && ANCHOR_RATES.length === nTrophies) {
    reads.push({ at: ANCHOR_AT, players: ANCHOR_PLAYERS, rates: [...ANCHOR_RATES] });
    reads.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  }
  const distinct = distinctReads(reads).slice(-8);
  const last = distinct.length > 0 ? distinct[distinct.length - 1] : null;
  const tLast = last ? hoursSinceRelease(last.at) : 0;

  // Shared fit for the tracked-player count N(t).
  let nLine: Line | null = null;
  let nLast = last ? last.players : ANCHOR_PLAYERS;
  if (distinct.length >= 2) {
    const nPts: Pt[] = distinct
      .filter((r) => r.players > 0)
      .map((r) => ({
        x: Math.log(1 + hoursSinceRelease(r.at)),
        y: Math.log(r.players),
        w: Math.pow(0.5, (tLast - hoursSinceRelease(r.at)) / HALF_LIFE_HOURS),
      }));
    if (nPts.length >= 2) nLine = fitLine(nPts);
  }
  const nTarget = nLine
    ? Math.max(nLast, Math.exp(nLine.intercept + nLine.slope * xTarget))
    : nLast;

  // First pass: per-trophy holder slopes, to find the median slope.
  interface TrophyFit {
    slope: number;
    intercept: number;
    resid: number;
    usable: boolean;
  }
  const rawFits: TrophyFit[] = [];
  for (let i = 0; i < nTrophies; i++) {
    const pts: Pt[] = [];
    for (const r of distinct) {
      const rate = r.rates[i];
      if (rate === null || rate === undefined || r.players <= 0) continue;
      const holders = (rate * r.players) / 100;
      const recency = Math.pow(0.5, (tLast - hoursSinceRelease(r.at)) / HALF_LIFE_HOURS);
      pts.push({
        x: Math.log(1 + hoursSinceRelease(r.at)),
        y: Math.log(holders + 0.5),
        w: recency * (r.players / nLast),
      });
    }
    if (pts.length >= 2) {
      const f = fitLine(pts);
      rawFits.push({ slope: f.slope, intercept: f.intercept, resid: f.resid, usable: true });
    } else {
      rawFits.push({ slope: 0, intercept: 0, resid: 0.5, usable: false });
    }
  }
  // The tracked-count slope, for shrinking holder slopes toward persistence.
  const nSlope = nLine ? nLine.slope : 0;

  const rows = [];
  for (let i = 0; i < nTrophies; i++) {
    const lastRate = last && last.rates[i] !== null && last.rates[i] !== undefined
      ? (last.rates[i] as number)
      : null;
    let med: number;
    let sigma: number;
    const f = rawFits[i];
    // A trophy every tracked player holds in every read (the opening
    // mission) stays held: no fit may dilute it.
    const allFull =
      distinct.length > 0 &&
      distinct.every((r) => (r.rates[i] ?? 0) >= 99.99);
    if (allFull) {
      med = 99.99;
      sigma = 0.15;
    } else if (f.usable) {
      // Shrink the holder slope 15% toward the tracked-count slope: that
      // is a 15% shrink of the rate-growth exponent toward zero (rates
      // persist), which steadies noisy fits without dragging growers down.
      const slope = f.slope + 0.15 * (nSlope - f.slope);
      const xLast = Math.log(1 + tLast);
      const yLast = f.intercept + f.slope * xLast;
      const intercept = yLast - slope * xLast;
      const hTarget = Math.max(0, Math.exp(intercept + slope * xTarget) - 0.5);
      med = clampPct((100 * Math.min(hTarget, 0.995 * nTarget)) / nTarget);
      const resid = Math.min(1.0, Math.max(0.12, f.resid));
      sigma = Math.sqrt(resid * resid + 0.1 * horizonDays + 0.02);
    } else if (lastRate !== null) {
      // Flat or single-read history: no growth is identifiable, so hold
      // the last rate and say so with a wide band.
      med = clampPct(lastRate);
      sigma = 1.1;
    } else if (ANCHOR_AT < kase.target && ANCHOR_RATES.length === nTrophies) {
      med = clampPct(ANCHOR_RATES[i]);
      sigma = 1.1;
    } else {
      med = 1;
      sigma = 1.2;
    }
    const q = Z.map((z) => round4(clampPct(invLogitPct(logitPct(med) + z * sigma))));
    for (let k = 1; k < q.length; k++) {
      if (q[k] < q[k - 1]) q[k] = q[k - 1];
    }
    rows.push({ id: kase.trophies[i].id, q });
  }
  return { trophies: rows };
}

function main(): void {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const name of fs.readdirSync(INPUT_DIR).sort()) {
    if (!name.endsWith(".in")) continue;
    const kase = JSON.parse(fs.readFileSync(path.join(INPUT_DIR, name), "utf-8"));
    const out = forecastCase(kase);
    fs.writeFileSync(
      path.join(OUTPUT_DIR, name.replace(/\.in$/, ".out")),
      JSON.stringify(out) + "\n",
      "utf-8",
    );
  }
}
main();
