import { Regex, type SomeCompanionConfigField } from '@companion-module/base'

export type ModuleConfig = {
	host: string
	port: number
	ensureStatsApi: boolean
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
	]
}

/** `true` when the configured host points at this computer, so the game's `.ini` file can be checked. */
export function isLocalHost(host: string): boolean {
	const value = host.trim().toLowerCase()
	return value === '' || value === 'localhost' || value === '::1' || value.startsWith('127.')
}
