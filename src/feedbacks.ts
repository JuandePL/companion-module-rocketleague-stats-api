import type { DropdownChoice } from '@companion-module/base'
import type { SeriesStatus } from '@juande_pl/rocketleague-stats-api-client'
import type ModuleInstance from './main.js'
import { SERIES_CONTROL_LABEL, SIDES, SIDE_LABEL, type SeriesControlMode, type Side } from './series.js'
import { hasPov } from './state.js'
import { suiteFeedbackDefinitions, type SuiteFeedbacksSchema } from './suite.js'

export type FeedbacksSchema = SuiteFeedbacksSchema & {
	player_pov: {
		type: 'boolean'
		options: {
			player: number
		}
	}
	director_pov: {
		type: 'boolean'
		options: Record<string, never>
	}
	match_paused: {
		type: 'boolean'
		options: Record<string, never>
	}
	time_below: {
		type: 'boolean'
		options: {
			seconds: number
		}
	}
	overtime: {
		type: 'boolean'
		options: Record<string, never>
	}
	replay_active: {
		type: 'boolean'
		options: Record<string, never>
	}
	has_winner: {
		type: 'boolean'
		options: Record<string, never>
	}
	match_started: {
		type: 'boolean'
		options: Record<string, never>
	}
	match_aborted: {
		type: 'boolean'
		options: Record<string, never>
	}
	series_status: {
		type: 'boolean'
		options: {
			status: SeriesStatus
		}
	}
	series_control_armed: {
		type: 'boolean'
		options: {
			mode: SeriesControlMode | 'any'
		}
	}
	timeout_active: {
		type: 'boolean'
		options: {
			team: SideOrAny
		}
	}
	can_call_timeout: {
		type: 'boolean'
		options: {
			team: Side
		}
	}
	has_timeouts_left: {
		type: 'boolean'
		options: {
			team: Side
		}
	}
}

type SideOrAny = Side | 'any'

const SIDE_CHOICES: DropdownChoice<Side>[] = SIDES.map((id) => ({ id, label: SIDE_LABEL[id] }))
const SIDE_NOTE = 'The team playing on that side in the current match, or in the last finished one.'

export function UpdateFeedbacks(self: ModuleInstance): void {
	self.setFeedbackDefinitions({
		...suiteFeedbackDefinitions(self),
		player_pov: {
			name: 'Player has the POV',
			description: 'True when the spectator camera is on this player. Players are numbered as in the players variable.',
			type: 'boolean',
			defaultStyle: {
				bgcolor: 0xcc0000,
				color: 0xffffff,
			},
			options: [
				{
					id: 'player',
					type: 'number',
					label: 'Player number (1 = first in the players variable)',
					default: 1,
					min: 1,
					max: 8,
					step: 1,
				},
			],
			callback: (feedback) => {
				const player = self.players[Math.round(Number(feedback.options.player)) - 1]
				return hasPov(self.state, player?.Shortcut)
			},
		},
		director_pov: {
			name: 'Director camera is active',
			description: 'True when the last perspective sent with Change POV is Director.',
			type: 'boolean',
			defaultStyle: {
				bgcolor: 0xcc0000,
				color: 0xffffff,
			},
			options: [],
			callback: () => self.perspective === 'Camera_Director',
		},
		match_paused: {
			name: 'Match is paused',
			type: 'boolean',
			defaultStyle: {
				bgcolor: 0xd97706,
				color: 0x000000,
			},
			options: [],
			callback: () => self.isPaused,
		},
		time_below: {
			name: 'Time remaining below',
			description: 'True when the match clock is below the given seconds (never in overtime).',
			type: 'boolean',
			defaultStyle: {
				bgcolor: 0xcc0000,
				color: 0xffffff,
			},
			options: [
				{
					id: 'seconds',
					type: 'number',
					label: 'Seconds',
					default: 30,
					min: 1,
					max: 3600,
					step: 1,
				},
			],
			callback: (feedback) => {
				const game = self.state?.Game
				return game !== undefined && !game.bOvertime && game.TimeSeconds < Number(feedback.options.seconds)
			},
		},
		overtime: {
			name: 'Match is in overtime',
			type: 'boolean',
			defaultStyle: {
				bgcolor: 0xea580c,
				color: 0x000000,
			},
			options: [],
			callback: () => self.state?.Game.bOvertime === true,
		},
		replay_active: {
			name: 'Replay is active',
			description: 'True during a goal replay or a match history replay.',
			type: 'boolean',
			defaultStyle: {
				bgcolor: 0x7c3aed,
				color: 0xffffff,
			},
			options: [],
			callback: () => self.state?.Game.bReplay === true,
		},
		has_winner: {
			name: 'A team has won',
			type: 'boolean',
			defaultStyle: {
				bgcolor: 0x16a34a,
				color: 0xffffff,
			},
			options: [],
			callback: () => self.state?.Game.bHasWinner === true,
		},
		match_started: {
			name: 'Match is being played',
			description: 'True from the start of the match (not in the lobby) until it ends or is left.',
			type: 'boolean',
			defaultStyle: {
				bgcolor: 0x16a34a,
				color: 0xffffff,
			},
			options: [],
			callback: () => self.series?.tracker.matchStarted === true,
		},
		match_aborted: {
			name: 'Match was left before its end',
			description: 'True after the lobby was destroyed without the match ending, until the next match starts.',
			type: 'boolean',
			defaultStyle: {
				bgcolor: 0x7f1d1d,
				color: 0xffffff,
			},
			options: [],
			callback: () => self.series?.tracker.matchAborted === true,
		},
		series_status: {
			name: 'Series status',
			type: 'boolean',
			defaultStyle: {
				bgcolor: 0x16a34a,
				color: 0xffffff,
			},
			options: [
				{
					id: 'status',
					type: 'dropdown',
					label: 'Status',
					choices: [
						{ id: 'running', label: 'Running' },
						{ id: 'finished', label: 'Finished' },
						{ id: 'stopped', label: 'Stopped' },
						{ id: 'idle', label: 'Not started' },
					],
					default: 'running',
				},
			],
			callback: (feedback) => self.series?.status === feedback.options.status,
		},
		series_control_armed: {
			name: 'Series control waits for confirmation',
			description:
				'True after the first press of a Start / Restart / Stop series that needs two presses, until it is confirmed or times out.',
			type: 'boolean',
			defaultStyle: {
				bgcolor: 0xd97706,
				color: 0x000000,
			},
			options: [
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Control',
					choices: [
						{ id: 'any', label: 'Any' },
						...(['start', 'restart', 'stop'] as const).map((id) => ({ id, label: SERIES_CONTROL_LABEL[id] })),
					],
					default: 'any',
				},
			],
			callback: (feedback) => {
				const armed = self.seriesControlArmed
				return armed !== undefined && (feedback.options.mode === 'any' || feedback.options.mode === armed)
			},
		},
		timeout_active: {
			name: 'Timeout is running',
			description: `True while a timeout is running, for any team or for the team on one side. ${SIDE_NOTE}`,
			type: 'boolean',
			defaultStyle: {
				bgcolor: 0xd97706,
				color: 0x000000,
			},
			options: [
				{
					id: 'team',
					type: 'dropdown',
					label: 'Team',
					choices: [{ id: 'any', label: 'Any' }, ...SIDE_CHOICES],
					default: 'any',
				},
			],
			callback: (feedback) => {
				const timeout = self.series?.activeTimeout
				if (!timeout) return false
				const { team } = feedback.options
				return team === 'any' || timeout.team === self.sideTeamName(team)
			},
		},
		can_call_timeout: {
			name: 'Team can call a timeout',
			description: `True when the team can call a timeout right now. ${SIDE_NOTE}`,
			type: 'boolean',
			defaultStyle: {
				bgcolor: 0x16a34a,
				color: 0xffffff,
			},
			options: [{ id: 'team', type: 'dropdown', label: 'Team', choices: SIDE_CHOICES, default: 'blue' }],
			callback: (feedback) => self.timeoutRefusal(self.sideTeamName(feedback.options.team)) === undefined,
		},
		has_timeouts_left: {
			name: 'Team has timeouts left',
			description: `True when the team still has timeouts to call in the series. ${SIDE_NOTE}`,
			type: 'boolean',
			defaultStyle: {
				bgcolor: 0x1f6feb,
				color: 0xffffff,
			},
			options: [{ id: 'team', type: 'dropdown', label: 'Team', choices: SIDE_CHOICES, default: 'blue' }],
			callback: (feedback) => self.timeoutsLeft(self.sideTeamName(feedback.options.team)) > 0,
		},
	})
}
