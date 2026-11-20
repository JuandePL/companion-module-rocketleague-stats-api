import { Regex, type SomeCompanionConfigField } from '@companion-module/base'
import { DEFAULT_SERIES_FORMAT, DEFAULT_SERIES_GAMES } from './series.js'

export type ModuleConfig = {
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
			type: 'textinput',
			id: 'host',
			label: 'Rocket League host',
			width: 8,
			default: DEFAULT_HOST,
			regex: Regex.HOSTNAME,
		},
		{
			type: 'number',
			id: 'port',
			label: 'WebPort',
			width: 4,
			min: 1,
			max: 65535,
			default: DEFAULT_PORT,
		},
		{
			type: 'checkbox',
			id: 'ensureStatsApi',
			label: 'Enable PacketSendRate in TAStatsAPI.ini automatically',
			description:
				'Only used when Rocket League runs on this computer. If PacketSendRate is 0 or invalid it is set to 30, and the game must be restarted.',
			width: 12,
			default: true,
		},
		{
			type: 'static-text',
			id: 'seriesInfo',
			label: 'Esports series',
			width: 12,
			value:
				'Matches are recorded as a series, with results per team, per player and per match. ' +
				'Changing these options starts a new series.',
		},
		{
			type: 'number',
			id: 'seriesGames',
			label: 'Games in the series',
			width: 4,
			min: 1,
			max: 99,
			default: DEFAULT_SERIES_GAMES,
		},
		{
			type: 'dropdown',
			id: 'seriesFormat',
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
			label: 'Start series automatically',
			description: 'Records without pressing Start, and starts a new series after each one ends.',
			width: 4,
			default: true,
		},
		{
			type: 'number',
			id: 'seriesTimeouts',
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
export function isLocalHost(host: string): boolean {
	const value = host.trim().toLowerCase()
	return value === '' || value === 'localhost' || value === '::1' || value.startsWith('127.')
}
