import type { DropdownChoice } from '@companion-module/base'
import { PERSPECTIVES, type ChangePOVData, type Perspective } from '@juande_pl/rocketleague-stats-api-client'
import type ModuleInstance from './main.js'
import {
	SERIES_CONTROL_LABEL,
	SERIES_CONTROL_MODES,
	SIDES,
	SIDE_LABEL,
	type SeriesControlMode,
	type Side,
} from './series.js'

const TEAM_CHOICES: DropdownChoice<Side | 'name'>[] = [
	...SIDES.map((id) => ({ id, label: SIDE_LABEL[id] })),
	{ id: 'name', label: 'By name' },
]
const TEAM_DESCRIPTION = 'Blue / Orange: the team on that side in the current match, or in the last finished one.'
import { parseFocus } from './state.js'
import { statsSetupActionDefinitions, type StatsSetupActionsSchema } from './stats-setup.js'
import { suiteActionDefinitions, type SuiteActionsSchema } from './suite.js'

type PerspectiveOption = Perspective | ''
type SwitchMode = 'on' | 'off' | 'toggle'

type SuiteAndStatsSetupActions = SuiteActionsSchema & StatsSetupActionsSchema

export type ActionsSchema = SuiteAndStatsSetupActions & {
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
	series_control: {
		options: {
			mode: SeriesControlMode
			confirm: boolean
			confirmSeconds: number
		}
	}
	call_timeout: {
		options: {
			team: Side | 'name'
			name: string
		}
	}
	series_pause: {
		options: {
			mode: 'pause' | 'resume' | 'toggle'
		}
	}
	series_wins: {
		options: {
			team: Side | 'name'
			name: string
			mode: 'add' | 'remove' | 'set'
			value: number
		}
	}
	set_team_names: {
		options: {
			mode: 'set' | 'swap' | 'clear'
			blue: string
			orange: string
		}
	}
	end_timeout: {
		options: Record<string, never>
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
		...suiteActionDefinitions(self),
		...statsSetupActionDefinitions(self),
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

		series_control: {
			name: 'Series: start / restart / stop / remove last match',
			description:
				'Start: new series with the options of the connection config. Restart: same options. ' +
				'Stop: stops recording (and the automatic start) and keeps the results. Start and Restart clear the stored matches. ' +
				'Remove last match: takes back the last recorded match, for example one that should not count.',
			options: [
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Action',
					choices: SERIES_CONTROL_MODES.map((id) => ({ id, label: SERIES_CONTROL_LABEL[id] })),
					default: 'start',
					disableAutoExpression: true,
				},
				{
					id: 'confirm',
					type: 'checkbox',
					label: 'Press twice to confirm',
					description: 'The first press arms the action, a second press within the time below runs it.',
					default: true,
				},
				{
					id: 'confirmSeconds',
					type: 'number',
					label: 'Seconds to confirm',
					default: 3,
					min: 1,
					max: 30,
					step: 1,
					isVisibleExpression: `$(options:confirm)`,
				},
			],
			callback: (action) => {
				const { mode } = action.options
				// Actions saved before the option existed have no `confirm`: they keep running at once.
				if (action.options.confirm === true) self.requestSeriesControl(mode, Number(action.options.confirmSeconds) || 3)
				else self.runSeriesControl(mode)
			},
		},

		call_timeout: {
			name: 'Series: call timeout',
			description:
				'A team calls a timeout, between the end of a match and the start of the next one. ' +
				'It ends with End timeout, when its time runs out, or when the next match starts.',
			options: [
				{
					id: 'team',
					type: 'dropdown',
					label: 'Team',
					description: TEAM_DESCRIPTION,
					choices: TEAM_CHOICES,
					default: 'blue',
					disableAutoExpression: true,
				},
				{
					id: 'name',
					type: 'textinput',
					label: 'Team name',
					default: '',
					isVisibleExpression: `$(options:team) == 'name'`,
				},
			],
			callback: (action) => {
				const { team } = action.options
				const name = team === 'name' ? String(action.options.name ?? '').trim() : self.sideTeamName(team)
				if (!name) {
					self.log('warn', 'Call timeout: the team name is empty.')
					return
				}
				self.callTimeout(name)
			},
		},

		end_timeout: {
			name: 'Series: end timeout',
			description: 'Ends the running timeout early, for example when the team is ready.',
			options: [],
			callback: () => self.endTimeout(),
		},

		series_pause: {
			name: 'Series: pause / resume',
			description:
				'While the series is paused, the matches that end are not recorded and no timeout can be called, ' +
				'for example for a showmatch between two matches. The results, manual wins and a running timeout stay.',
			options: [
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Action',
					choices: [
						{ id: 'pause', label: 'Pause' },
						{ id: 'resume', label: 'Resume' },
						{ id: 'toggle', label: 'Toggle' },
					],
					default: 'toggle',
				},
			],
			callback: (action) => self.pauseSeries(action.options.mode),
		},

		series_wins: {
			name: 'Series: change wins by hand',
			description:
				'Adds, removes or sets the series wins of a team, for example to fix the score or count a match played elsewhere. ' +
				'The series ends, or goes on again, with the change. Start and Restart clear them.',
			options: [
				{
					id: 'team',
					type: 'dropdown',
					label: 'Team',
					description: TEAM_DESCRIPTION,
					choices: TEAM_CHOICES,
					default: 'blue',
					disableAutoExpression: true,
				},
				{
					id: 'name',
					type: 'textinput',
					label: 'Team name',
					default: '',
					isVisibleExpression: `$(options:team) == 'name'`,
				},
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Change',
					choices: [
						{ id: 'add', label: 'Add wins' },
						{ id: 'remove', label: 'Remove wins' },
						{ id: 'set', label: 'Set wins to' },
					],
					default: 'add',
				},
				{
					id: 'value',
					type: 'number',
					label: 'Wins',
					default: 1,
					min: 0,
					max: 99,
					step: 1,
				},
			],
			callback: (action) => {
				const { team, mode } = action.options
				const name = team === 'name' ? String(action.options.name ?? '').trim() : self.sideTeamName(team)
				if (!name) {
					self.log('warn', 'Series wins: the team name is empty.')
					return
				}
				const value = Math.max(0, Math.round(Number(action.options.value) || 0))
				if (mode === 'set') self.setWins(name, value)
				else self.adjustWins(name, mode === 'remove' ? -value : value)
			},
		},

		set_team_names: {
			name: 'Series: set team names',
			description:
				'Names used in the results for the team playing each side, instead of the names set in the game. ' +
				'Each finished match keeps the names it was played with. Saved in the connection config.',
			options: [
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Action',
					choices: [
						{ id: 'set', label: 'Set names' },
						{ id: 'swap', label: 'Swap names (the teams switched sides)' },
						{ id: 'clear', label: 'Clear (use the game names)' },
					],
					default: 'set',
					disableAutoExpression: true,
				},
				{
					id: 'blue',
					type: 'textinput',
					label: 'Blue team name',
					description: 'Empty: the name set in the game.',
					default: '',
					isVisibleExpression: `$(options:mode) == 'set'`,
				},
				{
					id: 'orange',
					type: 'textinput',
					label: 'Orange team name',
					description: 'Empty: the name set in the game.',
					default: '',
					isVisibleExpression: `$(options:mode) == 'set'`,
				},
			],
			callback: (action) => {
				const { mode } = action.options
				self.setTeamNames(mode, {
					blue: String(action.options.blue ?? ''),
					orange: String(action.options.orange ?? ''),
				})
			},
		},
	})
}
