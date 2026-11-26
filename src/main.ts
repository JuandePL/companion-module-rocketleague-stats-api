import { InstanceBase, InstanceStatus, type SomeCompanionConfigField } from '@companion-module/base'
import {
	CommandValidationError,
	EsportsSeries,
	EventRelay,
	NotConnectedError,
	RocketLeagueStatsClient,
	SeriesTimeoutError,
	type CommandDataMap,
	type CommandName,
	type Perspective,
	type Player,
	type SeriesOptions,
	type SeriesSnapshot,
	type SeriesTimeoutRefusal,
	type UpdateStateData,
} from '@juande_pl/rocketleague-stats-api-client'
import {
	DEFAULT_HOST,
	DEFAULT_PORT,
	GetConfigFields,
	connectionKey,
	isLocalHost,
	isSuiteMode,
	type ModuleConfig,
} from './config.js'
import {
	DEFAULT_SUITE_PORT,
	SUITE_FEEDBACK_IDS,
	SuiteLink,
	suiteVariables,
	timerVariables,
	type SuiteCommand,
} from './suite.js'
import { STATS_SETUP_FEEDBACK_IDS, StatsSetup } from './stats-setup.js'
import { UpdateVariableDefinitions, emptyStateVariables, stateVariables, type VariablesSchema } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions, type ActionsSchema } from './actions.js'
import { UpdateFeedbacks, type FeedbacksSchema } from './feedbacks.js'
import { UpdatePresets } from './presets.js'
import { sortPlayers } from './state.js'
import {
	SERIES_CONTROL_LABEL,
	SIDES,
	TIMEOUT_REFUSAL_TEXT,
	customTeamName,
	matchStatsVariables,
	matchSummaryJson,
	parseSnapshot,
	seriesAutoStartFromConfig,
	seriesOptionsFromConfig,
	seriesPersistFromConfig,
	seriesVariables,
	sideTeamName,
	timeoutVariables,
	type SeriesControlMode,
	type Side,
} from './series.js'

export type ModuleSchema = {
	config: ModuleConfig
	secrets: undefined
	actions: ActionsSchema
	feedbacks: FeedbacksSchema
	variables: VariablesSchema
}

export { UpgradeScripts }

/** Feedbacks that depend on `UpdateState`. */
const STATE_FEEDBACKS = ['player_pov', 'time_below', 'overtime', 'replay_active', 'has_winner'] as const
/** Feedbacks that depend on the match tracker and the series. */
const SERIES_FEEDBACKS = [
	'match_started',
	'match_aborted',
	'series_status',
	'timeout_active',
	'can_call_timeout',
	'has_timeouts_left',
] as const

/** Minimum time between two updates of the tracker and series variables while a match is played. */
const STATS_UPDATE_INTERVAL_MS = 250
/** Wait after a change of the series before saving it, so a burst of changes is saved once. */
const SNAPSHOT_SAVE_DELAY_MS = 1000

function sameOptions(a: Required<SeriesOptions>, b: Required<SeriesOptions>): boolean {
	return (
		a.games === b.games && a.format === b.format && a.timeouts === b.timeouts && a.timeoutSeconds === b.timeoutSeconds
	)
}

/** Side of a `TeamNum`, `undefined` for anything else than Blue (0) and Orange (1). */
function sideOf(teamNum: number): Side | undefined {
	return teamNum === 0 ? 'blue' : teamNum === 1 ? 'orange' : undefined
}

export default class ModuleInstance extends InstanceBase<ModuleSchema> {
	config!: ModuleConfig // Setup in init()

	/** Last `UpdateState` payload, or `undefined` when there is no match. */
	state: UpdateStateData | undefined
	/** `state.Players`, sorted by TeamNum and Shortcut (same order as the `players` variable). */
	players: Player[] = []
	/** The tracker's, which also gets the SetMatchPaused commands we send. */
	isPaused = false
	#connected = false
	/** Tracked from the SetHUDVisibility commands we send (the API does not report it). */
	hudVisible = true
	/** Last perspective sent with ChangePOV (the API does not report it). */
	perspective: Perspective | undefined

	/** Step-by-step picker of the stats on the suite HUD. */
	readonly statsSetup = new StatsSetup(this)
	#setupFeedbackKey = ''

	/** Records the matches as an esports series. Its `tracker` has the live stats of the current match. */
	series: EsportsSeries | undefined

	#client: RocketLeagueStatsClient | undefined
	/** Connection to the broadcast suite server, in suite mode. It owns the series: this module only mirrors it. */
	suite: SuiteLink | undefined
	#suiteTimer: NodeJS.Timeout | undefined
	/** Forwards the events of every client to the series, so it survives reconnections. */
	readonly #relay = new EventRelay()
	/** JSON of the series options the series was created with, to know when the config changed them. */
	#seriesConfigKey = ''
	#seriesUnsubscribers: (() => void)[] = []
	#statsTimer: NodeJS.Timeout | undefined
	#timeoutTimer: NodeJS.Timeout | undefined
	/** Series control (start, restart, stop) waiting for its confirmation press. */
	#armedSeriesControl: SeriesControlMode | undefined
	#seriesControlTimer: NodeJS.Timeout | undefined
	#snapshotTimer: NodeJS.Timeout | undefined
	#seriesFeedbackKey = ''
	#lastMatch: ReturnType<typeof matchSummaryJson> = null
	#lastAbortedMatch: ReturnType<typeof matchSummaryJson> = null
	#restartRequired = false
	/** JSON of the last value sent for each variable, to only send the ones that changed. */
	readonly #sentVariables = new Map<string, string>()
	#stateFeedbackKey = ''

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig): Promise<void> {
		this.config = config

		this.updateActions()
		this.updateFeedbacks()
		this.updatePresets()
		this.updateVariableDefinitions()

		this.#resetMatchState()
		this.#updateVariables({ isPaused: false, perspective: '', connected: false })
		this.refreshSetup()
		this.#createSeries(this.#persistSeries() ? parseSnapshot(config.seriesSnapshot) : undefined)
		this.#connect()
	}

	// When module gets deleted
	async destroy(): Promise<void> {
		this.#disconnect()
		this.#saveSnapshotNow()
		this.#disposeSeries()
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		const previous = this.config
		this.config = config
		// Only a new host, port or .ini setting needs a new connection: the module also saves its own config
		// (team names, the saved series), and that must not drop the connection.
		if (connectionKey(previous) !== connectionKey(config)) {
			this.#disconnect()
			this.#connect()
		}
		if (this.#seriesKey() !== this.#seriesConfigKey) {
			// `autoStart` is only read when the series is created: create it again and carry the stored series over.
			const snapshot = this.series?.snapshot()
			this.#disposeSeries()
			this.#createSeries(snapshot)
		} else {
			this.#applySeriesOptions()
		}
		if (!seriesPersistFromConfig(config)) {
			if (config.seriesSnapshot) this.#saveConfigPatch({ seriesSnapshot: '' })
		} else {
			this.#scheduleSnapshotSave()
		}
		this.#refreshSeries()
	}

	// Return config fields for web config
	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	updateActions(): void {
		UpdateActions(this)
	}

	updateFeedbacks(): void {
		UpdateFeedbacks(this)
	}

	updatePresets(): void {
		UpdatePresets(this)
	}

	updateVariableDefinitions(): void {
		UpdateVariableDefinitions(this)
	}

	// -----------------------------------------------------------------------
	// Commands
	// -----------------------------------------------------------------------

	/** Sends a command to the game. Errors are logged, never thrown. Returns `true` when it was sent. */
	sendCommand<C extends CommandName>(command: C, data: CommandDataMap[C]): boolean {
		const client = this.#client
		if (!client) {
			this.log('warn', `Cannot send ${command}: the module is not connected`)
			return false
		}
		try {
			// The overload is resolved per command at the call site, so the generic call is safe.
			;(client.send as (command: CommandName, data: unknown) => void)(command, data)
		} catch (error) {
			if (error instanceof NotConnectedError) {
				this.log('warn', `Cannot send ${command}: not connected to Rocket League`)
			} else if (error instanceof CommandValidationError) {
				this.log('warn', `${command} was not sent: ${error.message} ${JSON.stringify(error.data)}`)
			} else {
				this.log('error', `${command} failed: ${error instanceof Error ? error.message : String(error)}`)
			}
			return false
		}
		this.log('debug', `Sent ${command} ${JSON.stringify(data)}`)
		this.#afterCommand(command, data)
		return true
	}

	/** Keeps the locally tracked state in sync with the commands we send. */
	#afterCommand<C extends CommandName>(command: C, data: CommandDataMap[C]): void {
		if (command === 'SetMatchPaused') {
			this.series?.tracker.setPaused((data as CommandDataMap['SetMatchPaused']).bPaused)
			this.#refreshSeries()
		} else if (command === 'SetHUDVisibility') {
			this.hudVisible = (data as CommandDataMap['SetHUDVisibility']).bVisible
		} else if (command === 'ChangePOV') {
			const { Focus, Perspective } = data as CommandDataMap['ChangePOV']
			// Focusing a player without a perspective makes the game switch to PlayerView.
			const next = Perspective ?? (Focus !== undefined && Focus !== 'Ball' ? 'PlayerView' : this.perspective)
			this.#setPerspective(next)
		}
	}

	#syncPaused(): void {
		const tracker = this.series?.tracker
		const paused = this.#connected && !!tracker && tracker.paused && !tracker.matchEnded
		if (this.isPaused === paused) return
		this.isPaused = paused
		this.#updateVariables({ isPaused: paused })
		this.checkFeedbacks('match_paused')
	}

	#setPerspective(perspective: Perspective | undefined): void {
		if (this.perspective === perspective) return
		this.perspective = perspective
		this.#updateVariables({ perspective: perspective ?? '' })
		this.checkFeedbacks('director_pov')
	}

	// -----------------------------------------------------------------------
	// Series
	// -----------------------------------------------------------------------

	/** Starts a new series with the options of the connection config. Clears the stored matches. */
	startSeries(): void {
		this.#disarmSeriesControl()
		if (isSuiteMode(this.config)) {
			this.sendSuiteCommand({ type: 'series.start' })
			return
		}
		this.series?.start(seriesOptionsFromConfig(this.config))
		this.#refreshSeries()
	}

	restartSeries(): void {
		this.#disarmSeriesControl()
		if (isSuiteMode(this.config)) {
			this.sendSuiteCommand({ type: 'series.restart' })
			return
		}
		this.series?.restart()
		this.#refreshSeries()
	}

	stopSeries(): void {
		this.#disarmSeriesControl()
		if (isSuiteMode(this.config)) {
			this.sendSuiteCommand({ type: 'series.stop' })
			return
		}
		if (!this.series) return
		this.series.stop()
		this.log('info', 'Series stopped')
		this.#refreshSeries()
	}

	/** Series control waiting for its confirmation press, if any. */
	get seriesControlArmed(): SeriesControlMode | undefined {
		return this.#armedSeriesControl
	}

	/**
	 * Series control that needs two presses: the first one arms it for `seconds`, a second press of the same control
	 * within that time runs it. Avoids clearing or stopping the series by accident. Pressing another control
	 * arms that one instead.
	 */
	requestSeriesControl(mode: SeriesControlMode, seconds: number): void {
		const label = SERIES_CONTROL_LABEL[mode]
		if (this.#armedSeriesControl === mode) {
			this.log('info', `${label}: confirmed`)
			this.runSeriesControl(mode)
			return
		}
		this.#disarmSeriesControl()
		this.log('info', `Press ${label} again within ${seconds} s to confirm`)
		this.#armedSeriesControl = mode
		this.#seriesControlTimer = setTimeout(() => this.#disarmSeriesControl(), Math.max(1, seconds) * 1000)
		this.#updateVariables({ seriesControlArmed: mode })
		this.checkFeedbacks('series_control_armed')
	}

	runSeriesControl(mode: SeriesControlMode): void {
		if (mode === 'stop') this.stopSeries()
		else if (mode === 'restart') this.restartSeries()
		else if (mode === 'removeLast') this.removeLastMatch()
		else this.startSeries()
	}

	/** Takes back the last recorded match, for example one that shouldn't count. */
	removeLastMatch(): void {
		this.#disarmSeriesControl()
		if (isSuiteMode(this.config)) {
			this.sendSuiteCommand({ type: 'series.undo' })
			return
		}
		const removed = this.series?.removeLastMatch()
		if (!removed) {
			this.log('warn', 'Remove last match: the series has no recorded match')
			return
		}
		const winner = removed.teams.find((team) => team.TeamNum === removed.winnerTeamNum)?.Name ?? 'Unknown'
		this.log('info', `Removed the last match of the series (won by ${winner})`)
		this.#lastMatch = matchSummaryJson(this.series?.matches.at(-1))
		this.#refreshSeries()
	}

	/**
	 * Pauses or resumes the series. While paused, the matches that end are not recorded and no timeout can be
	 * called, for example for a showmatch between two matches of the series.
	 */
	pauseSeries(mode: 'pause' | 'resume' | 'toggle'): void {
		if (isSuiteMode(this.config)) {
			const type = { pause: 'series.pause', resume: 'series.resume', toggle: 'series.togglePause' }[mode]
			this.sendSuiteCommand({ type })
			return
		}
		const series = this.series
		if (!series) return
		const pause = mode === 'toggle' ? !series.paused : mode === 'pause'
		if (pause ? series.pause() : series.resume()) {
			this.log('info', pause ? 'Series paused: matches are not recorded' : 'Series resumed')
		} else {
			this.log('warn', pause ? 'Pause series: the series is not running' : 'Resume series: the series is not paused')
		}
		this.#refreshSeries()
	}

	/** Adds (or removes, with a negative `delta`) series wins to a team by hand. */
	adjustWins(team: string, delta: number): void {
		if (isSuiteMode(this.config)) {
			const slot = this.#suiteSlot(team, 'Series wins')
			if (slot !== undefined) this.sendSuiteCommand({ type: 'series.adjust', slot, delta: Math.round(delta) })
			return
		}
		this.#changeWins(team, (series) => series.adjustWins(team, Math.round(delta)))
	}

	/** Sets the series wins of a team by hand. */
	setWins(team: string, wins: number): void {
		const value = Math.max(0, Math.round(wins))
		if (isSuiteMode(this.config)) {
			const slot = this.#suiteSlot(team, 'Series wins')
			if (slot !== undefined) this.sendSuiteCommand({ type: 'series.setWins', slot, wins: value })
			return
		}
		this.#changeWins(team, (series) => series.setWins(team, value))
	}

	/** Slot (left / right team) of the suite match where `team` plays, by its series name. Logs when it isn't there. */
	#suiteSlot(team: string, what: string): number | undefined {
		const slot = this.suite?.state?.series.keys.indexOf(team) ?? -1
		if (slot < 0) {
			this.log('warn', `${what}: ${team || 'the team'} is not in the match of the suite`)
			return undefined
		}
		return slot
	}

	#changeWins(team: string, change: (series: EsportsSeries) => number): void {
		const series = this.series
		if (!series) return
		if (!['running', 'paused', 'finished'].includes(series.status)) {
			this.log('warn', `Series wins: the series is ${series.status}, start it first`)
			return
		}
		try {
			this.log('info', `${team} has ${change(series)} series win(s)`)
		} catch (error) {
			this.log('warn', `Series wins: ${error instanceof Error ? error.message : String(error)}`)
		}
		this.#refreshSeries()
	}

	/** Team names set by hand for each side (empty: the game's). In suite mode the server names the teams. */
	get customTeamNames(): Record<Side, string> {
		if (isSuiteMode(this.config)) return { blue: '', orange: '' }
		return { blue: customTeamName(this.config, 'blue'), orange: customTeamName(this.config, 'orange') }
	}

	/**
	 * Sets, swaps or clears the team names set by hand, and saves them in the connection config. In suite mode
	 * (left = blue, right = orange): Swap makes the teams change sides, each with its wins, like here; Set puts teams
	 * typed by hand on those sides; Clear does nothing (the teams are set in the suite control panel).
	 */
	setTeamNames(mode: 'set' | 'swap' | 'clear', names: Partial<Record<Side, string>> = {}): void {
		if (isSuiteMode(this.config)) {
			if (mode === 'swap') {
				this.sendSuiteCommand({ type: 'match.swapTeams', fixHistory: false })
			} else if (mode === 'set') {
				const slots: [Side, 0 | 1][] = [
					['blue', 0],
					['orange', 1],
				]
				for (const [side, slot] of slots) {
					const name = names[side]?.trim()
					if (name) this.sendSuiteCommand({ type: 'match.setManualTeam', slot, team: { name } })
				}
			} else {
				this.log('warn', 'Clear team names: in Broadcast suite mode the teams are set in the suite control panel')
			}
			return
		}
		const current = this.customTeamNames
		const next =
			mode === 'swap'
				? { blue: current.orange, orange: current.blue }
				: mode === 'clear'
					? { blue: '', orange: '' }
					: { blue: names.blue?.trim() ?? current.blue, orange: names.orange?.trim() ?? current.orange }
		this.#saveConfigPatch({ teamNameBlue: next.blue, teamNameOrange: next.orange })
		const show = (name: string) => name || '(game name)'
		this.log('info', `Team names: Blue ${show(next.blue)}, Orange ${show(next.orange)}`)
		this.#refreshSeries()
	}

	/** Changes some fields of the config and saves it, without reconnecting. */
	#saveConfigPatch(patch: Partial<ModuleConfig>): void {
		this.config = { ...this.config, ...patch }
		this.saveConfig(this.config)
	}

	/** Applies the series options of the config to the series, keeping its matches. */
	#applySeriesOptions(): void {
		const series = this.series
		// In suite mode the options are set in the suite control panel: the series mirrors the server's.
		if (!series || isSuiteMode(this.config)) return
		const next = seriesOptionsFromConfig(this.config)
		if (sameOptions(series.options, next)) return
		try {
			series.setOptions(next)
			const format = next.format === 'best-of' ? 'best of' : 'play all'
			this.log('info', `Series options changed (${format} ${next.games}): the recorded matches are kept`)
		} catch (error) {
			this.log('warn', `Series options not applied: ${error instanceof Error ? error.message : String(error)}`)
		}
	}

	/** Saves the series in the config a moment after it changes (see {@link SNAPSHOT_SAVE_DELAY_MS}). */
	/** `true` when the series is saved in the config. Not in suite mode: the server keeps the series. */
	#persistSeries(): boolean {
		return seriesPersistFromConfig(this.config) && !isSuiteMode(this.config)
	}

	#scheduleSnapshotSave(): void {
		if (!this.#persistSeries() || this.#snapshotTimer) return
		this.#snapshotTimer = setTimeout(() => {
			this.#snapshotTimer = undefined
			this.#saveSnapshotNow()
		}, SNAPSHOT_SAVE_DELAY_MS)
	}

	#saveSnapshotNow(): void {
		if (this.#snapshotTimer) clearTimeout(this.#snapshotTimer)
		this.#snapshotTimer = undefined
		const series = this.series
		if (!series || !this.#persistSeries()) return
		// Without the timelines (every event of each match): they would make the saved config huge.
		const json = JSON.stringify(series.snapshot({ timeline: false }))
		if (json !== this.config.seriesSnapshot) this.#saveConfigPatch({ seriesSnapshot: json })
	}

	#disarmSeriesControl(): void {
		if (!this.#armedSeriesControl) return
		clearTimeout(this.#seriesControlTimer)
		this.#seriesControlTimer = undefined
		this.#armedSeriesControl = undefined
		this.#updateVariables({ seriesControlArmed: '' })
		this.checkFeedbacks('series_control_armed')
	}

	/** Name of the team playing on `side` in the current match, or in the last finished match of the series. */
	sideTeamName(side: Side): string {
		const custom = this.customTeamNames[side]
		return this.series ? sideTeamName(this.series, side, custom) : custom
	}

	/** Why the team can't call a timeout right now, or `undefined` if it can. */
	timeoutRefusal(team: string): SeriesTimeoutRefusal | undefined {
		return this.series ? this.series.timeoutRefusal(team) : 'not-running'
	}

	timeoutsLeft(team: string): number {
		return this.series?.timeoutsLeft(team) ?? 0
	}

	/** Calls a timeout for a team, by name. Refusals are logged, never thrown. Returns `true` when it was called. */
	callTimeout(team: string): boolean {
		if (isSuiteMode(this.config)) {
			const slot = this.suite?.state?.series.keys.indexOf(team) ?? -1
			if (slot < 0) {
				this.log('warn', `Timeout for ${team || 'the team'} refused: the team is not in the match of the suite`)
				return false
			}
			return this.sendSuiteCommand({ type: 'timeout.call', slot })
		}
		if (!this.series) return false
		try {
			this.series.callTimeout(team)
			return true
		} catch (error) {
			if (error instanceof SeriesTimeoutError) {
				const reason = TIMEOUT_REFUSAL_TEXT[error.reason] ?? error.reason
				this.log('warn', `Timeout for ${error.team || 'the team'} refused: ${reason}`)
			} else {
				this.log('error', `Call timeout failed: ${error instanceof Error ? error.message : String(error)}`)
			}
			return false
		}
	}

	endTimeout(): void {
		if (isSuiteMode(this.config)) {
			this.sendSuiteCommand({ type: 'timeout.end' })
			return
		}
		if (!this.series?.endTimeout()) this.log('debug', 'End timeout: no timeout is running')
	}

	/** The series options that can only be set when the series is created. The others change with `setOptions`. */
	#seriesKey(): string {
		// Switching to or from suite mode also creates the series again: in suite mode it mirrors the server's.
		return JSON.stringify([seriesAutoStartFromConfig(this.config), isSuiteMode(this.config)])
	}

	/** Sends a command to the suite server. Refusals are logged. Returns `false` when not connected. */
	sendSuiteCommand(cmd: SuiteCommand): boolean {
		if (!this.suite) {
			this.log('warn', `${cmd.type}: only available in Broadcast suite mode (connection config)`)
			return false
		}
		if (!this.suite.send(cmd)) {
			this.log('warn', `${cmd.type}: not connected to the suite server`)
			return false
		}
		return true
	}

	/** Creates the series, and brings back `snapshot` (a saved series) when given. */
	#createSeries(snapshot?: SeriesSnapshot): void {
		this.#seriesConfigKey = this.#seriesKey()
		const suite = isSuiteMode(this.config)
		const series = new EsportsSeries(this.#relay, {
			...seriesOptionsFromConfig(this.config),
			// In suite mode the series mirrors the server's (see #connectSuite): it records nothing by itself.
			mirror: suite,
			autoStart: seriesAutoStartFromConfig(this.config),
			// Suite mode: same team names as the suite server, so the live results match its series.
			// Otherwise the names set by hand, read on every result so a change applies right away.
			identifyTeam: (team) => {
				if (suite) return this.suite?.state?.sides.teamKeys[team.TeamNum] ?? ''
				const side = sideOf(team.TeamNum)
				return side ? customTeamName(this.config, side) : ''
			},
		})
		this.series = series
		this.#lastMatch = null
		this.#lastAbortedMatch = null

		this.#seriesUnsubscribers = [
			series.onUpdate(() => this.#scheduleSnapshotSave()),
			series.tracker.onMatchStart(() => this.#refreshSeries()),
			series.onSeriesStart((options) => {
				const format = options.format === 'best-of' ? 'best of' : 'play all'
				this.log('info', `Series started: ${format} ${options.games}`)
				this.#refreshSeries()
			}),
			series.onMatchEnd((match, result) => {
				this.#lastMatch = matchSummaryJson(match)
				const winner = match.teams.find((team) => team.TeamNum === match.winnerTeamNum)?.Name ?? 'Unknown'
				this.log('info', `Game ${result.matches.length} of the series won by ${winner}`)
				this.#refreshSeries()
			}),
			series.onMatchAbort((match) => {
				this.#lastAbortedMatch = matchSummaryJson(match)
				this.log('info', 'A match of the series was left before its end: it does not count')
				this.#refreshSeries()
			}),
			series.onSeriesEnd((result) => {
				this.log('info', result.winner ? `${result.winner} wins the series` : 'The series ended in a tie')
				this.#refreshSeries()
			}),
			series.onTimeoutStart((timeout) => {
				this.log('info', `Timeout called by ${timeout.team}`)
				this.#startTimeoutTimer()
				this.#refreshSeries()
			}),
			series.onTimeoutEnd((timeout) => {
				this.log('info', `Timeout of ${timeout.team} ended (${timeout.endReason ?? 'ended'})`)
				this.#stopTimeoutTimer()
				this.#refreshSeries()
			}),
		]

		if (snapshot) {
			try {
				series.restore(snapshot)
				// The config wins over the options saved with the series.
				this.#applySeriesOptions()
				this.#lastMatch = matchSummaryJson(series.matches.at(-1))
				this.#lastAbortedMatch = matchSummaryJson(series.abortedMatches.at(-1))
				if (series.activeTimeout) this.#startTimeoutTimer()
				this.log('info', `Series brought back: ${series.matches.length} match(es) recorded, ${series.status}`)
			} catch (error) {
				this.log(
					'warn',
					`Could not bring back the saved series: ${error instanceof Error ? error.message : String(error)}`,
				)
			}
		}
		this.#refreshSeries()
	}

	#disposeSeries(): void {
		this.#disarmSeriesControl()
		if (this.#snapshotTimer) clearTimeout(this.#snapshotTimer)
		this.#snapshotTimer = undefined
		for (const unsubscribe of this.#seriesUnsubscribers) unsubscribe()
		this.#seriesUnsubscribers = []
		this.series?.dispose()
		this.series = undefined
		this.#stopTimeoutTimer()
		if (this.#statsTimer) clearTimeout(this.#statsTimer)
		this.#statsTimer = undefined
	}

	/** Updates the tracker and series variables at most every {@link STATS_UPDATE_INTERVAL_MS}. */
	#scheduleStatsUpdate(): void {
		if (this.#statsTimer) return
		this.#statsTimer = setTimeout(() => {
			this.#statsTimer = undefined
			this.#refreshSeries()
		}, STATS_UPDATE_INTERVAL_MS)
	}

	/** Updates every tracker, series and timeout variable now, and re-checks their feedbacks. */
	#refreshSeries(): void {
		const series = this.series
		if (!series) return
		this.#syncPaused()
		this.#updateVariables({
			...matchStatsVariables(series, this.#connected),
			...seriesVariables(series, this.customTeamNames),
			...timeoutVariables(series),
			teamNameBlue: customTeamName(this.config, 'blue'),
			teamNameOrange: customTeamName(this.config, 'orange'),
			lastMatch: this.#lastMatch,
			lastAbortedMatch: this.#lastAbortedMatch,
		})
		this.#checkSeriesFeedbacks()
	}

	/** Updates the timeout clock every second while a timeout is running. */
	#startTimeoutTimer(): void {
		this.#stopTimeoutTimer()
		this.#timeoutTimer = setInterval(() => {
			if (this.series) this.#updateVariables(timeoutVariables(this.series))
		}, 1000)
	}

	#stopTimeoutTimer(): void {
		if (this.#timeoutTimer) clearInterval(this.#timeoutTimer)
		this.#timeoutTimer = undefined
	}

	/** Re-checks the series feedbacks only when one of the values they read has changed. */
	#checkSeriesFeedbacks(): void {
		const series = this.series
		if (!series) return
		const key = JSON.stringify([
			series.tracker.matchStarted,
			series.tracker.matchAborted,
			series.status,
			series.activeTimeout?.team,
			SIDES.map((side) => {
				const team = this.sideTeamName(side)
				return [team, series.timeoutRefusal(team), series.timeoutsLeft(team)]
			}),
		])
		if (key === this.#seriesFeedbackKey) return
		this.#seriesFeedbackKey = key
		this.checkFeedbacks(...SERIES_FEEDBACKS)
	}

	// -----------------------------------------------------------------------
	// Connection
	// -----------------------------------------------------------------------

	#connect(): void {
		const suite = isSuiteMode(this.config)
		const suiteHost = this.config.suiteHost?.trim() || DEFAULT_HOST
		const suitePort = this.config.suitePort || DEFAULT_SUITE_PORT
		// In suite mode the game comes through the suite server's Stats API relay.
		const host = suite ? suiteHost : this.config.host?.trim() || DEFAULT_HOST
		const port = suite ? suitePort : this.config.port || DEFAULT_PORT
		const ensureStatsApi = !suite && this.config.ensureStatsApi !== false && isLocalHost(host)
		if (suite) this.#connectSuite(suiteHost, suitePort)
		else this.#updateVariables(suiteVariables(undefined, false, Date.now()))

		this.#restartRequired = false
		this.updateStatus(InstanceStatus.Connecting)

		const client = new RocketLeagueStatsClient({
			...(suite ? { url: `ws://${host}:${port}/stats-api` } : { host, port }),
			reconnect: { initialDelay: 1000, maxDelay: 5000 },
			ensureStatsApi: ensureStatsApi ? { warn: (message) => this.log('warn', message) } : false,
		})
		this.#client = client

		void client.statsApiConfig?.then((result) => {
			if (this.#client !== client) return
			if (result.status === 'updated') {
				this.#restartRequired = true
				this.updateStatus(InstanceStatus.UnknownWarning, 'PacketSendRate was enabled: restart Rocket League')
			} else if (result.status === 'write-failed') {
				this.log('warn', `Could not enable PacketSendRate in ${result.iniPath}. Set it manually (1-120).`)
			} else if (result.status === 'enabled') {
				this.log('debug', `Stats API enabled in ${result.iniPath} (PacketSendRate=${result.packetSendRate})`)
			}
		})

		client.on('connect', () => {
			this.log('info', `Connected to ${client.url}`)
			this.#connected = true
			this.#refreshSeries()
			if (this.#restartRequired) {
				this.updateStatus(InstanceStatus.UnknownWarning, 'PacketSendRate was enabled: restart Rocket League')
			} else {
				this.updateStatus(InstanceStatus.Ok)
			}
			this.#updateVariables({ connected: true })
		})
		client.on('disconnect', ({ willReconnect }) => {
			this.log('debug', `Disconnected from ${client.url}${willReconnect ? ', reconnecting' : ''}`)
			this.updateStatus(InstanceStatus.Disconnected, 'Waiting for Rocket League')
			this.#updateVariables({ connected: false })
			this.#connected = false
			this.series?.tracker.setPaused(false)
			this.#resetMatchState()
			this.#refreshSeries()
		})
		client.on('error', (error) => this.log('debug', error.message))
		client.on('invalidMessage', (failure) => {
			this.log('debug', `Ignored an invalid message (${failure.reason})${failure.event ? `: ${failure.event}` : ''}`)
		})

		// Every game event goes to the series (and its match tracker) through the relay.
		client.onAny((event) => {
			this.#relay.emit(event)
			if (event.Event === 'UpdateState') this.#scheduleStatsUpdate()
			else this.#refreshSeries()
		})

		client.on('UpdateState', (data) => this.#handleUpdateState(data))
		client.on('MatchCreated', () => this.#resetMatchState())
		client.on('MatchDestroyed', () => this.#resetMatchState())
	}

	/** Connects to the suite server: its series replaces the local one, and its state fills the suite variables. */
	#connectSuite(host: string, port: number): void {
		const link = new SuiteLink(host, port, {
			status: (connected) => {
				this.log(
					connected ? 'info' : 'debug',
					connected ? `Connected to the suite server (${link.url})` : 'Disconnected from the suite server',
				)
				this.#refreshSuite()
			},
			state: () => this.#refreshSuite(),
			series: (snapshot) => {
				try {
					this.series?.restore(snapshot)
					this.#lastMatch = matchSummaryJson(this.series?.matches.at(-1))
					this.#lastAbortedMatch = matchSummaryJson(this.series?.abortedMatches.at(-1))
				} catch (error) {
					this.log(
						'warn',
						`Could not read the series of the suite: ${error instanceof Error ? error.message : String(error)}`,
					)
				}
				this.#refreshSeries()
			},
			error: (message) => this.log('warn', `Suite: ${message}`),
		})
		this.suite = link
		this.#suiteTimer = setInterval(() => {
			if (this.suite?.state?.config.timer.running)
				this.#updateVariables(timerVariables(this.suite.state, this.suite.now()))
		}, 250)
	}

	#refreshSuite(): void {
		const link = this.suite
		if (!link) return
		this.#updateVariables(suiteVariables(link.state, link.connected, link.now()))
		this.checkFeedbacks(...SUITE_FEEDBACK_IDS)
		this.refreshSetup()
	}

	/** Updates the stats setup variables (team names and players change their labels) and its feedbacks. */
	refreshSetup(): void {
		this.#updateVariables(this.statsSetup.variables())
		const key = this.statsSetup.feedbackKey()
		if (key === this.#setupFeedbackKey) return
		this.#setupFeedbackKey = key
		this.checkFeedbacks(...STATS_SETUP_FEEDBACK_IDS)
	}

	#disconnect(): void {
		this.suite?.close()
		this.suite = undefined
		clearInterval(this.#suiteTimer)
		this.#suiteTimer = undefined
		const client = this.#client
		this.#client = undefined
		if (client) {
			client.removeAllListeners()
			this.#connected = false
			client.disconnect()
		}
	}

	// -----------------------------------------------------------------------
	// State
	// -----------------------------------------------------------------------

	#handleUpdateState(data: UpdateStateData): void {
		this.state = data
		this.players = sortPlayers(data.Players)
		this.#updateVariables(stateVariables(data, this.players))
		this.#checkStateFeedbacks()
		if (this.statsSetup.step === 'target') this.refreshSetup()
	}

	/** Clears everything that belongs to the current match. */
	#resetMatchState(): void {
		this.state = undefined
		this.players = []
		this.#updateVariables(emptyStateVariables())
		this.#syncPaused()
		this.#checkStateFeedbacks()
		if (this.statsSetup.step === 'target') this.refreshSetup()
	}

	/** Re-checks the state feedbacks only when one of the values they read has changed. */
	#checkStateFeedbacks(): void {
		const game = this.state?.Game
		const key = JSON.stringify([
			this.players.map((player) => player.Shortcut),
			game?.bHasTarget,
			game?.Target?.Shortcut,
			game?.TimeSeconds,
			game?.bOvertime,
			game?.bReplay,
			game?.bHasWinner,
		])
		if (key === this.#stateFeedbackKey) return
		this.#stateFeedbackKey = key
		this.checkFeedbacks(...STATE_FEEDBACKS)
	}

	/** Sends only the variables whose value changed since the last call. */
	#updateVariables(values: Partial<VariablesSchema>): void {
		const changed: Partial<VariablesSchema> = {}
		let hasChanges = false
		for (const [id, value] of Object.entries(values) as [
			keyof VariablesSchema,
			VariablesSchema[keyof VariablesSchema],
		][]) {
			const json = JSON.stringify(value)
			if (this.#sentVariables.get(id) === json) continue
			this.#sentVariables.set(id, json)
			;(changed as Record<string, unknown>)[id] = value
			hasChanges = true
		}
		if (hasChanges) this.setVariableValues(changed)
	}
}
