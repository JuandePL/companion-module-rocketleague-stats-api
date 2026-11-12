import { InstanceBase, InstanceStatus, type SomeCompanionConfigField } from '@companion-module/base'
import {
	CommandValidationError,
	NotConnectedError,
	RocketLeagueStatsClient,
	type CommandDataMap,
	type CommandName,
	type Perspective,
	type Player,
	type UpdateStateData,
} from 'rocketleague-stats-api-client'
import { DEFAULT_HOST, DEFAULT_PORT, GetConfigFields, isLocalHost, type ModuleConfig } from './config.js'
import { UpdateVariableDefinitions, emptyStateVariables, stateVariables, type VariablesSchema } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions, type ActionsSchema } from './actions.js'
import { UpdateFeedbacks, type FeedbacksSchema } from './feedbacks.js'
import { UpdatePresets } from './presets.js'
import { sortPlayers } from './state.js'

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

	#client: RocketLeagueStatsClient | undefined
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
		this.#connect()
	}

	// When module gets deleted
	async destroy(): Promise<void> {
		this.#disconnect()
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = config
		this.#disconnect()
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
	// Connection
	// -----------------------------------------------------------------------

	#connect(): void {
		const host = this.config.host?.trim() || DEFAULT_HOST
		const port = this.config.port || DEFAULT_PORT
		const ensureStatsApi = this.config.ensureStatsApi !== false && isLocalHost(host)

		this.#restartRequired = false
		this.updateStatus(InstanceStatus.Connecting)

		const client = new RocketLeagueStatsClient({
			host,
			port,
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

		client.on('UpdateState', (data) => this.#handleUpdateState(data))
		client.on('MatchPaused', () => this.#setPaused(true))
		client.on('MatchUnpaused', () => this.#setPaused(false))
		client.on('MatchCreated', () => this.#resetMatchState())
		client.on('MatchDestroyed', () => this.#resetMatchState())
	}

	#disconnect(): void {
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
