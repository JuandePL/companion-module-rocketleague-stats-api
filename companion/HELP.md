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

| Field   | Description                                                        |
| ------- | ------------------------------------------------------------------ |
| Host    | Computer running Rocket League. `127.0.0.1` for the same computer. |
| WebPort | `WebPort` from `TAStatsAPI.ini`. Default `49124`.                  |

The module reconnects automatically, so it can be started before the game.

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

### Feedbacks

| Feedback                  | True when                                             |
| ------------------------- | ----------------------------------------------------- |
| Player has the POV        | The camera is on player N of the `players` variable   |
| Director camera is active | The last perspective sent with Change POV is Director |
| Match is paused           | The match is paused                                   |
| Time remaining below      | The clock is below N seconds, outside overtime        |
| Match is in overtime      | The match is in overtime                              |
| Replay is active          | A goal replay or history replay is playing            |
| A team has won            | A team has won the match                              |

The Stats API does not report the current camera mode, so **Director camera is active** follows the commands sent by this module. Focusing a player switches it off.

### Presets

- **Scoreboard**: score of each team on top of its primary color, with the match clock at the top. Text colors adapt to stay readable.
- **Match clock**: red border below 30 seconds, orange border and a leading `+` in overtime.
- **Player 1–6 POV**: name and boost of a player from the `players` variable. Press to change the POV to that player. The background turns red while that player has the POV.
- **Director POV**: switches to the Director camera. The background turns red while it is active.
- **Pause / resume match**: toggles the pause. The background turns orange while paused.

Presets use layered buttons and need Companion 5.0 or later.
