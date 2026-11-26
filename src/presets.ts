import {
	ButtonGraphicsDecorationType,
	type CompanionLayeredButtonPresetDefinition,
	type CompanionPresetDefinitions,
	type CompanionPresetSection,
} from '@companion-module/base'
import type ModuleInstance from './main.js'
import type { ModuleSchema } from './main.js'
import { SERIES_CONTROL_LABEL, type Side } from './series.js'
import { STATS_SETUP_SLOTS } from './stats-setup.js'

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

const COLOR_TIMEOUT = 0xd97706
const COLOR_AVAILABLE = 0x166534
const SIDE_COLOR_INDEX: Record<Side, 0 | 1> = { blue: 0, orange: 1 }

/** A text element covering a box of the button. */
function textElement(
	id: string,
	name: string,
	box: { x: number; y: number; width: number; height: number },
	text: string | { isExpression: true; value: string },
	fontsize: number,
	extra: Partial<{ font: string; weight: 'bold'; color: number | { isExpression: true; value: string } }> = {},
) {
	return {
		type: 'text' as const,
		id,
		name,
		...box,
		text,
		fontsize,
		fontsizeAllowShrink: true,
		color: 0xffffff,
		halign: 'center' as const,
		valign: 'center' as const,
		...extra,
	}
}

function seriesScorePreset(): LayeredPreset {
	const leftColor = teamColorExpr('0', FALLBACK_TEAM_COLORS[0])
	const rightColor = teamColorExpr('1', FALLBACK_TEAM_COLORS[1])
	const game = v('seriesCurrentMatch')

	return {
		type: 'layered',
		name: 'Series score',
		keywords: ['series', 'best of', 'wins', 'games', 'esports'],
		notes: 'Series wins of each team on top of its color, with the game number at the top.',
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
				id: 'strip',
				name: 'Game background',
				x: 0,
				y: 0,
				width: 100,
				height: 26,
				color: 'rgba(0, 0, 0, 0.7)',
			},
			textElement(
				'game',
				'Game number',
				{ x: 0, y: 0, width: 100, height: 26 },
				expr(`${v('seriesStatus')} == 'finished' ? 'FINAL' : concat('GAME ', ${game}, '/', ${v('seriesGames')})`),
				75,
				{ font: 'companion-mono' },
			),
			textElement(
				'leftWins',
				'Team 0 wins',
				{ x: 0, y: 28, width: 50, height: 72 },
				expr(`${v('seriesBlueWins')}`),
				75,
				{
					weight: 'bold',
					color: expr(readableTextExpr(leftColor)),
				},
			),
			textElement(
				'rightWins',
				'Team 1 wins',
				{ x: 50, y: 28, width: 50, height: 72 },
				expr(`${v('seriesOrangeWins')}`),
				75,
				{ weight: 'bold', color: expr(readableTextExpr(rightColor)) },
			),
		],
		feedbacks: [],
		steps: [],
	}
}

function teamStatPreset(
	name: string,
	stat: 'PossessionPercent' | 'ShootingPercent',
	keywords: string[],
): LayeredPreset {
	const leftColor = teamColorExpr('0', FALLBACK_TEAM_COLORS[0])
	const rightColor = teamColorExpr('1', FALLBACK_TEAM_COLORS[1])
	const value = (side: Side) => expr(`concat(round(${v(`${side}${stat}`)}), '%')`)

	return {
		type: 'layered',
		name,
		keywords,
		notes: `${name} of each team in the current match, on top of its color.`,
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
				id: 'strip',
				name: 'Label background',
				x: 0,
				y: 0,
				width: 100,
				height: 26,
				color: 'rgba(0, 0, 0, 0.7)',
			},
			textElement('label', 'Label', { x: 0, y: 0, width: 100, height: 26 }, name.toUpperCase(), 60),
			textElement('left', 'Team 0 value', { x: 0, y: 28, width: 50, height: 72 }, value('blue'), 45, {
				weight: 'bold',
				color: expr(readableTextExpr(leftColor)),
			}),
			textElement('right', 'Team 1 value', { x: 50, y: 28, width: 50, height: 72 }, value('orange'), 45, {
				weight: 'bold',
				color: expr(readableTextExpr(rightColor)),
			}),
		],
		feedbacks: [],
		steps: [],
	}
}

function callTimeoutPreset(side: Side): LayeredPreset {
	const Side = side === 'blue' ? 'Blue' : 'Orange'
	const teamColor = teamColorExpr(String(SIDE_COLOR_INDEX[side]), FALLBACK_TEAM_COLORS[SIDE_COLOR_INDEX[side]])

	return {
		type: 'layered',
		name: `${Side} timeout`,
		keywords: ['timeout', 'series', 'break', side],
		notes:
			`Calls a timeout for the team on the ${Side} side, with its timeouts left. ` +
			'Green while it can call one, orange while its timeout is running.',
		canvas: { decoration: ButtonGraphicsDecorationType.None },
		elements: [
			{ type: 'box', id: 'background', name: 'Background', x: 0, y: 0, width: 100, height: 100, color: COLOR_IDLE },
			{ type: 'box', id: 'teamStripe', name: 'Team color', x: 0, y: 0, width: 100, height: 8, color: expr(teamColor) },
			textElement('label', 'Label', { x: 4, y: 10, width: 92, height: 26 }, 'TIMEOUT', 60, { weight: 'bold' }),
			textElement('team', 'Team name', { x: 4, y: 36, width: 92, height: 30 }, expr(`${v(`series${Side}Name`)}`), 50),
			textElement(
				'left',
				'Timeouts left',
				{ x: 4, y: 66, width: 92, height: 30 },
				expr(`concat(${v(`series${Side}TimeoutsLeft`)}, ' / ', ${v('timeoutsPerTeam')})`),
				60,
				{ font: 'companion-mono' },
			),
		],
		feedbacks: [
			{
				feedbackId: 'can_call_timeout',
				options: { team: side },
				styleOverrides: [{ elementId: 'background', elementProperty: 'color', override: COLOR_AVAILABLE }],
			},
			{
				feedbackId: 'timeout_active',
				options: { team: side },
				styleOverrides: [
					{ elementId: 'background', elementProperty: 'color', override: COLOR_TIMEOUT },
					{ elementId: 'label', elementProperty: 'color', override: 0x000000 },
					{ elementId: 'team', elementProperty: 'color', override: 0x000000 },
					{ elementId: 'left', elementProperty: 'color', override: 0x000000 },
				],
			},
		],
		steps: [{ down: [{ actionId: 'call_timeout', options: { team: side, name: '' } }], up: [] }],
	}
}

function endTimeoutPreset(): LayeredPreset {
	return {
		type: 'layered',
		name: 'Timeout clock / end timeout',
		keywords: ['timeout', 'series', 'clock', 'end'],
		notes:
			'Shows the team on timeout and the time left (or the time since it was called, without a time limit). ' +
			'Press to end the timeout. Orange while a timeout is running.',
		canvas: { decoration: ButtonGraphicsDecorationType.None },
		elements: [
			{ type: 'box', id: 'background', name: 'Background', x: 0, y: 0, width: 100, height: 100, color: COLOR_IDLE },
			textElement(
				'team',
				'Team',
				{ x: 4, y: 4, width: 92, height: 30 },
				expr(`${v('timeoutActive')} ? ${v('timeoutTeam')} : 'TIMEOUT'`),
				50,
				{ weight: 'bold' },
			),
			textElement(
				'clock',
				'Clock',
				{ x: 4, y: 34, width: 92, height: 40 },
				expr(
					`${v('timeoutActive')} ? (${v('timeoutRemaining')} != '' ? ${v('timeoutRemaining')} : ${v('timeoutElapsed')}) : '--:--'`,
				),
				85,
				{ font: 'companion-mono', weight: 'bold' },
			),
			textElement(
				'hint',
				'Hint',
				{ x: 4, y: 74, width: 92, height: 22 },
				expr(`${v('timeoutActive')} ? 'PRESS TO END' : ''`),
				40,
			),
		],
		feedbacks: [
			{
				feedbackId: 'timeout_active',
				options: { team: 'any' },
				styleOverrides: [
					{ elementId: 'background', elementProperty: 'color', override: COLOR_TIMEOUT },
					{ elementId: 'team', elementProperty: 'color', override: 0x000000 },
					{ elementId: 'clock', elementProperty: 'color', override: 0x000000 },
					{ elementId: 'hint', elementProperty: 'color', override: 0x000000 },
				],
			},
		],
		steps: [{ down: [{ actionId: 'end_timeout', options: {} }], up: [] }],
	}
}

function seriesControlPreset(mode: 'start' | 'restart' | 'stop' | 'removeLast'): LayeredPreset {
	const label = SERIES_CONTROL_LABEL[mode].toUpperCase()
	const status = mode === 'stop' ? 'stopped' : 'running'
	const notes = {
		start:
			'Starts a new series with the connection options: clears the stored matches. Green while a series is running.',
		restart: 'Starts the series again: clears the stored matches. Green while a series is running.',
		stop: 'Stops recording the series (and the automatic start). Red while the series is stopped.',
		removeLast:
			'Takes back the last recorded match, for example one that should not count. Green while a series is running.',
	}[mode]
	return {
		type: 'layered',
		name: SERIES_CONTROL_LABEL[mode],
		keywords: ['series', mode, 'esports'],
		notes: `${notes} Needs two presses to confirm.`,
		canvas: { decoration: ButtonGraphicsDecorationType.None },
		elements: [
			{ type: 'box', id: 'background', name: 'Background', x: 0, y: 0, width: 100, height: 100, color: COLOR_IDLE },
			textElement(
				'label',
				'Label',
				{ x: 4, y: 4, width: 92, height: 92 },
				expr(`${v('seriesControlArmed')} == '${mode}' ? 'PRESS AGAIN' : '${label}'`),
				30,
				{ weight: 'bold' },
			),
		],
		feedbacks: [
			{
				feedbackId: 'series_status',
				options: { status },
				styleOverrides: [
					{
						elementId: 'background',
						elementProperty: 'color',
						override: mode === 'stop' ? COLOR_ON_AIR : COLOR_AVAILABLE,
					},
				],
			},
			// Last, so it wins over the status color while the button waits for confirmation.
			{
				feedbackId: 'series_control_armed',
				options: { mode },
				styleOverrides: [
					{ elementId: 'background', elementProperty: 'color', override: COLOR_TIMEOUT },
					{ elementId: 'label', elementProperty: 'color', override: 0x000000 },
				],
			},
		],
		steps: [
			{
				down: [
					{
						actionId: 'series_control',
						options: { mode, confirm: true, confirmSeconds: 3 },
					},
				],
				up: [],
			},
		],
	}
}

// ---------------------------------------------------------------------------
// Broadcast suite
// ---------------------------------------------------------------------------

type SuiteActionStep = { actionId: string; options: Record<string, unknown> }
type SuiteFeedback = { feedbackId: string; options: Record<string, unknown>; color: number; textColor?: number }

/** A suite button: a label (text or expression) on a dark background, an action, and a feedback that colors it. */
function suitePreset(
	name: string,
	keywords: string[],
	notes: string,
	text: string | { isExpression: true; value: string },
	actions: SuiteActionStep[],
	feedback?: SuiteFeedback | SuiteFeedback[],
	fontsize = 30,
): LayeredPreset {
	const feedbacks = feedback === undefined ? [] : Array.isArray(feedback) ? feedback : [feedback]
	return {
		type: 'layered',
		name,
		keywords: ['suite', ...keywords],
		notes,
		canvas: { decoration: ButtonGraphicsDecorationType.None },
		elements: [
			{ type: 'box', id: 'background', name: 'Background', x: 0, y: 0, width: 100, height: 100, color: COLOR_IDLE },
			textElement('label', 'Label', { x: 4, y: 4, width: 92, height: 92 }, text, fontsize, { weight: 'bold' }),
		],
		feedbacks: feedbacks.map((entry) => ({
			feedbackId: entry.feedbackId,
			options: entry.options,
			styleOverrides: [
				{ elementId: 'background', elementProperty: 'color', override: entry.color },
				...(entry.textColor === undefined
					? []
					: [{ elementId: 'label', elementProperty: 'color', override: entry.textColor }]),
			],
		})),
		steps: [{ down: actions, up: [] }],
	} as unknown as LayeredPreset
}

function suitePresets(): Record<string, LayeredPreset> {
	const stat = (key: string, label: string) =>
		suitePreset(
			`Show ${label}`,
			['stats', label.toLowerCase()],
			`Shows ${label} alone on the HUD of the suite. Red while it is on screen.`,
			label.toUpperCase(),
			[{ actionId: 'suite_stats_show', options: { types: [key], scope: 'keep', rotate: 'keep', interval: 0 } }],
			{ feedbackId: 'suite_stat_on_screen', options: { stat: key }, color: COLOR_ON_AIR },
		)
	return {
		suite_swap_teams: suitePreset(
			'Swap teams (fix)',
			['swap', 'teams', 'sides', 'fix'],
			'The teams were the wrong way round: they change sides and the matches already played move with them, so the score of each side stays.',
			'SWAP\nTEAMS',
			[{ actionId: 'suite_swap', options: { what: 'teams' } }],
		),
		suite_swap_colors: suitePreset(
			'Swap colors',
			['swap', 'colors'],
			'Swaps the colors of both teams on the HUD (only the colors).',
			'SWAP\nCOLORS',
			[{ actionId: 'suite_swap', options: { what: 'sides' } }],
		),
		suite_stats_team_left: suitePreset(
			'Left team stats',
			['stats', 'team', 'left', 'blue'],
			'Shows the selected stats of the left (blue) team alone on the match HUD. Red while they are on screen.',
			expr(`concat(${v('suiteLeftShort')}, '\\nSTATS')`),
			[{ actionId: 'suite_stats_team', options: { team: 'left', scope: 'keep' } }],
			{ feedbackId: 'suite_stats_team', options: { team: 'left' }, color: COLOR_ON_AIR },
		),
		suite_stats_team_right: suitePreset(
			'Right team stats',
			['stats', 'team', 'right', 'orange'],
			'Shows the selected stats of the right (orange) team alone on the match HUD. Red while they are on screen.',
			expr(`concat(${v('suiteRightShort')}, '\\nSTATS')`),
			[{ actionId: 'suite_stats_team', options: { team: 'right', scope: 'keep' } }],
			{ feedbackId: 'suite_stats_team', options: { team: 'right' }, color: COLOR_ON_AIR },
		),
		suite_stats_player: suitePreset(
			'Player stats',
			['stats', 'player'],
			'Shows the stats of one player on the match HUD. Edit the action to type the player name. Red while player stats are on screen.',
			'PLAYER\nSTATS',
			[{ actionId: 'suite_stats_player', options: { player: '', scope: 'keep' } }],
			{ feedbackId: 'suite_stats_mode', options: { mode: 'player' }, color: COLOR_ON_AIR },
		),
		suite_stats_versus: suitePreset(
			'1 vs 1 stats',
			['stats', 'player', 'versus'],
			'Compares two players on the match HUD. Edit the action to type both names. Red while 1 vs 1 stats are on screen.',
			'1 VS 1',
			[{ actionId: 'suite_stats_versus', options: { player1: '', player2: '', scope: 'keep' } }],
			{ feedbackId: 'suite_stats_mode', options: { mode: 'versus' }, color: COLOR_ON_AIR },
		),
		suite_stats_toggle: suitePreset(
			'Stats on the HUD',
			['stats', 'hud'],
			'Shows or hides the stats chosen in the panel. Red while they are on screen.',
			expr(`${v('suiteStatsVisible')} ? concat('STATS\\n', ${v('suiteStatsCurrent')}) : 'STATS'`),
			[{ actionId: 'suite_stats', options: { mode: 'toggle' } }],
			{ feedbackId: 'suite_visible', options: { section: 'stats' }, color: COLOR_ON_AIR },
		),
		suite_stats_next: suitePreset('Next stat', ['stats', 'next'], 'Shows the next of the chosen stats.', 'NEXT\nSTAT', [
			{ actionId: 'suite_stats', options: { mode: 'next' } },
		]),
		suite_stat_goals: stat('goals', 'Goals'),
		suite_stat_shots: stat('shots', 'Shots'),
		suite_stat_saves: stat('saves', 'Saves'),
		suite_stat_possession: stat('possession', 'Possession'),
		suite_stat_boost: stat('boostPerMinute', 'Boost per minute'),
		suite_stat_demos: stat('demos', 'Demos'),
		suite_timer: suitePreset(
			'Break timer start / pause',
			['timer', 'break', 'clock'],
			'Shows the break timer of the suite. Press to start or pause it. Green while it runs.',
			expr(`concat(${v('suiteTimerLabel')}, '\\n', ${v('suiteTimer')})`),
			[{ actionId: 'suite_timer', options: { mode: 'toggle' } }],
			{ feedbackId: 'suite_timer_running', options: {}, color: 0x15803d },
		),
		suite_timer_5: suitePreset(
			'Break timer 5 min',
			['timer', 'break'],
			'Sets the break timer to 5 minutes and starts it.',
			'5 MIN\nBREAK',
			[{ actionId: 'suite_timer_set', options: { minutes: 5, mode: 'countdown', start: true } }],
		),
		suite_timer_plus: suitePreset(
			'Break timer +1 min',
			['timer', 'break'],
			'Adds one minute to the break timer.',
			'+1 MIN',
			[{ actionId: 'suite_timer_add', options: { seconds: 60 } }],
		),
		suite_scorebug: suitePreset(
			'Scorebug on / off',
			['scorebug', 'hud'],
			'Shows or hides the scorebug of the suite HUD. Red while it is visible.',
			'SCOREBUG',
			[{ actionId: 'suite_visibility', options: { section: 'scorebug', mode: 'toggle' } }],
			{ feedbackId: 'suite_visible', options: { section: 'scorebug' }, color: COLOR_ON_AIR },
		),
		suite_casters: suitePreset(
			'Casters on / off',
			['casters', 'hud'],
			'Shows or hides the casters on the suite HUD. Red while they are visible.',
			'CASTERS',
			[{ actionId: 'suite_visibility', options: { section: 'casters', mode: 'toggle' } }],
			{ feedbackId: 'suite_visible', options: { section: 'casters' }, color: COLOR_ON_AIR },
		),
	}
}

const COLOR_SETUP = 0x1d4ed8
const COLOR_SELECTED = 0x15803d
const PAGE_BACK_NOTE =
	'To go back to the page where Setup stats was pressed, add the internal action "Surface: Set to page" with the page "Back" to this button.'

/** Presets of the stats setup. Their ids, in order: start, title, choices 1-12, back, scope, done, cancel. */
function statsSetupPresets(): Record<string, LayeredPreset> {
	const presets: Record<string, LayeredPreset> = {
		suite_setup_start: suitePreset(
			'Setup stats',
			['stats', 'setup', 'wizard', 'choose'],
			'Opens the stats setup: kind (team, 2 teams, player, player vs player), then the team or players, then the stats. ' +
				'Put the other Stats setup buttons on a page of their own, and add the internal action ' +
				'"Surface: Set to page" with that page to this button. Blue while the setup is open.',
			'SETUP\nSTATS',
			[{ actionId: 'suite_setup', options: { mode: 'start' } }],
			{ feedbackId: 'suite_setup_active', options: {}, color: COLOR_SETUP },
		),
		suite_setup_title: suitePreset(
			'Stats setup: step',
			['stats', 'setup'],
			'What to choose now, and what was chosen so far.',
			expr(`concat(${v('suiteSetupTitle')}, '\\n', ${v('suiteSetupSummary')})`),
			[],
			{ feedbackId: 'suite_setup_active', options: {}, color: COLOR_SETUP },
			24,
		),
	}
	for (let slot = 1; slot <= STATS_SETUP_SLOTS; slot++) {
		presets[`suite_setup_choice_${slot}`] = suitePreset(
			`Stats setup: choice ${slot}`,
			['stats', 'setup', 'choice'],
			'One of the choices of the current step of the stats setup. Green when selected, dark when empty.',
			expr(v(`suiteSetupSlot${slot}`)),
			[{ actionId: 'suite_setup_choice', options: { slot } }],
			[
				{ feedbackId: 'suite_setup_selected', options: { slot }, color: COLOR_SELECTED },
				{ feedbackId: 'suite_setup_unused', options: { slot }, color: 0x000000, textColor: 0x404040 },
			],
			24,
		)
	}
	presets.suite_setup_back = suitePreset(
		'Stats setup: back',
		['stats', 'setup', 'back'],
		'Goes to the previous step of the stats setup (from the first one, closes it).',
		'BACK',
		[{ actionId: 'suite_setup', options: { mode: 'back' } }],
	)
	presets.suite_setup_scope = suitePreset(
		'Stats setup: match / series',
		['stats', 'setup', 'scope', 'series', 'match'],
		'Stats of the current match or of the whole series.',
		expr(`${v('suiteSetupScope')} == 'series' ? 'DATA\\nSERIES' : 'DATA\\nMATCH'`),
		[{ actionId: 'suite_setup', options: { mode: 'scope' } }],
	)
	presets.suite_setup_done = suitePreset(
		'Stats setup: done',
		['stats', 'setup', 'done', 'apply'],
		`Sends the chosen stats to the suite: they show on the match HUD. ${PAGE_BACK_NOTE}`,
		'DONE',
		[{ actionId: 'suite_setup', options: { mode: 'done' } }],
		{ feedbackId: 'suite_setup_active', options: {}, color: COLOR_SELECTED },
	)
	presets.suite_setup_cancel = suitePreset(
		'Stats setup: cancel',
		['stats', 'setup', 'cancel'],
		`Closes the stats setup without changing anything. ${PAGE_BACK_NOTE}`,
		'CANCEL',
		[{ actionId: 'suite_setup', options: { mode: 'cancel' } }],
	)
	return presets
}

function seriesPausePreset(): LayeredPreset {
	return {
		type: 'layered',
		name: 'Pause / resume series',
		keywords: ['series', 'pause', 'resume', 'showmatch', 'esports'],
		notes:
			'While the series is paused, the matches that end are not recorded (for example a showmatch). Orange while paused.',
		canvas: { decoration: ButtonGraphicsDecorationType.None },
		elements: [
			{ type: 'box', id: 'background', name: 'Background', x: 0, y: 0, width: 100, height: 100, color: COLOR_IDLE },
			textElement(
				'label',
				'Label',
				{ x: 4, y: 4, width: 92, height: 92 },
				expr(`${v('seriesPaused')} ? 'SERIES PAUSED' : 'PAUSE SERIES'`),
				30,
				{ weight: 'bold' },
			),
		],
		feedbacks: [
			{
				feedbackId: 'series_status',
				options: { status: 'paused' },
				styleOverrides: [
					{ elementId: 'background', elementProperty: 'color', override: COLOR_PAUSED },
					{ elementId: 'label', elementProperty: 'color', override: 0x000000 },
				],
			},
		],
		steps: [{ down: [{ actionId: 'series_pause', options: { mode: 'toggle' } }], up: [] }],
	}
}

function seriesWinPreset(side: Side, delta: 1 | -1): LayeredPreset {
	const Side = side === 'blue' ? 'Blue' : 'Orange'
	const teamColor = teamColorExpr(String(SIDE_COLOR_INDEX[side]), FALLBACK_TEAM_COLORS[SIDE_COLOR_INDEX[side]])
	const sign = delta > 0 ? '+1' : '−1'
	return {
		type: 'layered',
		name: `${Side} ${sign} win`,
		keywords: ['series', 'wins', 'score', 'manual', side],
		notes: `${delta > 0 ? 'Adds a series win to' : 'Removes a series win from'} the team on the ${Side} side, by hand.`,
		canvas: { decoration: ButtonGraphicsDecorationType.None },
		elements: [
			{ type: 'box', id: 'background', name: 'Background', x: 0, y: 0, width: 100, height: 100, color: COLOR_IDLE },
			{ type: 'box', id: 'teamStripe', name: 'Team color', x: 0, y: 0, width: 100, height: 8, color: expr(teamColor) },
			textElement('team', 'Team name', { x: 4, y: 10, width: 92, height: 30 }, expr(`${v(`series${Side}Name`)}`), 50),
			textElement('sign', 'Change', { x: 4, y: 40, width: 92, height: 28 }, `${sign} WIN`, 60, { weight: 'bold' }),
			textElement(
				'wins',
				'Wins',
				{ x: 4, y: 68, width: 92, height: 28 },
				expr(`concat(${v(`series${Side}Wins`)})`),
				60,
				{ font: 'companion-mono' },
			),
		],
		feedbacks: [],
		steps: [
			{
				down: [
					{
						actionId: 'series_wins',
						options: { team: side, name: '', mode: delta > 0 ? 'add' : 'remove', value: 1 },
					},
				],
				up: [],
			},
		],
	}
}

function swapTeamNamesPreset(): LayeredPreset {
	return {
		type: 'layered',
		name: 'Swap team names',
		keywords: ['series', 'teams', 'names', 'swap', 'sides'],
		notes: 'Swaps the team names set by hand for Blue and Orange, when the teams switch sides.',
		canvas: { decoration: ButtonGraphicsDecorationType.None },
		elements: [
			{ type: 'box', id: 'background', name: 'Background', x: 0, y: 0, width: 100, height: 100, color: COLOR_IDLE },
			textElement('label', 'Label', { x: 4, y: 4, width: 92, height: 30 }, 'SWAP NAMES', 50, { weight: 'bold' }),
			textElement(
				'names',
				'Names',
				{ x: 4, y: 36, width: 92, height: 60 },
				expr(`concat(${v('seriesBlueName')}, '\\n', ${v('seriesOrangeName')})`),
				40,
			),
		],
		feedbacks: [],
		steps: [{ down: [{ actionId: 'set_team_names', options: { mode: 'swap', blue: '', orange: '' } }], up: [] }],
	}
}

export function UpdatePresets(self: ModuleInstance): void {
	const presets: CompanionPresetDefinitions<ModuleSchema> = {
		scoreboard: scoreboardPreset(),
		timer: timerPreset(),
		director_pov: directorPreset(),
		match_pause: pausePreset(),
		possession: teamStatPreset('Possession', 'PossessionPercent', ['possession', 'ball', 'stats']),
		shooting: teamStatPreset('Shooting', 'ShootingPercent', ['shooting', 'shots', 'goals', 'stats']),
		series_score: seriesScorePreset(),
		timeout_blue: callTimeoutPreset('blue'),
		timeout_orange: callTimeoutPreset('orange'),
		timeout_end: endTimeoutPreset(),
		series_start: seriesControlPreset('start'),
		series_restart: seriesControlPreset('restart'),
		series_stop: seriesControlPreset('stop'),
		...suitePresets(),
		...statsSetupPresets(),
		series_remove_last: seriesControlPreset('removeLast'),
		series_pause: seriesPausePreset(),
		series_blue_win: seriesWinPreset('blue', 1),
		series_orange_win: seriesWinPreset('orange', 1),
		series_blue_unwin: seriesWinPreset('blue', -1),
		series_orange_unwin: seriesWinPreset('orange', -1),
		series_swap_names: swapTeamNamesPreset(),
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
				{
					id: 'match_stats',
					name: 'Team stats',
					type: 'simple',
					presets: ['possession', 'shooting'],
				},
			],
		},
		{
			id: 'series',
			name: 'Series',
			definitions: [
				{
					id: 'series_info',
					name: 'Series score',
					type: 'simple',
					presets: ['series_score'],
				},
				{
					id: 'series_timeouts',
					name: 'Timeouts',
					description: 'Set "Timeouts per team" in the connection config to use them.',
					type: 'simple',
					presets: ['timeout_blue', 'timeout_orange', 'timeout_end'],
				},
				{
					id: 'series_control',
					name: 'Series control',
					description: 'Work with the game and with the Broadcast suite server (sent to the server).',
					type: 'simple',
					presets: ['series_start', 'series_restart', 'series_stop', 'series_remove_last', 'series_pause'],
				},
				{
					id: 'series_manual',
					name: 'Wins and team names',
					type: 'simple',
					presets: [
						'series_blue_win',
						'series_orange_win',
						'series_blue_unwin',
						'series_orange_unwin',
						'series_swap_names',
					],
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
		{
			id: 'suite',
			name: 'Broadcast suite',
			definitions: [
				{
					id: 'suite_teams',
					name: 'Teams',
					description: 'Left is always blue and right orange.',
					type: 'simple',
					presets: ['suite_swap_teams', 'suite_swap_colors'],
				},
				{
					id: 'suite_stats',
					name: 'Stats on the HUD',
					type: 'simple',
					presets: [
						'suite_stats_toggle',
						'suite_stats_team_left',
						'suite_stats_team_right',
						'suite_stats_player',
						'suite_stats_versus',
						'suite_stats_next',
						'suite_stat_goals',
						'suite_stat_shots',
						'suite_stat_saves',
						'suite_stat_possession',
						'suite_stat_boost',
						'suite_stat_demos',
					],
				},
				{
					id: 'suite_setup',
					name: 'Stats setup',
					description:
						'Step-by-step stats picker: put Setup stats where you want it, and the other buttons on a page of their own. ' +
						'Add the page jumps with the internal action "Surface: Set to page" (see the help).',
					type: 'simple',
					presets: Object.keys(statsSetupPresets()),
				},
				{
					id: 'suite_scenes',
					name: 'Timer and HUD',
					type: 'simple',
					presets: ['suite_timer', 'suite_timer_5', 'suite_timer_plus', 'suite_scorebug', 'suite_casters'],
				},
			],
		},
	]

	self.setPresetDefinitions(structure, presets)
}
