# Changelog

All notable changes to `companion-module-rocketleague-stats-api` are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.0] - 2026-11-22

0.2.0 was never published: coming from 0.1.0, this release also has everything listed under 0.2.0.

### Added

- Variables `matchPhase` (`none`, `lobby`, `playing`, `paused`, `replay` or `ended`), `seriesMatchesDecided` and `seriesCurrentMatch` ([#5]).
- **Broadcast suite mode** ([#5]). It needs an up-to-date suite server: an older one refuses the commands it doesn't know, and the module logs it.
  - **Stats on the match HUD:** show one team's, one player's or two players' (1 vs 1) stats. With the variables `suiteStatsMode`, `suiteStatsTeam` and `suiteStatsPlayers`, and the feedbacks for the kind of stats and the team on screen.
  - **Set a team by hand** (name, abbreviation, logo URL; an empty name clears it) and **default team colors** (color preset).
  - `suiteLeftShort` / `suiteRightShort` use the abbreviation set in the suite for a side that shows the game's name.
  - **Presets:** swap teams (fix), swap colors, left / right team stats, player stats and 1 vs 1 stats.

### Changed

- Requires `@juande_pl/rocketleague-stats-api-client` 1.5.0 ([#5]).
- **Automatic start:** after a series ends, the next one starts (0-0) when its first match starts, instead of when it ends. In Broadcast suite mode the suite server decides it ([#5]).
- The **Series score** preset takes the game number from `seriesCurrentMatch`: the next game between matches, the one just over on its end screen. Buttons already made from the preset keep their old expression: drag it again ([#5]).
- **Broadcast suite mode** ([#5]):
  - **Swap teams or colors:** _Teams_ (default) fixes teams placed the wrong way round, and the matches played move to the other team, so each side keeps its score. _Teams from now on_ is for teams that really switch sides: each keeps its wins. _Colors only_ swaps the HUD colors.
  - Left is always blue (`TeamNum 0`) and right orange: `suiteLeftSide` is always `blue`.
  - **Set team names:** _Swap_ makes the teams change sides with their wins, and _Set_ puts teams typed by hand on those sides.
  - "Show team stats" is now "show both teams' stats" (same action id), and `suiteStatsCurrent` also shows the team or players on screen.

### Fixed

- **Broadcast suite mode counted every match twice** in the `series…` variables and the feedbacks that read them ([#5]).
- A result corrected by hand (-1 / +1) no longer ends a best of 3 at 1-1: wins by hand are counted net ([#5]).
- A match joined on its end screen or in its lobby (Companion restarted, reconnection) is no longer taken for a match being played, and a match whose start or end was missed no longer mixes with the one before ([#5]).
- The **Series score** preset showed the wrong game number with wins by hand, and `GAME 0` before the first match ([#5]).
- The **stat on screen** feedback lit up an unrelated stat outside the both-teams mode, and `suiteStatsPlayers` kept players that weren't on screen ([#5]).

## [0.2.0] - 2026-11-20

Never published as a release: its changes ship in 0.3.0.

### Added

- Live match stats from `MatchTracker` ([#2]):
  - `matchStarted`, `matchAborted` and `matchSecondsPlayed` (play time, without kickoffs, goal replays or pauses).
  - Per team: shots, shooting %, possession % and boost per minute.
  - Team and player results with rates (shooting %, goal participation, boost per minute, seconds played…) in `matchTeamResults` / `matchPlayerResults`.
  - `lastMatch` and `lastAbortedMatch`: the summary of the last finished match and of the last match left before its end.
- Esports series from `EsportsSeries` ([#2]):
  - **Config:** games, format (best of / play all), automatic start, timeouts per team and their length.
  - **Variables:** status, matches played and aborted, winner, MVP. Per side: name, wins, manual wins, win %, shooting %, boost per minute, timeouts used and left. Also `seriesTeams`, `seriesPlayers` and `seriesTimeouts`.
  - **Actions:** start / restart / stop / remove last match, pause / resume, change wins by hand (add, remove, set), call and end a timeout.
  - **Feedbacks:** match being played, match left before its end, series status, timeout running, team can call a timeout, team has timeouts left.
  - **Presets:** possession, shooting, series score, Blue / Orange timeout, timeout clock, series start / restart / stop / remove last match, pause series, Blue / Orange +1 and −1 win, swap team names.
- **Timeouts** between matches, with a clock that updates every second (`timeoutRemaining`, `timeoutElapsed`) ([#2]).
- **Two presses to confirm** Start, Restart, Stop and Remove last match, so the series isn't cleared or stopped by accident. While a control waits, the button shows `PRESS AGAIN`, and `seriesControlArmed` and the **Series control waits for confirmation** feedback are set ([#2]).
- **Team names per side**, in the config or with **Series: set team names** (set, swap, clear), instead of the names set in the game. Each finished match keeps the names it was played with ([#2]).
- **The series survives a Companion restart:** it is saved in the connection config after every change and brought back on start. Turn it off with **Keep the series when Companion restarts** ([#2]).
- **Broadcast suite mode** ([#3]): connects to a broadcast suite server instead of the game, so Companion, the suite's control panel and its HUD show the same series.
  - **Config:** **Connect to** (Rocket League or suite server), suite host and port.
  - **Through the server:** game events and commands go through its Stats API relay, so every variable, action, feedback and preset keeps working. The **Series** actions are sent to the server.
  - **Suite actions:** swap colors or teams, stats on the HUD, break timer, HUD elements and sponsors. They come with their own variables, feedbacks and presets.

### Changed

- Requires `@juande_pl/rocketleague-stats-api-client` 1.4.0. It is pre-approved in `.yarnrc.yml`, so its new releases install without waiting for the minimal age gate ([#2]).
- Changing the games, format or timeouts in the config keeps the recorded matches: the series ends, or goes on again, with the new options ([#2]).
- Saving the config only reconnects when the connection settings change (host, port, `.ini` setting, connection mode, suite host or port) ([#2], [#3]).

## [0.1.0] - 2026-11-12

First release ([#1]).

### Added

- One action per Stats API command: Change POV, Load replay, Seek replay, Set game speed, Set HUD visibility and Pause / resume match.
- Variables from every `UpdateState` event: `state`, `players` (sorted by team and shortcut), `teams`, `isReplay`, `hasWinner`, `timeSeconds`, `time`, `isOvertime`, plus `isPaused`, `perspective` and `connected`.
- Feedbacks: player has the POV, Director camera is active, match is paused, time remaining below, overtime, replay active and a team has won.
- Layered presets: scoreboard, match clock, player 1–6 POV with boost, Director POV and pause / resume.
- Optional automatic `PacketSendRate` setup in `TAStatsAPI.ini` when Rocket League runs on the same computer.
- Automatic reconnection, so the module can be started before the game.

[Unreleased]: https://github.com/JuandePL/companion-module-rocketleague-stats-api/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/JuandePL/companion-module-rocketleague-stats-api/compare/v0.1.0...v0.3.0
[0.2.0]: https://github.com/JuandePL/companion-module-rocketleague-stats-api/compare/v0.1.0...98f0abc139c6db380d37cb2aadbd81e4bac960de
[0.1.0]: https://github.com/JuandePL/companion-module-rocketleague-stats-api/releases/tag/v0.1.0
[#1]: https://github.com/JuandePL/companion-module-rocketleague-stats-api/pull/1
[#2]: https://github.com/JuandePL/companion-module-rocketleague-stats-api/pull/2
[#3]: https://github.com/JuandePL/companion-module-rocketleague-stats-api/pull/3
[#5]: https://github.com/JuandePL/companion-module-rocketleague-stats-api/pull/5
