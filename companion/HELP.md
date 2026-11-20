## Rocket League Stats API

Control the Rocket League spectator camera and replays, and show live match data on your buttons, through the official [Rocket League Stats API](https://www.rocketleague.com/developer/stats-api). Made for esports productions.

This project is not affiliated with Psyonix or Epic Games.

### Enable the Stats API

Edit `<Install Dir>\TAGame\Config\TAStatsAPI.ini` (or `DefaultStatsAPI.ini`) **before launching the game**:

```ini
[TAGame.MatchStatsExporter_TA]
PacketSendRate=30
WebPort=49124
```

`PacketSendRate` is the number of `UpdateState` packets per second (1–120). `0` disables them.

When Rocket League runs on the same computer as Companion, the module can check this file for you (**Enable PacketSendRate in TAStatsAPI.ini automatically**). If `PacketSendRate` is missing, `0` or above `120`, it is set to `30` and the connection shows a warning: **restart Rocket League**, as the game only reads this file at launch.

### Configuration

| Field                      | Description                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| Host                       | Computer running Rocket League. `127.0.0.1` for the same computer.                          |
| WebPort                    | `WebPort` from `TAStatsAPI.ini`. Default `49124`.                                           |
| Games in the series        | Matches in the series. Default `5`.                                                         |
| Format                     | **Best of** (ends when a team wins more than half) or **Play all games**.                   |
| Start series automatically | Records without pressing Start, and starts a new series after each one ends. On by default. |
| Timeouts per team          | Timeouts each team can call between matches. `0` (default) turns them off.                  |
| Timeout length (seconds)   | `0` (default): the timeout lasts until **End timeout** is pressed or the next match starts. |

The module reconnects automatically, so it can be started before the game. The series is kept when the connection drops. Changing a series option starts a new series.

### Broadcast suite mode

Set **Connect to** to **Broadcast suite server** to use the module with a broadcast suite server (its control panel and HUD) instead of the game:

- The suite server connects to Rocket League and owns the series. Its options (games, format, timeouts) are set in the suite's control panel, and every change made here (restart, stop, timeouts, manual wins…) is the same in the panel and on the HUD, and the other way around.
- Game events and commands go through the server (`ws://<host>:<port>/stats-api`), so every variable, action, feedback and preset of the direct mode keeps working.
- Default port: `49300`.
- Extra **Suite** actions: add / remove / set series wins, take back the last match, pause the series (matches played meanwhile don't count), swap colors or teams, show stats on the HUD (one or several that alternate, of the match or the series), hide / next stat, break timer (start, pause, reset, set, add time), show / hide HUD elements and next sponsor.
- Extra **Suite** variables (`suiteLeftName`, `suiteLeftWins`, `suiteTimer`, `suiteStatsCurrent`…) and feedbacks (connected, element visible, stat on screen, timer running, series paused). **Left / Right** are the teams as placed in the suite's panel.

### Esports series

Every match played is recorded as part of a series, with results per team, per player and per match:

- Only matches that end count. A match left before its end (the lobby is destroyed without the match ending) is kept apart: it doesn't count for the wins, the totals or the end of the series.
- **Timeouts**: with **Timeouts per team** above `0`, each team can call timeouts between the end of a match and the start of the next one. A timeout ends with **End timeout**, when its time runs out, or when the next match starts.
- **Blue / Orange** in actions, feedbacks and variables mean the team playing on that side in the current match, or in the last finished one when there is no match. Teams are identified by name in the series, so they can switch sides between matches.

### Actions

One action per Stats API command. Most of them only work while spectating a match or watching a replay.

| Action               | Command            | Options                                                |
| -------------------- | ------------------ | ------------------------------------------------------ |
| Change POV           | `ChangePOV`        | Focus (`Ball` or a player shortcut) and/or Perspective |
| Load replay          | `LoadReplay`       | File name or full path                                 |
| Seek replay          | `SeekReplay`       | Time in seconds or frame                               |
| Set game speed       | `SetGameSpeed`     | Speed (1 = normal, 0.5 = half, 2 = double)             |
| Set HUD visibility   | `SetHUDVisibility` | Show / Hide / Toggle                                   |
| Pause / resume match | `SetMatchPaused`   | Pause / Resume / Toggle                                |

Series actions (handled by the module, nothing is sent to the game):

| Action                         | Options                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------- |
| Series: start / restart / stop | Start (config options) / Restart (same options) / Stop. Start and Restart clear the matches |
| Series: call timeout           | Team: Blue, Orange or by name                                                               |
| Series: end timeout            | Ends the running timeout early                                                              |

A refused timeout (no timeouts left, a match being played, another timeout running…) is written to the log with the reason.

**Start**, **Restart** and **Stop** ask for confirmation by default (**Press twice to confirm**): the first press arms the action, and only a second press of the same action within **Seconds to confirm** (3 by default) runs it. Pressing another one arms that one instead. While it waits, the `seriesControlArmed` variable holds `start`, `restart` or `stop`, and the **Series control waits for confirmation** feedback is true.

### Variables

`state` is updated on every `UpdateState` event and the other match variables come from it:

| Variable      | Description                                                           |
| ------------- | --------------------------------------------------------------------- |
| `state`       | Raw data of the last `UpdateState` event (JSON object)                |
| `players`     | `state.Players`, sorted by `TeamNum` and then `Shortcut` (JSON array) |
| `teams`       | `state.Game.Teams` (JSON array)                                       |
| `isReplay`    | `state.Game.bReplay`                                                  |
| `hasWinner`   | `state.Game.bHasWinner`                                               |
| `timeSeconds` | `state.Game.TimeSeconds`                                              |
| `time`        | `state.Game.TimeSeconds` as `m:ss`                                    |
| `isOvertime`  | `state.Game.bOvertime`                                                |
| `isPaused`    | The match is paused                                                   |
| `perspective` | Last perspective sent with Change POV                                 |
| `connected`   | Connected to Rocket League                                            |

Match variables are cleared when the match is destroyed or the connection drops.

JSON variables can be read with expressions, for example (replace `rl` with your connection label):

- `$(rl:players)[0].Name`: name of the first player
- `$(rl:teams)[1].Score`: score of team 1 (Orange)
- `$(rl:state).Game.Arena`: current map

#### Live match stats

Only live play counts: kickoff countdowns, goal replays and pauses are left out. Percentages are 0–100, rounded to one decimal.

| Variable                                            | Description                                                                                                                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `matchStarted`                                      | The match is being played (from its start, not in the lobby, until it ends or is left)                                                                                         |
| `matchAborted`                                      | The last match was left before its end                                                                                                                                         |
| `matchSecondsPlayed`                                | Seconds of play                                                                                                                                                                |
| `blueShots` / `orangeShots`                         | Shots of each team                                                                                                                                                             |
| `blueShootingPercent` / `orangeShootingPercent`     | Goals over shots                                                                                                                                                               |
| `bluePossessionPercent` / `orangePossessionPercent` | Ball possession                                                                                                                                                                |
| `blueBoostPerMinute` / `orangeBoostPerMinute`       | Boost used per minute (needs spectator mode)                                                                                                                                   |
| `matchTeamResults`                                  | Each team: `goals`, `shots`, `shootingPercent`, `boostUsed`, `boostPerMinute`, `possessionPercent` (JSON)                                                                      |
| `matchPlayerResults`                                | Each player, sorted by score: scoreboard plus `shootingPercent`, `goalParticipation`, `boostPerMinute`, `secondsPlayed`, `airTime`, `averageSpeed`, `leftEarly`, `mvp`… (JSON) |
| `lastMatch`                                         | Summary of the last finished match: teams, winner, MVP, `teamResults`, `playerResults`, goals (JSON)                                                                           |
| `lastAbortedMatch`                                  | Same, for the last match left before its end, without a winner (JSON)                                                                                                          |

#### Series

Series totals update live: they include the match being played, without its win until it ends.

| Variable                                                    | Description                                                                                                                                                    |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `seriesStatus`                                              | `idle`, `running`, `finished` or `stopped`                                                                                                                     |
| `seriesGames` / `seriesFormat`                              | Options of the series                                                                                                                                          |
| `seriesMatchesPlayed`                                       | Finished matches                                                                                                                                               |
| `seriesAbortedMatches`                                      | Matches left before their end (they don't count)                                                                                                               |
| `seriesWinner` / `seriesMvp`                                | Winner (once over) and MVP                                                                                                                                     |
| `seriesBlueName` / `seriesOrangeName`                       | Team on each side                                                                                                                                              |
| `seriesBlueWins` / `seriesOrangeWins`                       | Wins                                                                                                                                                           |
| `seriesBlueWinPercent` / `seriesOrangeWinPercent`           | Wins over finished matches                                                                                                                                     |
| `seriesBlueShootingPercent` / `seriesOrangeShootingPercent` | Goals over shots in the series                                                                                                                                 |
| `seriesBlueBoostPerMinute` / `seriesOrangeBoostPerMinute`   | Boost used per minute of play                                                                                                                                  |
| `seriesBlueTimeoutsUsed` / `seriesOrangeTimeoutsUsed`       | Timeouts called                                                                                                                                                |
| `seriesBlueTimeoutsLeft` / `seriesOrangeTimeoutsLeft`       | Timeouts left                                                                                                                                                  |
| `seriesTeams`                                               | Each team: `matches`, `wins`, `winPercent`, `goals`, `shots`, `shootingPercent`, `possessionPercent`, `boostPerMinute`, `timeoutsUsed`, `timeoutsLeft`… (JSON) |
| `seriesPlayers`                                             | Each player: `wins`, `winPercent`, `mvps`, `shootingPercent`, `goalParticipation`, `boostPerMinute`, `secondsPlayed`… (JSON)                                   |
| `seriesTimeouts`                                            | Every timeout called in the series (JSON)                                                                                                                      |

#### Timeouts

| Variable                  | Description                                      |
| ------------------------- | ------------------------------------------------ |
| `timeoutsPerTeam`         | Timeouts each team can call in the series        |
| `timeoutActive`           | A timeout is running                             |
| `timeoutTeam`             | Team that called it                              |
| `timeoutRemainingSeconds` | Seconds left (`0` without a time limit)          |
| `timeoutRemaining`        | Time left as `m:ss` (empty without a time limit) |
| `timeoutElapsedSeconds`   | Seconds since it was called                      |
| `timeoutElapsed`          | Time since it was called as `m:ss`               |

Examples:

- `$(rl:seriesPlayers)[0].goalParticipation`: goal participation of the series' top scorer
- `$(rl:matchPlayerResults)[0].shootingPercent`: shooting % of the match's top scorer

### Feedbacks

| Feedback                              | True when                                                                                      |
| ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Player has the POV                    | The camera is on player N of the `players` variable                                            |
| Director camera is active             | The last perspective sent with Change POV is Director                                          |
| Match is paused                       | The match is paused                                                                            |
| Time remaining below                  | The clock is below N seconds, outside overtime                                                 |
| Match is in overtime                  | The match is in overtime                                                                       |
| Replay is active                      | A goal replay or history replay is playing                                                     |
| A team has won                        | A team has won the match                                                                       |
| Match is being played                 | The match started (not in the lobby) and hasn't ended                                          |
| Match was left before its end         | The lobby was destroyed without the match ending, until the next match starts                  |
| Series status                         | The series is running, finished, stopped or not started                                        |
| Series control waits for confirmation | After the first press of a Start / Restart / Stop that needs two presses (any, or one of them) |
| Timeout is running                    | A timeout is running (any team, Blue or Orange)                                                |
| Team can call a timeout               | The team (Blue or Orange) can call a timeout right now                                         |
| Team has timeouts left                | The team (Blue or Orange) still has timeouts in the series                                     |

The Stats API does not report the current camera mode, so **Director camera is active** follows the commands sent by this module. Focusing a player switches it off.

### Presets

- **Scoreboard**: score of each team on top of its primary color, with the match clock at the top. Text colors adapt to stay readable.
- **Match clock**: red border below 30 seconds, orange border and a leading `+` in overtime.
- **Player 1–6 POV**: name and boost of a player from the `players` variable. Press to change the POV to that player. The background turns red while that player has the POV.
- **Director POV**: switches to the Director camera. The background turns red while it is active.
- **Pause / resume match**: toggles the pause. The background turns orange while paused.
- **Possession** / **Shooting**: possession % and shooting % of each team in the match, on top of its color.
- **Series score**: series wins of each team on top of its color, with `GAME n/m` (or `FINAL`) at the top.
- **Blue timeout** / **Orange timeout**: calls a timeout for that team and shows its timeouts left. Green while it can call one, orange while its timeout runs.
- **Timeout clock / end timeout**: team on timeout and the time left (or elapsed, without a time limit). Press to end it.
- **Start / Restart / Stop series**: green while the series runs (red for Stop while it's stopped). They need two presses: after the first one the button turns orange and shows `PRESS AGAIN` for 3 seconds.

- **Broadcast suite**: series wins of each team (+1 / −1), pause series, swap colors, stats on the HUD (toggle, next, and one button per stat, red while on screen), break timer (start / pause, 5 minutes, +1 minute), scorebug and casters on / off. They need the Broadcast suite mode.

Presets use layered buttons and need Companion 5.0 or later.
