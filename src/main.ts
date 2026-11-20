import { InstanceBase, InstanceStatus, type SomeCompanionConfigField } from '@companion-module/base'
import {
	CommandValidationError,
	EsportsSeries,
	NotConnectedError,
	RocketLeagueStatsClient,
	SeriesTimeoutError,
	type CommandDataMap,
	type CommandName,
	type Perspective,
	type Player,
	type SeriesTimeoutRefusal,
	type UpdateStateData,
} from '@juande_pl/rocketleague-stats-api-client'
import { DEFAULT_HOST, DEFAULT_PORT, GetConfigFields, isLocalHost, isSuiteMode, type ModuleConfig } from './config.js'
import {
	DEFAULT_SUITE_PORT,
	SUITE_FEEDBACK_IDS,
	SuiteLink,
	suiteVariables,
	timerVariables,
	type SuiteCommand,
} from './suite.js'
import { UpdateVariableDefinitions, emptyStateVariables, stateVariables, type VariablesSchema } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions, type ActionsSchema } from './actions.js'
import { UpdateFeedbacks, type FeedbacksSchema } from './feedbacks.js'
import { UpdatePresets } from './presets.js'
import { sortPlayers } from './state.js'
import {
	EventRelay,
	SERIES_CONTROL_LABEL,
	SIDES,
	TIMEOUT_REFUSAL_TEXT,
	matchStatsVariables,
	matchSummaryJson,
	seriesAutoStartFromConfig,
	seriesOptionsFromConfig,
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

export default class ModuleInstance extends InstanceBase<ModuleSchema> {
	config!: ModuleConfig // Setup in init()

	/** Last `UpdateState` payload, or `undefined` when there is no match. */
	state: UpdateStateData | undefined
	/** `state.Players`, sorted by TeamNum and Shortcut (same order as the `players` variable). */
	players: Player[] = []
	/** Tracked from MatchPaused / MatchUnpaused and from the SetMatchPaused commands we send. */
	isPaused = false
	/** Tracked from the SetHUDVisibility commands we send (the API does not report it). */
	hudVisible = true
	/** Last perspective sent with ChangePOV (the API does not report it). */
	perspective: Perspective | undefined

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
		this.#createSeries()
		this.#connect()
	}

	// When module gets deleted
	async destroy(): Promise<void> {
		this.#disconnect()
		this.#disposeSeries()
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = config
		this.#disconnect()
		if (this.#seriesKey() !== this.#seriesConfigKey) {
			this.log('info', 'Series options changed: starting a new series')
			this.#disposeSeries()
			this.#createSeries()
		}
		this.#connect()
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
			this.#setPaused((data as CommandDataMap['SetMatchPaused']).bPaused)
		} else if (command === 'SetHUDVisibility') {
			this.hudVisible = (data as CommandDataMap['SetHUDVisibility']).bVisible
		} else if (command === 'ChangePOV') {
			const { Focus, Perspective } = data as CommandDataMap['ChangePOV']
			// Focusing a player without a perspective makes the game switch to PlayerView.
			const next = Perspective ?? (Focus !== undefined && Focus !== 'Ball' ? 'PlayerView' : this.perspective)
			this.#setPerspective(next)
		}
	}

	#setPaused(paused: boolean): void {
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
			this.log('info', `${label} series confirmed`)
			this.runSeriesControl(mode)
			return
		}
		this.#disarmSeriesControl()
		this.log('info', `Press ${label} series again within ${seconds} s to confirm`)
		this.#armedSeriesControl = mode
		this.#seriesControlTimer = setTimeout(() => this.#disarmSeriesControl(), Math.max(1, seconds) * 1000)
		this.#updateVariables({ seriesControlArmed: mode })
		this.checkFeedbacks('series_control_armed')
	}

	runSeriesControl(mode: SeriesControlMode): void {
		if (mode === 'stop') this.stopSeries()
		else if (mode === 'restart') this.restartSeries()
		else this.startSeries()
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
		return this.series ? sideTeamName(this.series, side) : ''
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

	#seriesKey(): string {
		return JSON.stringify([
			seriesOptionsFromConfig(this.config),
			seriesAutoStartFromConfig(this.config),
			isSuiteMode(this.config),
		])
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

	#createSeries(): void {
		this.#seriesConfigKey = this.#seriesKey()
		const suite = isSuiteMode(this.config)
		const series = new EsportsSeries(this.#relay, {
			...seriesOptionsFromConfig(this.config),
			// In suite mode the series mirrors the server's (see #connectSuite): it never starts by itself.
			autoStart: suite ? false : seriesAutoStartFromConfig(this.config),
			// Same team names as the suite server, so the live results match its series.
			identifyTeam: suite ? (team) => this.suite?.state?.sides.teamKeys[team.TeamNum] ?? '' : undefined,
		})
		this.series = series
		this.#lastMatch = null
		this.#lastAbortedMatch = null

		this.#seriesUnsubscribers = [
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
		this.#refreshSeries()
	}

	#disposeSeries(): void {
		this.#disarmSeriesControl()
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
		this.#updateVariables({
			...matchStatsVariables(series),
			...seriesVariables(series),
			...timeoutVariables(series),
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
				const team = sideTeamName(series, side)
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
			this.#resetMatchState()
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
		client.on('MatchPaused', () => this.#setPaused(true))
		client.on('MatchUnpaused', () => this.#setPaused(false))
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
	}

	/** Clears everything that belongs to the current match. */
	#resetMatchState(): void {
		this.state = undefined
		this.players = []
		this.#updateVariables(emptyStateVariables())
		this.#setPaused(false)
		this.#checkStateFeedbacks()
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
