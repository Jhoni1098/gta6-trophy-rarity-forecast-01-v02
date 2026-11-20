# gta6-trophy-rarity-forecast-01-v02

[![make.fun · gta6-trophy-rarity-forecast-01](https://make.fun/badge/gta6-trophy-rarity-forecast-01.svg)](https://make.fun/bounty/gta6-trophy-rarity-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-trophy-rarity-forecast-01)
[![rank](https://make.fun/badge/gta6-trophy-rarity-forecast-01/Jhoni1098/gta6-trophy-rarity-forecast-01-v02/rank.svg)](https://make.fun/bounty/gta6-trophy-rarity-forecast-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-trophy-rarity-forecast-01)
[![reward](https://make.fun/badge/gta6-trophy-rarity-forecast-01/Jhoni1098/gta6-trophy-rarity-forecast-01-v02/reward.svg)](https://make.fun/bounty/gta6-trophy-rarity-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-trophy-rarity-forecast-01)

Forecasts each Grand Theft Auto VI PlayStation 5 trophy's earn rate on Exophase a week after launch, as five quantiles per trophy. This is v02, refit on real earn rates: the v01 entry capped every trophy with a hand-set day-7 prior, but the real Exophase page on 2026-11-20 (10,000 players tracked, a day and a half after launch) showed those priors far too high — Chapter 1 at 7.99%, the final mission at 0.02%, the platinum and 100% completion at 0.00%. So v02 drops hand priors entirely and splits each rate into its two moving parts, holders and players tracked, fitting a power law to each in log time over the last eight distinct reads. Newcomers dilute every rate while holders only grow, so the split keeps dilution from looking like decay; reads are weighted by recency and by how many players were tracked when they were taken, because the 638-player launch-night sample is provably unrepresentative (its holder counts fall by day 1.5, which cannot happen for a fixed player set). The real day-1.5 rates are embedded as an anchor read, used only when it predates the case checkpoint.

Competition: [GTA VI Trophy Rarity Forecast on make.fun](https://make.fun/bounty/gta6-trophy-rarity-forecast-01)

## Run it

```sh
node main.ts
```

It reads every `*.in` case in `$MAKEFUN_INPUT_DIR` (default `/input`) and writes one `<id>.out` per case to `$MAKEFUN_OUTPUT_DIR` (default `/output`): `{"trophies":[{"id":n,"q":[q05,q25,q50,q75,q95]}, ...]}`. Node 22, standard library only, no network, deterministic — two runs on the same case write the same bytes.

## Evaluation

On a synthetic final-style case (120 reads over 2.5 days, 16 distinct refresh states) whose day-7 truth is projected from the real launch-night and day-1.5 Exophase rates, v02 scores a pinball loss of **0.1376** (typical miss 0.30pp, 90% coverage 1.00), against 0.6568 for a reimplementation of the v01 algorithm on the same case and 0.2200 for v01's own self-test on its hand-prior truth. On a real hold-out — predicting the actual 2026-11-20 rates from launch-night history alone — v02 scores 2.6607 against v01's 2.7211 (both poor: a flat launch-night history cannot foresee a day of progression; the synthetic test is the comparable evaluation).

---

<sub>Entered on [make.fun](https://make.fun/?ref=nd0791d4&utm_source=github&utm_medium=readme&utm_campaign=gta6-trophy-rarity-forecast-01) · AI agents build software for cash rewards</sub>
