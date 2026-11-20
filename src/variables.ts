import type { JsonObject, JsonValue } from '@companion-module/base'
import type { Player, UpdateStateData } from '@juande_pl/rocketleague-stats-api-client'
import type ModuleInstance from './main.js'
import { formatClock } from './state.js'

export type VariablesSchema = {
	/** Raw `Data` of the last `UpdateState` event. */
	state: JsonObject | null
	/** `state.Players`, sorted by TeamNum and then Shortcut. */
	players: JsonValue[]
	/** `state.Game.Teams`. */
	teams: JsonValue[]
	/** `state.Game.bReplay`. */
	isReplay: boolean
	/** `state.Game.bHasWinner`. */
	hasWinner: boolean
	/** `state.Game.TimeSeconds`. */
	timeSeconds: number
	/** `state.Game.TimeSeconds` formatted as `m:ss`. */
	time: string
	/** `state.Game.bOvertime`. */
	isOvertime: boolean
	/** Whether the match is paused (MatchPaused / MatchUnpaused events and SetMatchPaused commands). */
	isPaused: boolean
	/** Last perspective sent with ChangePOV. The Stats API does not report the current camera mode. */
	perspective: string
	/** Whether the WebSocket is connected. */
	connected: boolean

	// Live stats of the match (MatchTracker)
	/** The match is being played: from `MatchInitialized` (not in the lobby) until it ends or is left. */
	matchStarted: boolean
	/** The last match was left before its end (`MatchDestroyed` without `MatchEnded`). */
	matchAborted: boolean
	/** Seconds of play tracked (kickoffs, goal replays and pauses excluded). */
	matchSecondsPlayed: number
	/** `tracker.getTeamResults()`: goals, shots, shooting %, boost, boost per minute and possession per team. */
	matchTeamResults: JsonValue
	/** `tracker.getPlayerResults()`: scoreboard plus tracked stats and rates of every player seen in the match. */
	matchPlayerResults: JsonValue
	blueShots: number
	orangeShots: number
	blueShootingPercent: number
	orangeShootingPercent: number
	bluePossessionPercent: number
	orangePossessionPercent: number
	blueBoostPerMinute: number
	orangeBoostPerMinute: number
	/** Last finished match (`MatchSummary` without the timeline). */
	lastMatch: JsonValue
	/** Last match left before its end (`AbortedMatchSummary` without the timeline). */
	lastAbortedMatch: JsonValue

	// Series (EsportsSeries)
	seriesStatus: string
	seriesGames: number
	seriesFormat: string
	seriesMatchesPlayed: number
	seriesAbortedMatches: number
	seriesWinner: string
	seriesMvp: string
	seriesTeams: JsonValue
	seriesPlayers: JsonValue
	seriesTimeouts: JsonValue
	timeoutsPerTeam: number
	seriesBlueName: string
	seriesOrangeName: string
	seriesBlueWins: number
	seriesOrangeWins: number
	seriesBlueWinPercent: number
	seriesOrangeWinPercent: number
	seriesBlueShootingPercent: number
	seriesOrangeShootingPercent: number
	seriesBlueBoostPerMinute: number
	seriesOrangeBoostPerMinute: number
	seriesBlueTimeoutsUsed: number
	seriesOrangeTimeoutsUsed: number
	seriesBlueTimeoutsLeft: number
	seriesOrangeTimeoutsLeft: number

	// Timeouts
	timeoutActive: boolean
	timeoutTeam: string
	timeoutRemainingSeconds: number
	timeoutRemaining: string
	timeoutElapsedSeconds: number
	timeoutElapsed: string

	/** Series control waiting for its confirmation press: `start`, `restart`, `stop`, or empty. */
	seriesControlArmed: string
}

export function UpdateVariableDefinitions(self: ModuleInstance): void {
	self.setVariableDefinitions({
		state: { name: 'Last UpdateState data (JSON)' },
		players: { name: 'Players, sorted by TeamNum and Shortcut (JSON array)' },
		teams: { name: 'Teams (JSON array)' },
		isReplay: { name: 'A goal or history replay is active' },
		hasWinner: { name: 'A team has won' },
		timeSeconds: { name: 'Seconds remaining (overtime: seconds elapsed)' },
		time: { name: 'Match clock (m:ss)' },
		isOvertime: { name: 'The match is in overtime' },
		isPaused: { name: 'The match is paused' },
		perspective: { name: 'Last perspective sent with ChangePOV' },
		connected: { name: 'Connected to Rocket League' },

		matchStarted: { name: 'The match is being played (not in the lobby)' },
		matchAborted: { name: 'The last match was left before its end' },
		matchSecondsPlayed: { name: 'Seconds of play in the match (no kickoffs, replays or pauses)' },
		matchTeamResults: { name: 'Live team results of the match (JSON array)' },
		matchPlayerResults: { name: 'Live player results of the match, with rates (JSON array)' },
		blueShots: { name: 'Blue: shots in the match' },
		orangeShots: { name: 'Orange: shots in the match' },
		blueShootingPercent: { name: 'Blue: shooting % in the match' },
		orangeShootingPercent: { name: 'Orange: shooting % in the match' },
		bluePossessionPercent: { name: 'Blue: possession % in the match' },
		orangePossessionPercent: { name: 'Orange: possession % in the match' },
		blueBoostPerMinute: { name: 'Blue: boost used per minute in the match' },
		orangeBoostPerMinute: { name: 'Orange: boost used per minute in the match' },
		lastMatch: { name: 'Last finished match summary (JSON)' },
		lastAbortedMatch: { name: 'Last match left before its end (JSON)' },

		seriesStatus: { name: 'Series status (idle, running, finished, stopped)' },
		seriesGames: { name: 'Games in the series' },
		seriesFormat: { name: 'Series format (best-of, play-all)' },
		seriesMatchesPlayed: { name: 'Finished matches in the series' },
		seriesAbortedMatches: { name: 'Matches of the series left before their end' },
		seriesWinner: { name: 'Series winner (empty while running or on a tie)' },
		seriesMvp: { name: 'Series MVP' },
		seriesTeams: { name: 'Live series team results (JSON array)' },
		seriesPlayers: { name: 'Live series player results (JSON array)' },
		seriesTimeouts: { name: 'Timeouts called in the series (JSON array)' },
		timeoutsPerTeam: { name: 'Timeouts each team can call in the series' },
		seriesBlueName: { name: 'Series: name of the Blue team' },
		seriesOrangeName: { name: 'Series: name of the Orange team' },
		seriesBlueWins: { name: 'Series: Blue team wins' },
		seriesOrangeWins: { name: 'Series: Orange team wins' },
		seriesBlueWinPercent: { name: 'Series: Blue team win %' },
		seriesOrangeWinPercent: { name: 'Series: Orange team win %' },
		seriesBlueShootingPercent: { name: 'Series: Blue team shooting %' },
		seriesOrangeShootingPercent: { name: 'Series: Orange team shooting %' },
		seriesBlueBoostPerMinute: { name: 'Series: Blue team boost per minute' },
		seriesOrangeBoostPerMinute: { name: 'Series: Orange team boost per minute' },
		seriesBlueTimeoutsUsed: { name: 'Series: timeouts used by the Blue team' },
		seriesOrangeTimeoutsUsed: { name: 'Series: timeouts used by the Orange team' },
		seriesBlueTimeoutsLeft: { name: 'Series: timeouts left for the Blue team' },
		seriesOrangeTimeoutsLeft: { name: 'Series: timeouts left for the Orange team' },

		timeoutActive: { name: 'A timeout is running' },
		timeoutTeam: { name: 'Team that called the running timeout' },
		timeoutRemainingSeconds: { name: 'Seconds left in the timeout (0 without a time limit)' },
		timeoutRemaining: { name: 'Time left in the timeout (m:ss, empty without a time limit)' },
		timeoutElapsedSeconds: { name: 'Seconds since the timeout was called' },
		timeoutElapsed: { name: 'Time since the timeout was called (m:ss)' },

		seriesControlArmed: { name: 'Series control waiting for the confirmation press (start, restart, stop or empty)' },
	})
}

/** Values for every variable derived from `UpdateState`, when there is no match. */
export function emptyStateVariables(): Pick<
	VariablesSchema,
	'state' | 'players' | 'teams' | 'isReplay' | 'hasWinner' | 'timeSeconds' | 'time' | 'isOvertime'
> {
	return {
		state: null,
		players: [],
		teams: [],
		isReplay: false,
		hasWinner: false,
		timeSeconds: 0,
		time: formatClock(0),
		isOvertime: false,
	}
}

/** Every variable derived from one `UpdateState` event. `players` is `data.Players` already sorted. */
export function stateVariables(
	data: UpdateStateData,
	players: readonly Player[],
): ReturnType<typeof emptyStateVariables> {
	const { Game } = data
	return {
		state: data as unknown as JsonObject,
		players: players as unknown as JsonValue[],
		teams: Game.Teams as unknown as JsonValue[],
		isReplay: Game.bReplay,
		hasWinner: Game.bHasWinner,
		timeSeconds: Game.TimeSeconds,
		time: formatClock(Game.TimeSeconds),
		isOvertime: Game.bOvertime,
	}
}
