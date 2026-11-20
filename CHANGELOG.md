# Changelog

All notable changes to `companion-module-rocketleague-stats-api` are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-11-20

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

[Unreleased]: https://github.com/JuandePL/companion-module-rocketleague-stats-api/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/JuandePL/companion-module-rocketleague-stats-api/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/JuandePL/companion-module-rocketleague-stats-api/releases/tag/v0.1.0
[#1]: https://github.com/JuandePL/companion-module-rocketleague-stats-api/pull/1
[#2]: https://github.com/JuandePL/companion-module-rocketleague-stats-api/pull/2
[#3]: https://github.com/JuandePL/companion-module-rocketleague-stats-api/pull/3
