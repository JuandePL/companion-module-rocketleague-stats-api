import type ModuleInstance from './main.js'
import { hasPov } from './state.js'

export type FeedbacksSchema = {
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
}

export function UpdateFeedbacks(self: ModuleInstance): void {
	self.setFeedbackDefinitions({
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
	})
}
