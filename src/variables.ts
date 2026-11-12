import type { JsonObject, JsonValue } from '@companion-module/base'
import type { Player, UpdateStateData } from 'rocketleague-stats-api-client'
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
