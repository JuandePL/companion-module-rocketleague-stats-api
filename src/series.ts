import type { JsonValue } from '@companion-module/base'
import {
	teamName,
	type AbortedMatchSummary,
	type AnyEventListener,
	type EsportsSeries,
	type GameTeam,
	type MatchSummary,
	type SeriesFormat,
	type SeriesOptions,
	type SeriesResult,
	type SeriesTeamResult,
	type SeriesTimeout,
	type StatsApiEvent,
	type StatsEventSource,
	type TeamNum,
	type Unsubscribe,
} from '@juande_pl/rocketleague-stats-api-client'
import type { ModuleConfig } from './config.js'
import { formatClock } from './state.js'

/**
 * Event source that outlives the WebSocket client: the series listens to it once, and every client
 * forwards its events to it. This way the series and its stats survive reconnections and host changes.
 */
export class EventRelay implements StatsEventSource {
	readonly #listeners = new Set<AnyEventListener>()

	onAny(listener: AnyEventListener): Unsubscribe {
		this.#listeners.add(listener)
		return () => {
			this.#listeners.delete(listener)
		}
	}

	emit(event: StatsApiEvent): void {
		for (const listener of [...this.#listeners]) listener(event)
	}
}

/** Controls of the series: start a new one, start it again, or stop recording. */
export type SeriesControlMode = 'start' | 'restart' | 'stop'
export const SERIES_CONTROL_LABEL: Record<SeriesControlMode, string> = {
	start: 'Start',
	restart: 'Restart',
	stop: 'Stop',
}

export const DEFAULT_SERIES_GAMES = 5
export const DEFAULT_SERIES_FORMAT: SeriesFormat = 'best-of'

/** Series options from the module config, with defaults for configs saved before these fields existed. */
export function seriesOptionsFromConfig(config: ModuleConfig): Required<SeriesOptions> {
	const int = (value: unknown, fallback: number, min: number): number => {
		const number = Math.round(Number(value))
		return Number.isFinite(number) && number >= min ? number : fallback
	}
	return {
		games: int(config.seriesGames, DEFAULT_SERIES_GAMES, 1),
		format: config.seriesFormat === 'play-all' ? 'play-all' : DEFAULT_SERIES_FORMAT,
		timeouts: int(config.seriesTimeouts, 0, 0),
		timeoutSeconds: int(config.seriesTimeoutSeconds, 0, 0),
	}
}

export function seriesAutoStartFromConfig(config: ModuleConfig): boolean {
	return config.seriesAutoStart !== false
}

/** Converts a value to plain JSON (dates become ISO strings, `undefined` fields are dropped). */
export function toJson<T>(value: T): JsonValue {
	return value === undefined ? null : (JSON.parse(JSON.stringify(value)) as JsonValue)
}

/** Rounds to one decimal, for rates and percentages shown on buttons. */
export function round1(value: number): number {
	return Math.round(value * 10) / 10
}

/** A finished or aborted match without its timeline (every event of the match), which is too big for a variable. */
export function matchSummaryJson(summary: MatchSummary | AbortedMatchSummary | undefined): JsonValue {
	if (!summary) return null
	const { timeline: _timeline, ...rest } = summary
	return toJson(rest)
}

export type Side = 'blue' | 'orange'
export const SIDES: readonly Side[] = ['blue', 'orange']
export const SIDE_TEAM_NUM: Record<Side, TeamNum> = { blue: 0, orange: 1 }
export const SIDE_LABEL: Record<Side, string> = { blue: 'Blue', orange: 'Orange' }

/**
 * Name of the team playing on `side`: from the current match, or from the last finished match of the
 * series when there is no match yet.
 */
export function sideTeamName(series: EsportsSeries, side: Side): string {
	const teams: readonly GameTeam[] = series.tracker.getTeams()
	if (teams.length > 0) return teamName(teams, SIDE_TEAM_NUM[side])
	return series.teamOf(SIDE_TEAM_NUM[side])
}

/** Seconds left in a timeout with a time limit, `undefined` without one. */
export function timeoutRemainingSeconds(timeout: SeriesTimeout | undefined, now = Date.now()): number | undefined {
	if (!timeout?.endsAt) return undefined
	return Math.max(0, Math.ceil((timeout.endsAt.getTime() - now) / 1000))
}

export function timeoutElapsedSeconds(timeout: SeriesTimeout | undefined, now = Date.now()): number {
	if (!timeout) return 0
	return Math.max(0, Math.floor((now - timeout.startedAt.getTime()) / 1000))
}

/** Variables of the running timeout. They change every second while it lasts. */
export function timeoutVariables(series: EsportsSeries): {
	timeoutActive: boolean
	timeoutTeam: string
	timeoutRemainingSeconds: number
	timeoutRemaining: string
	timeoutElapsedSeconds: number
	timeoutElapsed: string
} {
	const timeout = series.activeTimeout
	const remaining = timeoutRemainingSeconds(timeout)
	const elapsed = timeoutElapsedSeconds(timeout)
	return {
		timeoutActive: timeout !== undefined,
		timeoutTeam: timeout?.team ?? '',
		timeoutRemainingSeconds: remaining ?? 0,
		timeoutRemaining: remaining === undefined ? '' : formatClock(remaining),
		timeoutElapsedSeconds: elapsed,
		timeoutElapsed: timeout ? formatClock(elapsed) : '',
	}
}

/** Live stats of the match being played, from the series tracker. */
export function matchStatsVariables(series: EsportsSeries): {
	matchStarted: boolean
	matchAborted: boolean
	matchSecondsPlayed: number
	matchTeamResults: JsonValue
	matchPlayerResults: JsonValue
	blueShots: number
	orangeShots: number
	blueShootingPercent: number
	orangeShootingPercent: number
	bluePossessionPercent: number
	orangePossessionPercent: number
	blueBoostPerMinute: number
	orangeBoostPerMinute: number
} {
	const { tracker } = series
	const teams = tracker.getTeamResults()
	const team = (side: Side) => teams.find((result) => result.TeamNum === SIDE_TEAM_NUM[side])
	return {
		matchStarted: tracker.matchStarted,
		matchAborted: tracker.matchAborted,
		matchSecondsPlayed: Math.floor(tracker.getStats().secondsPlayed),
		matchTeamResults: toJson(teams),
		matchPlayerResults: toJson(tracker.getPlayerResults()),
		blueShots: team('blue')?.shots ?? 0,
		orangeShots: team('orange')?.shots ?? 0,
		blueShootingPercent: round1(team('blue')?.shootingPercent ?? 0),
		orangeShootingPercent: round1(team('orange')?.shootingPercent ?? 0),
		bluePossessionPercent: round1(team('blue')?.possessionPercent ?? 0),
		orangePossessionPercent: round1(team('orange')?.possessionPercent ?? 0),
		blueBoostPerMinute: round1(team('blue')?.boostPerMinute ?? 0),
		orangeBoostPerMinute: round1(team('orange')?.boostPerMinute ?? 0),
	}
}

type SideSeriesVariables = {
	[
		K in `series${Capitalize<Side>}${'Name' | 'Wins' | 'WinPercent' | 'ShootingPercent' | 'BoostPerMinute' | 'TimeoutsUsed' | 'TimeoutsLeft'}`
	]: K extends `${string}Name` ? string : number
}

/** Results of the series, live (the match being played included, without its win). */
export function seriesVariables(series: EsportsSeries): {
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
} & SideSeriesVariables {
	const result: SeriesResult = series.getLiveResult()
	const side = (which: Side) => {
		const name = sideTeamName(series, which)
		const team: SeriesTeamResult | undefined = result.teams.find((entry) => entry.name === name)
		return {
			name,
			wins: team?.wins ?? 0,
			winPercent: round1(team?.winPercent ?? 0),
			shootingPercent: round1(team?.shootingPercent ?? 0),
			boostPerMinute: round1(team?.boostPerMinute ?? 0),
			timeoutsUsed: team?.timeoutsUsed ?? 0,
			// A team that didn't play yet still has every timeout.
			timeoutsLeft: team?.timeoutsLeft ?? result.options.timeouts,
		}
	}
	const blue = side('blue')
	const orange = side('orange')
	return {
		seriesStatus: result.status,
		seriesGames: result.options.games,
		seriesFormat: result.options.format,
		seriesMatchesPlayed: result.matches.length,
		seriesAbortedMatches: result.abortedMatches.length,
		seriesWinner: result.winner ?? '',
		seriesMvp: result.mvp?.Name ?? '',
		seriesTeams: toJson(result.teams),
		seriesPlayers: toJson(result.players),
		seriesTimeouts: toJson(result.timeouts),
		timeoutsPerTeam: result.options.timeouts,
		seriesBlueName: blue.name,
		seriesOrangeName: orange.name,
		seriesBlueWins: blue.wins,
		seriesOrangeWins: orange.wins,
		seriesBlueWinPercent: blue.winPercent,
		seriesOrangeWinPercent: orange.winPercent,
		seriesBlueShootingPercent: blue.shootingPercent,
		seriesOrangeShootingPercent: orange.shootingPercent,
		seriesBlueBoostPerMinute: blue.boostPerMinute,
		seriesOrangeBoostPerMinute: orange.boostPerMinute,
		seriesBlueTimeoutsUsed: blue.timeoutsUsed,
		seriesOrangeTimeoutsUsed: orange.timeoutsUsed,
		seriesBlueTimeoutsLeft: blue.timeoutsLeft,
		seriesOrangeTimeoutsLeft: orange.timeoutsLeft,
	}
}

/** Readable text for why a timeout was refused. */
export const TIMEOUT_REFUSAL_TEXT: Record<string, string> = {
	disabled: 'timeouts are off (set "Timeouts per team" in the connection config)',
	'not-running': 'the series is not running',
	'no-match-played': 'no match of the series has finished yet',
	'match-in-progress': 'a match is being played',
	'unknown-team': "the team didn't play in this series",
	'no-timeouts-left': 'the team has no timeouts left',
	'timeout-active': 'another timeout is running',
}
