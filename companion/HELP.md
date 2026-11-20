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

| Field                                   | Description                                                                                         |
| --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Host                                    | Computer running Rocket League. `127.0.0.1` for the same computer.                                  |
| WebPort                                 | `WebPort` from `TAStatsAPI.ini`. Default `49124`.                                                   |
| Games in the series                     | Matches in the series. Default `5`.                                                                 |
| Format                                  | **Best of** (ends when a team wins more than half) or **Play all games**.                           |
| Start series automatically              | Records without pressing Start, and starts a new series after each one ends. On by default.         |
| Timeouts per team                       | Timeouts each team can call between matches. `0` (default) turns them off.                          |
| Timeout length (seconds)                | `0` (default): the timeout lasts until **End timeout** is pressed or the next match starts.         |
| Keep the series when Companion restarts | Saves the recorded matches, manual wins and timeouts, and brings them back on start. On by default. |
| Blue team name / Orange team name       | Name used in the results for the team playing that side. Empty (default): the name set in the game. |

The module reconnects automatically, so it can be started before the game. The series is kept when the connection drops. Changing the games, format or timeouts keeps the recorded matches: the series ends, or goes on again, with the new options (for example a best of 5 turned into a best of 7).

### Esports series

Every match played is recorded as part of a series, with results per team, per player and per match:

- Only matches that end count. A match left before its end (the lobby is destroyed without the match ending) is kept apart: it doesn't count for the wins, the totals or the end of the series.
- **Timeouts**: with **Timeouts per team** above `0`, each team can call timeouts between the end of a match and the start of the next one. A timeout ends with **End timeout**, when its time runs out, or when the next match starts.
- **Blue / Orange** in actions, feedbacks and variables mean the team playing on that side in the current match, or in the last finished one when there is no match. Teams are identified by name in the series, so they can switch sides between matches.
- **Team names**: set your own names for each side (connection config or **Series: set team names**), for example the names of the broadcast when the ones set in the game don't match. Each finished match keeps the names it was played with. When the teams switch sides, use **Swap names**.
- **Pause**: while the series is paused, the matches that end are not recorded and no timeout can be called, for example for a showmatch between two matches.
- **Manual wins**: add, remove or set the wins of a team by hand, to fix the score or count a match played elsewhere. **Remove last match** takes back a recorded match that shouldn't count. The series ends, or goes on again, with these changes.
- **Restart of Companion**: with **Keep the series when Companion restarts**, the series is saved in the connection config after every change and brought back on start. A match being played when Companion stops is not saved.

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

| Action                                             | Options                                                                                                         |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Series: start / restart / stop / remove last match | Start (config options) / Restart (same options) / Stop / Remove last match. Start and Restart clear the matches |
| Series: call timeout                               | Team: Blue, Orange or by name                                                                                   |
| Series: end timeout                                | Ends the running timeout early                                                                                  |
| Series: pause / resume                             | Pause / Resume / Toggle                                                                                         |
| Series: change wins by hand                        | Team (Blue, Orange or by name), Add / Remove / Set, number of wins                                              |
| Series: set team names                             | Set names (Blue and Orange) / Swap names / Clear                                                                |

A refused timeout (no timeouts left, a match being played, another timeout running…) is written to the log with the reason.

**Start**, **Restart**, **Stop** and **Remove last match** ask for confirmation by default (**Press twice to confirm**): the first press arms the action, and only a second press of the same action within **Seconds to confirm** (3 by default) runs it. Pressing another one arms that one instead. While it waits, the `seriesControlArmed` variable holds `start`, `restart`, `stop` or `removeLast`, and the **Series control waits for confirmation** feedback is true.

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
| `seriesStatus`                                              | `idle`, `running`, `paused`, `finished` or `stopped`                                                                                                           |
| `seriesPaused`                                              | The series is paused                                                                                                                                           |
| `seriesGames` / `seriesFormat`                              | Options of the series                                                                                                                                          |
| `seriesMatchesPlayed`                                       | Finished matches                                                                                                                                               |
| `seriesAbortedMatches`                                      | Matches left before their end (they don't count)                                                                                                               |
| `seriesWinner` / `seriesMvp`                                | Winner (once over) and MVP                                                                                                                                     |
| `seriesBlueName` / `seriesOrangeName`                       | Team on each side                                                                                                                                              |
| `seriesBlueWins` / `seriesOrangeWins`                       | Wins                                                                                                                                                           |
| `seriesBlueManualWins` / `seriesOrangeManualWins`           | Wins added or removed by hand (already counted in the wins)                                                                                                    |
| `seriesBlueWinPercent` / `seriesOrangeWinPercent`           | Wins over finished matches                                                                                                                                     |
| `seriesBlueShootingPercent` / `seriesOrangeShootingPercent` | Goals over shots in the series                                                                                                                                 |
| `seriesBlueBoostPerMinute` / `seriesOrangeBoostPerMinute`   | Boost used per minute of play                                                                                                                                  |
| `seriesBlueTimeoutsUsed` / `seriesOrangeTimeoutsUsed`       | Timeouts called                                                                                                                                                |
| `seriesBlueTimeoutsLeft` / `seriesOrangeTimeoutsLeft`       | Timeouts left                                                                                                                                                  |
| `seriesTeams`                                               | Each team: `matches`, `wins`, `winPercent`, `goals`, `shots`, `shootingPercent`, `possessionPercent`, `boostPerMinute`, `timeoutsUsed`, `timeoutsLeft`… (JSON) |
| `seriesPlayers`                                             | Each player: `wins`, `winPercent`, `mvps`, `shootingPercent`, `goalParticipation`, `boostPerMinute`, `secondsPlayed`… (JSON)                                   |
| `seriesTimeouts`                                            | Every timeout called in the series (JSON)                                                                                                                      |
| `teamNameBlue` / `teamNameOrange`                           | Team names set by hand (empty: the game names)                                                                                                                 |

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

| Feedback                              | True when                                                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Player has the POV                    | The camera is on player N of the `players` variable                                                                |
| Director camera is active             | The last perspective sent with Change POV is Director                                                              |
| Match is paused                       | The match is paused                                                                                                |
| Time remaining below                  | The clock is below N seconds, outside overtime                                                                     |
| Match is in overtime                  | The match is in overtime                                                                                           |
| Replay is active                      | A goal replay or history replay is playing                                                                         |
| A team has won                        | A team has won the match                                                                                           |
| Match is being played                 | The match started (not in the lobby) and hasn't ended                                                              |
| Match was left before its end         | The lobby was destroyed without the match ending, until the next match starts                                      |
| Series status                         | The series is running, paused, finished, stopped or not started                                                    |
| Series control waits for confirmation | After the first press of a Start / Restart / Stop / Remove last match that needs two presses (any, or one of them) |
| Timeout is running                    | A timeout is running (any team, Blue or Orange)                                                                    |
| Team can call a timeout               | The team (Blue or Orange) can call a timeout right now                                                             |
| Team has timeouts left                | The team (Blue or Orange) still has timeouts in the series                                                         |

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
- **Start / Restart / Stop series** / **Remove last match**: green while the series runs (red for Stop while it's stopped). They need two presses: after the first one the button turns orange and shows `PRESS AGAIN` for 3 seconds.
- **Pause / resume series**: orange while the series is paused.
- **Blue / Orange +1 win** and **−1 win**: change the series wins of that team by hand, with its name and wins.
- **Swap team names**: swaps the names set by hand for Blue and Orange, when the teams switch sides.

Presets use layered buttons and need Companion 5.0 or later.
