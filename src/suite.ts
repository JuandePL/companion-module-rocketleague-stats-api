import type {
	CompanionActionDefinitions,
	CompanionFeedbackDefinitions,
	CompanionVariableDefinitions,
	DropdownChoice,
	JsonValue,
} from '@companion-module/base'
import type { SeriesSnapshot } from '@juande_pl/rocketleague-stats-api-client'
import type ModuleInstance from './main.js'
import type { ModuleSchema } from './main.js'
import { formatClock } from './state.js'

/**
 * Broadcast suite mode: the module talks to the suite server instead of the game. The server owns the series,
 * the teams, the stats shown on the HUD and the timer, so Companion, the control panel and the HUD always show
 * the same thing. Game events come through the server's Stats API relay (`/stats-api`), so every variable,
 * action and feedback of the direct mode keeps working.
 */

export const DEFAULT_SUITE_PORT = 49300

// ---------------------------------------------------------------------------
// The parts of the suite protocol the module uses (see packages/shared in the suite)
// ---------------------------------------------------------------------------

export type Slot = 0 | 1
export type StatKey =
	| 'goals'
	| 'shots'
	| 'saves'
	| 'assists'
	| 'demos'
	| 'touches'
	| 'score'
	| 'shootingPercent'
	| 'possession'
	| 'boostUsed'
	| 'boostPerMinute'
	| 'airTime'

export const STAT_LABELS: Record<StatKey, string> = {
	goals: 'Goals',
	shots: 'Shots',
	saves: 'Saves',
	assists: 'Assists',
	demos: 'Demos',
	touches: 'Touches',
	score: 'Score',
	shootingPercent: 'Shooting %',
	possession: 'Possession',
	boostUsed: 'Boost used',
	boostPerMinute: 'Boost per minute',
	airTime: 'Air time',
}
const STAT_KEYS = Object.keys(STAT_LABELS) as StatKey[]

interface SuiteTeam {
	id: string
	name: string
	abbreviation?: string
}

interface SuiteTimer {
	label: string
	mode: 'countdown' | 'countup'
	durationMs: number
	running: boolean
	startedAt: number | null
	accumulatedMs: number
	visible: boolean
}

export interface SuiteState {
	config: {
		match: {
			eventName: string
			stage: string
			matchLabel: string
			/** Left = blue (`TeamNum 0`), right = orange (`TeamNum 1`), always. */
			teams: [SuiteSlot, SuiteSlot]
		}
		scorebug: { visible: boolean }
		stats: {
			visible: boolean
			/** `teams`: one stat of both teams at a time. `player`: one player. `versus`: two players. */
			mode?: StatsMode
			players?: [string | null, string | null]
			types: StatKey[]
			index: number
			scope: 'match' | 'series'
			rotate: boolean
			intervalSeconds: number
		}
		casters: { visible: boolean; list: { name: string; nickname?: string }[] }
		timer: SuiteTimer
		sponsors: { visible: boolean }
	}
	teams: SuiteTeam[]
	series: {
		status: string
		games: number
		wins: [number, number]
		winner: Slot | null
		keys: [string, string]
	}
	sides: { blue: Slot; teamKeys: [string, string] }
}

export type StatsMode = 'teams' | 'player' | 'versus'

interface SuiteSlot {
	teamId: string | null
	/** A team typed by hand in the suite, not in its database. */
	manual?: { name: string; abbreviation?: string; logo?: string } | null
}

/** Color presets of the suite (default colors of the sides). */
export const PALETTE_PRESETS: DropdownChoice<string>[] = [
	{ id: 'rl', label: 'Rocket League' },
	{ id: 'esports', label: 'Esports' },
	{ id: 'neon', label: 'Neon' },
	{ id: 'royal', label: 'Royal' },
	{ id: 'dark', label: 'Dark' },
	{ id: 'mono', label: 'Black and white' },
]

export type SuiteCommand = { type: string; [key: string]: unknown }

type ServerMessage =
	| { t: 'welcome'; serverTime: number; state: SuiteState }
	| { t: 'state'; serverTime: number; state: SuiteState }
	| { t: 'series'; serverTime: number; snapshot: SeriesSnapshot }
	| { t: 'ack'; id?: number; ok: boolean; error?: string }
	| { t: 'live' | 'pong'; serverTime: number }

export interface SuiteLinkEvents {
	status: (connected: boolean) => void
	state: (state: SuiteState) => void
	series: (snapshot: SeriesSnapshot) => void
	error: (message: string) => void
}

/** WebSocket connection to the suite server, with reconnection. */
export class SuiteLink {
	state: SuiteState | undefined
	connected = false
	/** `serverClock - Date.now()`, for the timer. */
	clockOffset = 0
	readonly #url: string
	readonly #events: SuiteLinkEvents
	#socket: WebSocket | undefined
	#closed = false
	#retry = 0
	#retryTimer: NodeJS.Timeout | undefined
	#nextId = 1
	readonly #pending = new Map<number, string>()

	constructor(host: string, port: number, events: SuiteLinkEvents) {
		this.#url = `ws://${host}:${port}/ws`
		this.#events = events
		this.#open()
	}

	get url(): string {
		return this.#url
	}

	now(): number {
		return Date.now() + this.clockOffset
	}

	/** Sends a command. Refusals come back through the `error` event. Returns `false` when not connected. */
	send(cmd: SuiteCommand): boolean {
		const socket = this.#socket
		if (!socket || socket.readyState !== WebSocket.OPEN) return false
		const id = this.#nextId++
		this.#pending.set(id, cmd.type)
		socket.send(JSON.stringify({ t: 'cmd', id, cmd }))
		return true
	}

	close(): void {
		this.#closed = true
		clearTimeout(this.#retryTimer)
		this.#socket?.close()
	}

	#open(): void {
		if (this.#closed) return
		let socket: WebSocket
		try {
			socket = new WebSocket(this.#url)
		} catch {
			this.#scheduleRetry()
			return
		}
		this.#socket = socket
		socket.addEventListener('open', () => {
			this.#retry = 0
			socket.send(
				JSON.stringify({ t: 'hello', role: 'companion', name: 'Bitfocus Companion', protocol: 1, series: true }),
			)
		})
		socket.addEventListener('message', (event) => this.#handle(String(event.data)))
		socket.addEventListener('close', () => {
			if (this.#socket !== socket) return
			this.#socket = undefined
			this.#pending.clear()
			this.#setConnected(false)
			this.#scheduleRetry()
		})
		socket.addEventListener('error', () => {
			// `close` follows.
		})
	}

	#scheduleRetry(): void {
		if (this.#closed) return
		const delay = Math.min(5000, 500 * 2 ** this.#retry++)
		this.#retryTimer = setTimeout(() => this.#open(), delay)
	}

	#setConnected(connected: boolean): void {
		if (this.connected === connected) return
		this.connected = connected
		this.#events.status(connected)
	}

	#handle(text: string): void {
		let message: ServerMessage
		try {
			message = JSON.parse(text) as ServerMessage
		} catch {
			return
		}
		if ('serverTime' in message && typeof message.serverTime === 'number')
			this.clockOffset = message.serverTime - Date.now()
		switch (message.t) {
			case 'welcome':
				this.state = message.state
				this.#setConnected(true)
				this.#events.state(message.state)
				break
			case 'state':
				this.state = message.state
				this.#events.state(message.state)
				break
			case 'series':
				this.#events.series(message.snapshot)
				break
			case 'ack': {
				const type = message.id === undefined ? undefined : this.#pending.get(message.id)
				if (message.id !== undefined) this.#pending.delete(message.id)
				if (!message.ok) this.#events.error(`${type ?? 'Command'}: ${message.error ?? 'refused'}`)
				break
			}
		}
	}
}

// ---------------------------------------------------------------------------
// Variables
// ---------------------------------------------------------------------------

export type SuiteVariablesSchema = {
	suiteConnected: boolean
	suiteEventName: string
	suiteStage: string
	suiteMatchLabel: string
	suiteLeftName: string
	suiteRightName: string
	suiteLeftShort: string
	suiteRightShort: string
	suiteLeftWins: number
	suiteRightWins: number
	/** Side the left team plays on: `blue` or `orange`. */
	suiteLeftSide: string
	suiteSeriesStatus: string
	suiteSeriesWinner: string
	suiteStatsVisible: boolean
	suiteStatsCurrent: string
	suiteStatsTypes: string
	suiteStatsScope: string
	/** `teams`, `player` or `versus`. */
	suiteStatsMode: string
	/** Player(s) of the `player` / `versus` stats, comma separated. */
	suiteStatsPlayers: string
	suiteTimer: string
	suiteTimerSeconds: number
	suiteTimerRunning: boolean
	suiteTimerLabel: string
	suiteCasters: string
}

export const SUITE_VARIABLE_DEFINITIONS: CompanionVariableDefinitions<SuiteVariablesSchema> = {
	suiteConnected: { name: 'Suite: connected to the suite server' },
	suiteEventName: { name: 'Suite: event name' },
	suiteStage: { name: 'Suite: stage' },
	suiteMatchLabel: { name: 'Suite: match label' },
	suiteLeftName: { name: 'Suite: left team name' },
	suiteRightName: { name: 'Suite: right team name' },
	suiteLeftShort: { name: 'Suite: left team abbreviation' },
	suiteRightShort: { name: 'Suite: right team abbreviation' },
	suiteLeftWins: { name: 'Suite: left team series wins' },
	suiteRightWins: { name: 'Suite: right team series wins' },
	suiteLeftSide: { name: 'Suite: color of the left team (blue / orange)' },
	suiteSeriesStatus: { name: 'Suite: series status (idle, running, paused, finished, stopped)' },
	suiteSeriesWinner: { name: 'Suite: series winner' },
	suiteStatsVisible: { name: 'Suite: stats shown on the HUD' },
	suiteStatsCurrent: { name: 'Suite: stat on screen' },
	suiteStatsTypes: { name: 'Suite: stats selected (comma separated)' },
	suiteStatsScope: { name: 'Suite: stats of the match or the series' },
	suiteStatsMode: { name: 'Suite: stats mode on the match HUD (teams, player, versus)' },
	suiteStatsPlayers: { name: 'Suite: player(s) of the player / 1 vs 1 stats' },
	suiteTimer: { name: 'Suite: break timer (m:ss)' },
	suiteTimerSeconds: { name: 'Suite: break timer in seconds' },
	suiteTimerRunning: { name: 'Suite: break timer running' },
	suiteTimerLabel: { name: 'Suite: break timer label' },
	suiteCasters: { name: 'Suite: casters (comma separated)' },
}

function timerMs(timer: SuiteTimer, now: number): number {
	const elapsed =
		timer.accumulatedMs + (timer.running && timer.startedAt !== null ? Math.max(0, now - timer.startedAt) : 0)
	return timer.mode === 'countdown' ? Math.max(0, timer.durationMs - elapsed) : elapsed
}

export function timerVariables(
	state: SuiteState | undefined,
	now: number,
): Pick<SuiteVariablesSchema, 'suiteTimer' | 'suiteTimerSeconds' | 'suiteTimerRunning'> {
	if (!state) return { suiteTimer: '', suiteTimerSeconds: 0, suiteTimerRunning: false }
	const timer = state.config.timer
	const ms = timerMs(timer, now)
	const seconds = timer.mode === 'countdown' ? Math.ceil(ms / 1000) : Math.floor(ms / 1000)
	return { suiteTimer: formatClock(seconds), suiteTimerSeconds: seconds, suiteTimerRunning: timer.running }
}

export function suiteVariables(state: SuiteState | undefined, connected: boolean, now: number): SuiteVariablesSchema {
	const team = (slot: Slot) => state?.teams.find((entry) => entry.id === state.config.match.teams[slot].teamId)
	const manual = (slot: Slot) => (team(slot) ? undefined : (state?.config.match.teams[slot].manual ?? undefined))
	const name = (slot: Slot) => team(slot)?.name ?? manual(slot)?.name ?? state?.series.keys[slot] ?? ''
	const short = (slot: Slot) => team(slot)?.abbreviation ?? manual(slot)?.abbreviation ?? name(slot)
	const mode = statsMode(state)
	const stats = state?.config.stats
	const current = stats && stats.types.length ? stats.types[stats.index % stats.types.length] : undefined
	return {
		suiteConnected: connected,
		suiteEventName: state?.config.match.eventName ?? '',
		suiteStage: state?.config.match.stage ?? '',
		suiteMatchLabel: state?.config.match.matchLabel ?? '',
		suiteLeftName: name(0),
		suiteRightName: name(1),
		suiteLeftShort: short(0),
		suiteRightShort: short(1),
		suiteLeftWins: state?.series.wins[0] ?? 0,
		suiteRightWins: state?.series.wins[1] ?? 0,
		// In production and spectator the left team is always blue.
		suiteLeftSide: 'blue',
		suiteSeriesStatus: state?.series.status ?? '',
		suiteSeriesWinner: state && state.series.winner !== null ? name(state.series.winner) : '',
		suiteStatsVisible: stats?.visible ?? false,
		suiteStatsCurrent: stats?.visible
			? mode === 'teams'
				? current
					? STAT_LABELS[current]
					: ''
				: statsPlayers(state)
			: '',
		suiteStatsTypes: stats?.types.map((key) => STAT_LABELS[key]).join(', ') ?? '',
		suiteStatsScope: stats?.scope ?? '',
		suiteStatsMode: mode,
		suiteStatsPlayers: statsPlayers(state),
		suiteTimerLabel: state?.config.timer.label ?? '',
		suiteCasters: state?.config.casters.list.map((caster) => caster.nickname || caster.name).join(', ') ?? '',
		...timerVariables(state, now),
	}
}

function statsMode(state: SuiteState | undefined): StatsMode {
	return state?.config.stats.mode ?? 'teams'
}

function statsPlayers(state: SuiteState | undefined): string {
	const stats = state?.config.stats
	if (!stats || statsMode(state) === 'teams') return ''
	const players = (stats.players ?? []).filter((name): name is string => !!name)
	return statsMode(state) === 'versus' ? players.join(' vs ') : (players[0] ?? '')
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type Toggle = 'on' | 'off' | 'toggle'

export type SuiteActionsSchema = {
	suite_swap: { options: { what: 'sides' | 'teams' | 'teams-from-now' } }
	suite_stats_player: { options: { player: string; scope: 'keep' | 'match' | 'series' } }
	suite_stats_versus: { options: { player1: string; player2: string; scope: 'keep' | 'match' | 'series' } }
	suite_manual_team: { options: { team: 'left' | 'right'; name: string; abbreviation: string; logo: string } }
	suite_palette: { options: { preset: string } }
	suite_stats_show: {
		options: { types: StatKey[]; scope: 'keep' | 'match' | 'series'; rotate: 'keep' | 'on' | 'off'; interval: number }
	}
	suite_stats: { options: { mode: 'show' | 'hide' | 'toggle' | 'next' } }
	suite_timer: { options: { mode: 'start' | 'pause' | 'toggle' | 'reset' } }
	suite_timer_set: { options: { minutes: number; mode: 'countdown' | 'countup'; start: boolean } }
	suite_timer_add: { options: { seconds: number } }
	suite_visibility: { options: { section: 'scorebug' | 'casters' | 'timer' | 'sponsors' | 'stats'; mode: Toggle } }
	suite_sponsors_next: { options: Record<string, never> }
}

const SCOPE_CHOICES: DropdownChoice<'keep' | 'match' | 'series'>[] = [
	{ id: 'keep', label: 'Keep current' },
	{ id: 'match', label: 'Current match' },
	{ id: 'series', label: 'Whole series' },
]

const TOGGLE_CHOICES: DropdownChoice<Toggle>[] = [
	{ id: 'toggle', label: 'Toggle' },
	{ id: 'on', label: 'On' },
	{ id: 'off', label: 'Off' },
]

export function suiteActionDefinitions(self: ModuleInstance): CompanionActionDefinitions<ModuleSchema['actions']> {
	const send = (cmd: SuiteCommand) => self.sendSuiteCommand(cmd)
	const definitions: CompanionActionDefinitions<SuiteActionsSchema> = {
		suite_swap: {
			name: 'Suite: swap teams or colors',
			description:
				'Left is always blue (TeamNum 0) and right orange (TeamNum 1). Swap teams fixes teams placed the wrong way ' +
				'round: the matches already played move to the other team too, so the score of each side stays. Swap teams from ' +
				'now on is for teams that really switch colors: each team keeps its wins. Swap colors only swaps the colors on the HUD.',
			options: [
				{
					id: 'what',
					type: 'dropdown',
					label: 'Swap',
					choices: [
						{ id: 'teams', label: 'Teams (they were the wrong way round: fix the played matches too)' },
						{ id: 'teams-from-now', label: 'Teams from now on (each team keeps its wins)' },
						{ id: 'sides', label: 'Colors only (on the HUD)' },
					],
					default: 'teams',
				},
			],
			callback: (action) => {
				const what = action.options.what
				if (what === 'sides') send({ type: 'match.swapSides' })
				else send({ type: 'match.swapTeams', fixHistory: what === 'teams' })
			},
		},
		suite_stats_player: {
			name: "Suite: show a player's stats on the HUD",
			description:
				'Shows the stats of one player on the match HUD (only there, not on the stats scene). The name is the one in the game.',
			options: [
				{ id: 'player', type: 'textinput', label: 'Player name (as in the game)', default: '', useVariables: true },
				{ id: 'scope', type: 'dropdown', label: 'Data of', choices: SCOPE_CHOICES, default: 'keep' },
			],
			callback: (action) => {
				const player = String(action.options.player ?? '').trim()
				if (!player) {
					self.log('warn', 'Show player stats: type a player name')
					return
				}
				const scope = action.options.scope
				send({ type: 'stats.showPlayer', player, ...(scope !== 'keep' ? { scope } : {}) })
			},
		},
		suite_stats_versus: {
			name: 'Suite: show 1 vs 1 stats on the HUD',
			description: 'Compares two players on the match HUD (only there, not on the stats scene). Names as in the game.',
			options: [
				{ id: 'player1', type: 'textinput', label: 'Player 1 (left)', default: '', useVariables: true },
				{ id: 'player2', type: 'textinput', label: 'Player 2 (right)', default: '', useVariables: true },
				{ id: 'scope', type: 'dropdown', label: 'Data of', choices: SCOPE_CHOICES, default: 'keep' },
			],
			callback: (action) => {
				const first = String(action.options.player1 ?? '').trim()
				const second = String(action.options.player2 ?? '').trim()
				if (!first || !second) {
					self.log('warn', 'Show 1 vs 1 stats: type both player names')
					return
				}
				const scope = action.options.scope
				send({ type: 'stats.showVersus', players: [first, second], ...(scope !== 'keep' ? { scope } : {}) })
			},
		},
		suite_manual_team: {
			name: 'Suite: set a team by hand',
			description:
				'Puts a team that is not in the suite database on one side (empty name: clears it). The suite can save it to its database.',
			options: [
				{
					id: 'team',
					type: 'dropdown',
					label: 'Side',
					choices: [
						{ id: 'left', label: 'Left (blue)' },
						{ id: 'right', label: 'Right (orange)' },
					],
					default: 'left',
				},
				{ id: 'name', type: 'textinput', label: 'Name', default: '', useVariables: true },
				{ id: 'abbreviation', type: 'textinput', label: 'Abbreviation (optional)', default: '', useVariables: true },
				{ id: 'logo', type: 'textinput', label: 'Logo URL (optional)', default: '', useVariables: true },
			],
			callback: (action) => {
				const read = (value: unknown) => (typeof value === 'string' ? value : '').trim()
				const name = read(action.options.name)
				const abbreviation = read(action.options.abbreviation)
				const logo = read(action.options.logo)
				send({
					type: 'match.setManualTeam',
					slot: action.options.team === 'right' ? 1 : 0,
					team: name ? { name, ...(abbreviation ? { abbreviation } : {}), ...(logo ? { logo } : {}) } : null,
				})
			},
		},
		suite_palette: {
			name: 'Suite: default team colors',
			description: 'Color preset for teams without their own colors. Teams on the old default colors follow it.',
			options: [{ id: 'preset', type: 'dropdown', label: 'Preset', choices: PALETTE_PRESETS, default: 'rl' }],
			callback: (action) => {
				send({ type: 'palette.preset', preset: action.options.preset })
			},
		},
		suite_stats_show: {
			name: 'Suite: show team stats on the HUD',
			description:
				"Shows one stat of both teams, or several that alternate, on the match HUD of the suite. These become the HUD's own stats (not linked to the stats scene).",
			options: [
				{
					id: 'types',
					type: 'multidropdown',
					label: 'Stats',
					choices: STAT_KEYS.map((key) => ({ id: key, label: STAT_LABELS[key] })),
					default: ['goals', 'shots', 'saves'],
				},
				{
					id: 'scope',
					type: 'dropdown',
					label: 'Data of',
					choices: [
						{ id: 'keep', label: 'Keep current' },
						{ id: 'match', label: 'Current match' },
						{ id: 'series', label: 'Whole series' },
					],
					default: 'keep',
				},
				{
					id: 'rotate',
					type: 'dropdown',
					label: 'Alternate',
					choices: [
						{ id: 'keep', label: 'Keep current' },
						{ id: 'on', label: 'Yes' },
						{ id: 'off', label: 'No' },
					],
					default: 'keep',
				},
				{ id: 'interval', type: 'number', label: 'Seconds per stat (0 = keep)', default: 0, min: 0, max: 600, step: 1 },
			],
			callback: (action) => {
				const { types, scope, rotate, interval } = action.options
				const list = (Array.isArray(types) ? types : []).filter((key): key is StatKey => STAT_KEYS.includes(key))
				if (list.length === 0) {
					self.log('warn', 'Show stats: choose at least one stat')
					return
				}
				send({
					type: 'stats.show',
					types: list,
					...(scope !== 'keep' ? { scope } : {}),
					...(rotate !== 'keep' ? { rotate: rotate === 'on' } : {}),
					...(Number(interval) > 0 ? { intervalSeconds: Number(interval) } : {}),
				})
			},
		},
		suite_stats: {
			name: 'Suite: hide / toggle / next stat',
			options: [
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Mode',
					choices: [
						{ id: 'toggle', label: 'Toggle (selected stats)' },
						{ id: 'show', label: 'Show (selected stats)' },
						{ id: 'hide', label: 'Hide' },
						{ id: 'next', label: 'Next stat' },
					],
					default: 'toggle',
				},
			],
			callback: (action) => {
				const mode = action.options.mode
				send({
					type:
						mode === 'show'
							? 'stats.show'
							: mode === 'hide'
								? 'stats.hide'
								: mode === 'next'
									? 'stats.next'
									: 'stats.toggle',
				})
			},
		},
		suite_timer: {
			name: 'Suite: break timer start / pause / reset',
			options: [
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Mode',
					choices: [
						{ id: 'toggle', label: 'Start / pause' },
						{ id: 'start', label: 'Start' },
						{ id: 'pause', label: 'Pause' },
						{ id: 'reset', label: 'Reset' },
					],
					default: 'toggle',
				},
			],
			callback: (action) => {
				send({ type: `timer.${action.options.mode}` })
			},
		},
		suite_timer_set: {
			name: 'Suite: set the break timer',
			options: [
				{ id: 'minutes', type: 'number', label: 'Minutes', default: 5, min: 0, max: 600, step: 0.5 },
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Mode',
					choices: [
						{ id: 'countdown', label: 'Countdown' },
						{ id: 'countup', label: 'Stopwatch' },
					],
					default: 'countdown',
				},
				{ id: 'start', type: 'checkbox', label: 'Start it', default: true },
			],
			callback: (action) => {
				const { minutes, mode, start } = action.options
				send({ type: 'timer.set', durationMs: Math.round(Number(minutes) * 60_000), mode })
				if (start) send({ type: 'timer.start' })
			},
		},
		suite_timer_add: {
			name: 'Suite: add or remove time to the break timer',
			options: [
				{
					id: 'seconds',
					type: 'number',
					label: 'Seconds (negative to remove)',
					default: 60,
					min: -3600,
					max: 3600,
					step: 1,
				},
			],
			callback: (action) => {
				send({ type: 'timer.add', ms: Math.round(Number(action.options.seconds) * 1000) })
			},
		},
		suite_visibility: {
			name: 'Suite: show / hide on the HUD',
			options: [
				{
					id: 'section',
					type: 'dropdown',
					label: 'Element',
					choices: [
						{ id: 'scorebug', label: 'Scorebug' },
						{ id: 'stats', label: 'Stats' },
						{ id: 'casters', label: 'Casters' },
						{ id: 'timer', label: 'Break timer' },
						{ id: 'sponsors', label: 'Sponsors' },
					],
					default: 'scorebug',
				},
				{ id: 'mode', type: 'dropdown', label: 'Mode', choices: TOGGLE_CHOICES, default: 'toggle' },
			],
			callback: (action) => {
				const mode = action.options.mode
				send({
					type: 'visibility.set',
					section: action.options.section,
					visible: mode === 'toggle' ? 'toggle' : mode === 'on',
				})
			},
		},
		suite_sponsors_next: {
			name: 'Suite: next sponsor',
			options: [],
			callback: () => {
				send({ type: 'sponsors.next' })
			},
		},
	}
	return definitions as unknown as CompanionActionDefinitions<ModuleSchema['actions']>
}

// ---------------------------------------------------------------------------
// Feedbacks
// ---------------------------------------------------------------------------

export type SuiteFeedbacksSchema = {
	suite_connected: { type: 'boolean'; options: Record<string, never> }
	suite_visible: { type: 'boolean'; options: { section: 'scorebug' | 'casters' | 'timer' | 'sponsors' | 'stats' } }
	suite_stat_on_screen: { type: 'boolean'; options: { stat: StatKey } }
	suite_timer_running: { type: 'boolean'; options: Record<string, never> }
	suite_stats_mode: { type: 'boolean'; options: { mode: StatsMode } }
}

export const SUITE_FEEDBACK_IDS = [
	'suite_connected',
	'suite_visible',
	'suite_stat_on_screen',
	'suite_timer_running',
	'suite_stats_mode',
] as const

export function suiteFeedbackDefinitions(
	self: ModuleInstance,
): CompanionFeedbackDefinitions<ModuleSchema['feedbacks']> {
	const state = () => self.suite?.state
	const definitions: CompanionFeedbackDefinitions<SuiteFeedbacksSchema> = {
		suite_connected: {
			name: 'Suite: connected to the suite server',
			type: 'boolean',
			defaultStyle: { bgcolor: 0x15803d, color: 0xffffff },
			options: [],
			callback: () => self.suite?.connected ?? false,
		},
		suite_visible: {
			name: 'Suite: element shown on the HUD',
			type: 'boolean',
			defaultStyle: { bgcolor: 0xcc0000, color: 0xffffff },
			options: [
				{
					id: 'section',
					type: 'dropdown',
					label: 'Element',
					choices: [
						{ id: 'scorebug', label: 'Scorebug' },
						{ id: 'stats', label: 'Stats' },
						{ id: 'casters', label: 'Casters' },
						{ id: 'timer', label: 'Break timer' },
						{ id: 'sponsors', label: 'Sponsors' },
					],
					default: 'stats',
				},
			],
			callback: (feedback) => state()?.config[feedback.options.section].visible ?? false,
		},
		suite_stat_on_screen: {
			name: 'Suite: this stat is on screen',
			type: 'boolean',
			defaultStyle: { bgcolor: 0xcc0000, color: 0xffffff },
			options: [
				{
					id: 'stat',
					type: 'dropdown',
					label: 'Stat',
					choices: STAT_KEYS.map((key) => ({ id: key, label: STAT_LABELS[key] })),
					default: 'goals',
				},
			],
			callback: (feedback) => {
				const stats = state()?.config.stats
				if (!stats?.visible || stats.types.length === 0) return false
				return stats.types[stats.index % stats.types.length] === feedback.options.stat
			},
		},
		suite_timer_running: {
			name: 'Suite: break timer running',
			type: 'boolean',
			defaultStyle: { bgcolor: 0x15803d, color: 0xffffff },
			options: [],
			callback: () => state()?.config.timer.running ?? false,
		},
		suite_stats_mode: {
			name: 'Suite: stats of this kind on the HUD',
			description: 'True while the match HUD shows stats of this kind: teams, one player, or 1 vs 1.',
			type: 'boolean',
			defaultStyle: { bgcolor: 0xcc0000, color: 0xffffff },
			options: [
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Kind',
					choices: [
						{ id: 'teams', label: 'Teams' },
						{ id: 'player', label: 'One player' },
						{ id: 'versus', label: '1 vs 1' },
					],
					default: 'player',
				},
			],
			callback: (feedback) => !!state()?.config.stats.visible && statsMode(state()) === feedback.options.mode,
		},
	}
	return definitions as unknown as CompanionFeedbackDefinitions<ModuleSchema['feedbacks']>
}

/** JSON of a value for a Companion variable. */
export function jsonVariable(value: unknown): JsonValue {
	return value === undefined ? null : (JSON.parse(JSON.stringify(value)) as JsonValue)
}
