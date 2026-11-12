import type { DropdownChoice } from '@companion-module/base'
import { PERSPECTIVES, type ChangePOVData, type Perspective } from 'rocketleague-stats-api-client'
import type ModuleInstance from './main.js'
import { parseFocus } from './state.js'

type PerspectiveOption = Perspective | ''
type SwitchMode = 'on' | 'off' | 'toggle'

export type ActionsSchema = {
	change_pov: {
		options: {
			focus: string
			perspective: PerspectiveOption
		}
	}
	load_replay: {
		options: {
			source: 'fileName' | 'path'
			fileName: string
			path: string
		}
	}
	seek_replay: {
		options: {
			target: 'time' | 'frame'
			timeSeconds: number
			frame: number
		}
	}
	set_game_speed: {
		options: {
			speed: number
		}
	}
	set_hud_visibility: {
		options: {
			mode: SwitchMode
		}
	}
	set_match_paused: {
		options: {
			mode: SwitchMode
		}
	}
}

const PERSPECTIVE_LABELS: Record<Perspective, string> = {
	Fly: 'Fly (free camera)',
	SoftAttach: 'SoftAttach (follow position)',
	HardAttach: 'HardAttach (follow position and rotation)',
	PlayerView: 'PlayerView (player camera)',
	AutoCam: 'AutoCam',
	Camera_Director: 'Director',
}

const PERSPECTIVE_CHOICES: DropdownChoice<PerspectiveOption>[] = [
	{ id: '', label: 'No change' },
	...PERSPECTIVES.map((id) => ({ id, label: PERSPECTIVE_LABELS[id] })),
]

/** Resolves an on / off / toggle option against the current value. */
function resolveSwitch(mode: SwitchMode, current: boolean): boolean {
	return mode === 'toggle' ? !current : mode === 'on'
}

export function UpdateActions(self: ModuleInstance): void {
	self.setActionDefinitions({
		change_pov: {
			name: 'Change POV',
			description: 'ChangePOV: changes the spectator or replay camera. Set a focus, a perspective, or both.',
			options: [
				{
					id: 'focus',
					type: 'textinput',
					label: 'Focus',
					description: '"Ball", a player shortcut number (e.g. 1), or empty to keep the current focus.',
					default: '',
					allowInvalidValues: true,
				},
				{
					id: 'perspective',
					type: 'dropdown',
					label: 'Perspective',
					choices: PERSPECTIVE_CHOICES,
					default: '',
				},
			],
			callback: (action) => {
				const focus = parseFocus(action.options.focus)
				if (focus === null) {
					self.log(
						'warn',
						`ChangePOV: invalid focus "${String(action.options.focus)}". Use "Ball" or a player shortcut.`,
					)
					return
				}
				const perspective = action.options.perspective || undefined
				if (focus === undefined && perspective === undefined) {
					self.log('warn', 'ChangePOV: set a focus, a perspective, or both.')
					return
				}
				self.sendCommand('ChangePOV', { Focus: focus, Perspective: perspective } as ChangePOVData)
			},
		},

		load_replay: {
			name: 'Load replay',
			description: 'LoadReplay: loads and plays a replay by file name or by full path.',
			options: [
				{
					id: 'source',
					type: 'dropdown',
					label: 'Load by',
					choices: [
						{ id: 'fileName', label: 'File name' },
						{ id: 'path', label: 'Full path' },
					],
					default: 'fileName',
					disableAutoExpression: true,
				},
				{
					id: 'fileName',
					type: 'textinput',
					label: 'File name',
					description: 'Name of a replay in the Demos folder.',
					default: '',
					isVisibleExpression: `$(options:source) == 'fileName'`,
				},
				{
					id: 'path',
					type: 'textinput',
					label: 'Path',
					description: 'Full path of the .replay file.',
					default: '',
					isVisibleExpression: `$(options:source) == 'path'`,
				},
			],
			callback: (action) => {
				const { source } = action.options
				const value = String((source === 'path' ? action.options.path : action.options.fileName) ?? '').trim()
				if (!value) {
					self.log('warn', 'LoadReplay: the file name or path is empty.')
					return
				}
				self.sendCommand('LoadReplay', source === 'path' ? { Path: value } : { FileName: value })
			},
		},

		seek_replay: {
			name: 'Seek replay',
			description: 'SeekReplay: jumps the replay to a time or a frame.',
			options: [
				{
					id: 'target',
					type: 'dropdown',
					label: 'Seek to',
					choices: [
						{ id: 'time', label: 'Time (seconds)' },
						{ id: 'frame', label: 'Frame' },
					],
					default: 'time',
					disableAutoExpression: true,
				},
				{
					id: 'timeSeconds',
					type: 'number',
					label: 'Time (seconds)',
					default: 0,
					min: 0,
					max: 100000,
					step: 0.1,
					isVisibleExpression: `$(options:target) == 'time'`,
				},
				{
					id: 'frame',
					type: 'number',
					label: 'Frame',
					default: 0,
					min: 0,
					max: 10000000,
					step: 1,
					isVisibleExpression: `$(options:target) == 'frame'`,
				},
			],
			callback: (action) => {
				if (action.options.target === 'frame') {
					self.sendCommand('SeekReplay', { Frame: Math.round(Number(action.options.frame)) })
				} else {
					self.sendCommand('SeekReplay', { TimeSeconds: Number(action.options.timeSeconds) })
				}
			},
		},

		set_game_speed: {
			name: 'Set game speed',
			description: 'SetGameSpeed: replay playback speed (1 = normal, 0.5 = half, 2 = double).',
			options: [
				{
					id: 'speed',
					type: 'number',
					label: 'Speed',
					default: 1,
					min: 0,
					max: 10,
					step: 0.05,
					range: true,
				},
			],
			callback: (action) => {
				self.sendCommand('SetGameSpeed', { Speed: Number(action.options.speed) })
			},
		},

		set_hud_visibility: {
			name: 'Set HUD visibility',
			description: 'SetHUDVisibility: shows or hides the in-game HUD.',
			options: [
				{
					id: 'mode',
					type: 'dropdown',
					label: 'HUD',
					choices: [
						{ id: 'on', label: 'Show' },
						{ id: 'off', label: 'Hide' },
						{ id: 'toggle', label: 'Toggle' },
					],
					default: 'toggle',
				},
			],
			callback: (action) => {
				self.sendCommand('SetHUDVisibility', { bVisible: resolveSwitch(action.options.mode, self.hudVisible) })
			},
		},

		set_match_paused: {
			name: 'Pause / resume match',
			description: 'SetMatchPaused: pauses or resumes the match or replay.',
			options: [
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Action',
					choices: [
						{ id: 'on', label: 'Pause' },
						{ id: 'off', label: 'Resume' },
						{ id: 'toggle', label: 'Toggle' },
					],
					default: 'toggle',
				},
			],
			callback: (action) => {
				self.sendCommand('SetMatchPaused', { bPaused: resolveSwitch(action.options.mode, self.isPaused) })
			},
		},
	})
}
