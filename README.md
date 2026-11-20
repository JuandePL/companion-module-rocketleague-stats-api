# companion-module-rocketleague-stats-api

[Bitfocus Companion](https://bitfocus.io/companion) module for the [Rocket League Stats API](https://www.rocketleague.com/developer/stats-api), made for Rocket League esports productions. It uses [@juande_pl/rocketleague-stats-api-client](https://github.com/JuandePL/rocketleague-stats-api-client) to talk to the game.

- One action per Stats API command (`ChangePOV`, `LoadReplay`, `SeekReplay`, `SetGameSpeed`, `SetHUDVisibility`, `SetMatchPaused`)
- Variables from every `UpdateState` event: `state`, `players` (sorted by team and shortcut), `teams`, `isReplay`, `hasWinner` and more
- Live match stats: possession, shots, shooting %, boost per minute and per-player rates (goal participation, seconds played…), plus matches left before their end
- Esports series (best of / play all) with live team and player results, timeouts between matches, pause, manual wins, custom team names, and a saved series that survives a Companion restart
- Presets for the scoreboard, the match clock, player POV with boost, Director POV, pause, team stats, series score, timeouts and series control

See [HELP.md](./companion/HELP.md) for the user documentation and [LICENSE](./LICENSE).

This project is not affiliated with Psyonix or Epic Games.

## Getting started

Executing a `yarn` command should perform all necessary steps to develop the module, if it does not then follow the steps below.

The module can be built once with `yarn build`. This should be enough to get the module to be loadable by companion.

While developing the module, by using `yarn dev` the compiler will be run in watch mode to recompile the files on change.
