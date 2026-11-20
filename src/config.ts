import { Regex, type SomeCompanionConfigField } from '@companion-module/base'
import { DEFAULT_SERIES_FORMAT, DEFAULT_SERIES_GAMES } from './series.js'
import { DEFAULT_SUITE_PORT } from './suite.js'

export type ModuleConfig = {
	/** `direct`: to the game. `suite`: to the broadcast suite server, which shares the series with its panel and HUD. */
	mode: 'direct' | 'suite'
	suiteHost: string
	suitePort: number
	host: string
	port: number
	ensureStatsApi: boolean
	seriesGames: number
	seriesFormat: 'best-of' | 'play-all'
	seriesAutoStart: boolean
	seriesTimeouts: number
	seriesTimeoutSeconds: number
}

export const DEFAULT_HOST = '127.0.0.1'
export const DEFAULT_PORT = 49124

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'static-text',
			id: 'info',
			label: 'Information',
			width: 12,
			value:
				'Connects to the Rocket League Stats API WebSocket (WebPort in TAStatsAPI.ini). ' +
				'PacketSendRate must be greater than 0 for UpdateState to be sent. ' +
				'This project is not affiliated with Psyonix or Epic Games.',
		},
		{
			type: 'dropdown',
			id: 'mode',
			label: 'Connect to',
			width: 12,
			choices: [
				{ id: 'direct', label: 'Rocket League (Stats API)' },
				{ id: 'suite', label: 'Broadcast suite server (shares series, teams, stats and timer with its panel and HUD)' },
			],
			default: 'direct',
		},
		{
			type: 'static-text',
			id: 'suiteInfo',
			label: 'Broadcast suite',
			width: 12,
			value:
				'The suite server connects to the game and owns the series: its options are set in the control panel, and ' +
				'resetting it here resets it everywhere. Game commands and variables go through the server.',
			isVisibleExpression: `$(options:mode) == 'suite'`,
		},
		{
			type: 'textinput',
			id: 'suiteHost',
			label: 'Suite server host',
			width: 8,
			default: DEFAULT_HOST,
			regex: Regex.HOSTNAME,
			isVisibleExpression: `$(options:mode) == 'suite'`,
		},
		{
			type: 'number',
			id: 'suitePort',
			label: 'Suite server port',
			width: 4,
			min: 1,
			max: 65535,
			default: DEFAULT_SUITE_PORT,
			isVisibleExpression: `$(options:mode) == 'suite'`,
		},
		{
			type: 'textinput',
			id: 'host',
			isVisibleExpression: `$(options:mode) != 'suite'`,
			label: 'Rocket League host',
			width: 8,
			default: DEFAULT_HOST,
			regex: Regex.HOSTNAME,
		},
		{
			type: 'number',
			id: 'port',
			isVisibleExpression: `$(options:mode) != 'suite'`,
			label: 'WebPort',
			width: 4,
			min: 1,
			max: 65535,
			default: DEFAULT_PORT,
		},
		{
			type: 'checkbox',
			id: 'ensureStatsApi',
			isVisibleExpression: `$(options:mode) != 'suite'`,
			label: 'Enable PacketSendRate in TAStatsAPI.ini automatically',
			description:
				'Only used when Rocket League runs on this computer. If PacketSendRate is 0 or invalid it is set to 30, and the game must be restarted.',
			width: 12,
			default: true,
		},
		{
			type: 'static-text',
			id: 'seriesInfo',
			isVisibleExpression: `$(options:mode) != 'suite'`,
			label: 'Esports series',
			width: 12,
			value:
				'Matches are recorded as a series, with results per team, per player and per match. ' +
				'Changing these options starts a new series.',
		},
		{
			type: 'number',
			id: 'seriesGames',
			isVisibleExpression: `$(options:mode) != 'suite'`,
			label: 'Games in the series',
			width: 4,
			min: 1,
			max: 99,
			default: DEFAULT_SERIES_GAMES,
		},
		{
			type: 'dropdown',
			id: 'seriesFormat',
			isVisibleExpression: `$(options:mode) != 'suite'`,
			label: 'Format',
			width: 4,
			choices: [
				{ id: 'best-of', label: 'Best of (ends when a team wins more than half)' },
				{ id: 'play-all', label: 'Play all games' },
			],
			default: DEFAULT_SERIES_FORMAT,
		},
		{
			type: 'checkbox',
			id: 'seriesAutoStart',
			isVisibleExpression: `$(options:mode) != 'suite'`,
			label: 'Start series automatically',
			description: 'Records without pressing Start, and starts a new series after each one ends.',
			width: 4,
			default: true,
		},
		{
			type: 'number',
			id: 'seriesTimeouts',
			isVisibleExpression: `$(options:mode) != 'suite'`,
			label: 'Timeouts per team',
			description: 'Timeouts each team can call between matches. 0 turns them off.',
			width: 4,
			min: 0,
			max: 20,
			default: 0,
		},
		{
			type: 'number',
			id: 'seriesTimeoutSeconds',
			isVisibleExpression: `$(options:mode) != 'suite'`,
			label: 'Timeout length (seconds)',
			description: '0: lasts until End timeout is pressed or the next match starts.',
			width: 4,
			min: 0,
			max: 3600,
			default: 0,
		},
	]
}

/** `true` when the configured host points at this computer, so the game's `.ini` file can be checked. */
/** `true` when the module talks to the broadcast suite server instead of the game. */
export function isSuiteMode(config: ModuleConfig): boolean {
	return config.mode === 'suite'
}

export function isLocalHost(host: string): boolean {
	const value = host.trim().toLowerCase()
	return value === '' || value === 'localhost' || value === '::1' || value.startsWith('127.')
}
