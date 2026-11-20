import {
	ButtonGraphicsDecorationType,
	type CompanionLayeredButtonPresetDefinition,
	type CompanionPresetDefinitions,
	type CompanionPresetSection,
} from '@companion-module/base'
import type ModuleInstance from './main.js'
import type { ModuleSchema } from './main.js'

/**
 * Prefix used in preset expressions. Companion replaces it with the connection's label when the
 * preset is placed, so the buttons keep working whatever the connection is called.
 */
const PREFIX = 'rocketleague-stats-api'

/** Number of player presets (enough for 3v3). */
const PLAYER_PRESETS = 6

/** Fallback team colors used until the first UpdateState arrives. */
const FALLBACK_TEAM_COLORS = ['1F6FEB', 'F97316'] as const

const COLOR_IDLE = 0x1a1a1a
const COLOR_ON_AIR = 0xcc0000
const COLOR_PAUSED = 0xd97706
const COLOR_LOW_TIME = 0xff0000
const COLOR_OVERTIME = 0xff8c00
const BORDER_WIDTH = 8

const v = (name: string): string => `$(${PREFIX}:${name})`
/** A property value evaluated as a Companion expression. */
const expr = (value: string): { isExpression: true; value: string } => ({ isExpression: true, value })

/** Expression for the `#RRGGBB` primary color of a team, by TeamNum expression. */
function teamColorExpr(teamNum: string, fallback: string): string {
	return `concat('#', (${v('teams')}[${teamNum}] ?? {}).ColorPrimary ?? '${fallback}')`
}

/** Expression for a text color that stays readable on top of the given color expression. */
function readableTextExpr(colorExpression: string): string {
	return `colorIsDark(${colorExpression}) ? '#FFFFFF' : '#000000'`
}

/** Expression for a field of the n-th (0-based) player of the sorted players variable. */
function playerFieldExpr(index: number, field: string): string {
	return `(${v('players')}[${index}] ?? {}).${field}`
}

type LayeredPreset = CompanionLayeredButtonPresetDefinition<ModuleSchema>

function scoreboardPreset(): LayeredPreset {
	const leftColor = teamColorExpr('0', FALLBACK_TEAM_COLORS[0])
	const rightColor = teamColorExpr('1', FALLBACK_TEAM_COLORS[1])
	const score = (team: number) => `(${v('teams')}[${team}] ?? {}).Score ?? 0`

	return {
		type: 'layered',
		name: 'Scoreboard',
		keywords: ['score', 'scoreboard', 'teams', 'goals', 'clock'],
		notes: 'Current score on top of each team color, with the match clock at the top.',
		canvas: { decoration: ButtonGraphicsDecorationType.None },
		elements: [
			{ type: 'box', id: 'leftTeam', name: 'Team 0 color', x: 0, y: 0, width: 50, height: 100, color: expr(leftColor) },
			{
				type: 'box',
				id: 'rightTeam',
				name: 'Team 1 color',
				x: 50,
				y: 0,
				width: 50,
				height: 100,
				color: expr(rightColor),
			},
			{
				type: 'box',
				id: 'clockStrip',
				name: 'Clock background',
				x: 0,
				y: 0,
				width: 100,
				height: 26,
				color: 'rgba(0, 0, 0, 0.7)',
			},
			{
				type: 'text',
				id: 'clock',
				name: 'Clock',
				x: 0,
				y: 0,
				width: 100,
				height: 26,
				text: expr(`${v('isOvertime')} ? concat('+', ${v('time')}) : ${v('time')}`),
				fontsize: 85,
				fontsizeAllowShrink: true,
				font: 'companion-mono',
				color: 0xffffff,
				halign: 'center',
				valign: 'center',
			},
			{
				type: 'text',
				id: 'leftScore',
				name: 'Team 0 score',
				x: 0,
				y: 28,
				width: 50,
				height: 72,
				text: expr(score(0)),
				fontsize: 75,
				fontsizeAllowShrink: true,
				weight: 'bold',
				color: expr(readableTextExpr(leftColor)),
				halign: 'center',
				valign: 'center',
			},
			{
				type: 'text',
				id: 'rightScore',
				name: 'Team 1 score',
				x: 50,
				y: 28,
				width: 50,
				height: 72,
				text: expr(score(1)),
				fontsize: 75,
				fontsizeAllowShrink: true,
				weight: 'bold',
				color: expr(readableTextExpr(rightColor)),
				halign: 'center',
				valign: 'center',
			},
		],
		feedbacks: [],
		steps: [],
	}
}

function timerPreset(): LayeredPreset {
	return {
		type: 'layered',
		name: 'Match clock',
		keywords: ['time', 'timer', 'clock', 'overtime'],
		notes: 'Red border below 30 seconds. Orange border and a leading + in overtime.',
		canvas: { decoration: ButtonGraphicsDecorationType.None },
		elements: [
			{
				type: 'box',
				id: 'background',
				name: 'Background',
				x: 0,
				y: 0,
				width: 100,
				height: 100,
				color: 0x000000,
				borderWidth: 0,
				borderColor: COLOR_LOW_TIME,
				borderPosition: 'inside',
			},
			{
				type: 'text',
				id: 'clock',
				name: 'Clock',
				x: 8,
				y: 8,
				width: 84,
				height: 84,
				text: expr(`${v('isOvertime')} ? concat('+', ${v('time')}) : ${v('time')}`),
				fontsize: 45,
				fontsizeAllowShrink: true,
				font: 'companion-mono',
				weight: 'bold',
				color: 0xffffff,
				halign: 'center',
				valign: 'center',
			},
		],
		feedbacks: [
			{
				feedbackId: 'time_below',
				options: { seconds: 30 },
				styleOverrides: [
					{ elementId: 'background', elementProperty: 'borderWidth', override: BORDER_WIDTH },
					{ elementId: 'background', elementProperty: 'borderColor', override: COLOR_LOW_TIME },
				],
			},
			{
				feedbackId: 'overtime',
				options: {},
				styleOverrides: [
					{ elementId: 'background', elementProperty: 'borderWidth', override: BORDER_WIDTH },
					{ elementId: 'background', elementProperty: 'borderColor', override: COLOR_OVERTIME },
				],
			},
		],
		steps: [],
	}
}

function playerPreset(index: number): LayeredPreset {
	const number = index + 1
	const exists = `!!${v('players')}[${index}]`
	const teamColor = teamColorExpr(`${playerFieldExpr(index, 'TeamNum')} ?? 0`, '444444')

	return {
		type: 'layered',
		name: `Player ${number} POV`,
		keywords: ['player', 'pov', 'camera', 'boost', 'spectate'],
		notes:
			`Name and boost of player ${number} in the players variable (sorted by team and shortcut). ` +
			'Press to change the POV to this player. The background turns red while this player has the POV.',
		canvas: { decoration: ButtonGraphicsDecorationType.None },
		elements: [
			{ type: 'box', id: 'background', name: 'Background', x: 0, y: 0, width: 100, height: 100, color: COLOR_IDLE },
			{
				type: 'box',
				id: 'teamStripe',
				name: 'Team color',
				x: 0,
				y: 0,
				width: 100,
				height: 8,
				color: expr(teamColor),
				enabled: expr(exists),
			},
			{
				type: 'text',
				id: 'name',
				name: 'Player name',
				x: 4,
				y: 10,
				width: 92,
				height: 44,
				text: expr(`${playerFieldExpr(index, 'Name')} ?? 'Player ${number}'`),
				fontsize: 60,
				fontsizeAllowShrink: true,
				weight: 'bold',
				color: 0xffffff,
				halign: 'center',
				valign: 'center',
			},
			{
				type: 'text',
				id: 'boost',
				name: 'Boost',
				x: 4,
				y: 54,
				width: 92,
				height: 30,
				text: expr(`${exists} ? concat(round(${playerFieldExpr(index, 'Boost')} ?? 0)) : ''`),
				fontsize: 85,
				font: 'companion-mono',
				color: 0xffffff,
				halign: 'center',
				valign: 'center',
			},
			{
				type: 'box',
				id: 'boostTrack',
				name: 'Boost track',
				x: 0,
				y: 88,
				width: 100,
				height: 12,
				color: 0x3a3a3a,
				enabled: expr(exists),
			},
			{
				type: 'box',
				id: 'boostBar',
				name: 'Boost bar',
				x: 0,
				y: 88,
				width: expr(`min(100, max(0, ${playerFieldExpr(index, 'Boost')} ?? 0))`),
				height: 12,
				color: expr(teamColor),
				enabled: expr(exists),
			},
		],
		feedbacks: [
			{
				feedbackId: 'player_pov',
				options: { player: number },
				styleOverrides: [{ elementId: 'background', elementProperty: 'color', override: COLOR_ON_AIR }],
			},
		],
		steps: [
			{
				down: [
					{
						actionId: 'change_pov',
						options: {
							focus: expr(`concat(${playerFieldExpr(index, 'Shortcut')} ?? '')`),
							perspective: '',
						},
					},
				],
				up: [],
			},
		],
	}
}

function directorPreset(): LayeredPreset {
	return {
		type: 'layered',
		name: 'Director POV',
		keywords: ['director', 'pov', 'camera', 'auto'],
		notes: 'Switches the camera to Director. The background turns red while Director is the last perspective sent.',
		canvas: { decoration: ButtonGraphicsDecorationType.None },
		elements: [
			{ type: 'box', id: 'background', name: 'Background', x: 0, y: 0, width: 100, height: 100, color: COLOR_IDLE },
			{
				type: 'text',
				id: 'label',
				name: 'Label',
				x: 4,
				y: 4,
				width: 92,
				height: 92,
				text: 'DIRECTOR',
				fontsize: 30,
				fontsizeAllowShrink: true,
				weight: 'bold',
				color: 0xffffff,
				halign: 'center',
				valign: 'center',
			},
		],
		feedbacks: [
			{
				feedbackId: 'director_pov',
				options: {},
				styleOverrides: [{ elementId: 'background', elementProperty: 'color', override: COLOR_ON_AIR }],
			},
		],
		steps: [
			{
				down: [{ actionId: 'change_pov', options: { focus: '', perspective: 'Camera_Director' } }],
				up: [],
			},
		],
	}
}

function pausePreset(): LayeredPreset {
	return {
		type: 'layered',
		name: 'Pause / resume match',
		keywords: ['pause', 'resume', 'unpause', 'match'],
		notes: 'Toggles SetMatchPaused. The background turns orange while the match is paused.',
		canvas: { decoration: ButtonGraphicsDecorationType.None },
		elements: [
			{ type: 'box', id: 'background', name: 'Background', x: 0, y: 0, width: 100, height: 100, color: COLOR_IDLE },
			{
				type: 'text',
				id: 'label',
				name: 'Label',
				x: 4,
				y: 4,
				width: 92,
				height: 92,
				text: expr(`${v('isPaused')} ? 'RESUME' : 'PAUSE'`),
				fontsize: 30,
				fontsizeAllowShrink: true,
				weight: 'bold',
				color: 0xffffff,
				halign: 'center',
				valign: 'center',
			},
		],
		feedbacks: [
			{
				feedbackId: 'match_paused',
				options: {},
				styleOverrides: [
					{ elementId: 'background', elementProperty: 'color', override: COLOR_PAUSED },
					{ elementId: 'label', elementProperty: 'color', override: 0x000000 },
				],
			},
		],
		steps: [
			{
				down: [{ actionId: 'set_match_paused', options: { mode: 'toggle' } }],
				up: [],
			},
		],
	}
}

export function UpdatePresets(self: ModuleInstance): void {
	const presets: CompanionPresetDefinitions<ModuleSchema> = {
		scoreboard: scoreboardPreset(),
		timer: timerPreset(),
		director_pov: directorPreset(),
		match_pause: pausePreset(),
	}
	const playerIds: string[] = []
	for (let index = 0; index < PLAYER_PRESETS; index++) {
		const id = `player_${index + 1}_pov`
		presets[id] = playerPreset(index)
		playerIds.push(id)
	}

	const structure: CompanionPresetSection<ModuleSchema>[] = [
		{
			id: 'match',
			name: 'Match',
			definitions: [
				{
					id: 'match_info',
					name: 'Score and clock',
					type: 'simple',
					presets: ['scoreboard', 'timer'],
				},
				{
					id: 'match_control',
					name: 'Match control',
					type: 'simple',
					presets: ['match_pause'],
				},
			],
		},
		{
			id: 'camera',
			name: 'Camera',
			definitions: [
				{
					id: 'players',
					name: 'Players',
					description: 'Players are sorted by team and spectator shortcut, as in the players variable.',
					type: 'simple',
					presets: playerIds,
				},
				{
					id: 'director',
					name: 'Director',
					type: 'simple',
					presets: ['director_pov'],
				},
			],
		},
	]

	self.setPresetDefinitions(structure, presets)
}
