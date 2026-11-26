import type {
	CompanionActionDefinitions,
	CompanionFeedbackDefinitions,
	CompanionVariableDefinitions,
} from '@companion-module/base'
import type ModuleInstance from './main.js'
import type { ModuleSchema } from './main.js'
import { sortPlayers } from './state.js'
import {
	STAT_LABELS,
	suiteTeamNames,
	type Slot,
	type StatKey,
	type StatsMode,
	type SuiteCommand,
	type SuiteState,
} from './suite.js'

/**
 * Stats setup (Broadcast suite mode): a step-by-step picker for the stats on the match HUD, made of a few buttons
 * whose labels change with each step:
 *
 * 1. Kind: one team, both teams, one player, or player vs player.
 * 2. Target: the team, the player, or the two players (skipped for both teams).
 * 3. Stats: one or several. **Done** sends them to the suite.
 *
 * Companion doesn't let a module change pages, so the steps all happen on the same buttons. The page jumps (to the
 * setup page and back) are Companion's own actions, added to the Setup stats and Done buttons (see HELP.md).
 */

/** Number of choice buttons: enough for the 12 stats and 8 players (4 vs 4). */
export const STATS_SETUP_SLOTS = 12

export type StatsSetupStep = 'idle' | 'kind' | 'target' | 'stats'

const STAT_KEYS = Object.keys(STAT_LABELS) as StatKey[]
/** Possession is only per team. */
const PLAYER_STAT_KEYS = STAT_KEYS.filter((key) => key !== 'possession')

const KINDS: { mode: StatsMode; label: string }[] = [
	{ mode: 'team', label: 'TEAM' },
	{ mode: 'teams', label: '2 TEAMS' },
	{ mode: 'player', label: 'PLAYER' },
	{ mode: 'versus', label: 'PLAYER VS PLAYER' },
]

const KIND_LABEL: Record<StatsMode, string> = {
	team: 'Team',
	teams: '2 teams',
	player: 'Player',
	versus: 'Player vs player',
}

type SlotNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12
type SlotVariables = { [K in SlotNumber as `suiteSetupSlot${K}`]: string }

export type StatsSetupVariablesSchema = SlotVariables & {
	/** The stats setup is open. */
	suiteSetupActive: boolean
	/** `kind`, `target` or `stats`; empty while closed. */
	suiteSetupStep: string
	/** What to choose now. */
	suiteSetupTitle: string
	/** What was chosen so far. */
	suiteSetupSummary: string
	/** `match` or `series`. */
	suiteSetupScope: string
}

const SLOT_NUMBERS = Array.from({ length: STATS_SETUP_SLOTS }, (_, index) => (index + 1) as SlotNumber)

export const STATS_SETUP_VARIABLE_DEFINITIONS: CompanionVariableDefinitions<StatsSetupVariablesSchema> = {
	suiteSetupActive: { name: 'Stats setup: open' },
	suiteSetupStep: { name: 'Stats setup: step (kind, target, stats)' },
	suiteSetupTitle: { name: 'Stats setup: what to choose now' },
	suiteSetupSummary: { name: 'Stats setup: what was chosen so far' },
	suiteSetupScope: { name: 'Stats setup: data of the match or the series' },
	...(Object.fromEntries(
		SLOT_NUMBERS.map((slot) => [`suiteSetupSlot${slot}`, { name: `Stats setup: label of choice ${slot}` }]),
	) as CompanionVariableDefinitions<SlotVariables>),
}

interface Choice {
	label: string
	selected: boolean
	press: () => void
}

interface StatsSetupPlayer {
	name: string
	slot: Slot
}

/** State of the stats setup. One for the whole connection: every surface shares it. */
export class StatsSetup {
	step: StatsSetupStep = 'idle'
	kind: StatsMode | undefined
	team: Slot | undefined
	players: string[] = []
	types: StatKey[] = []
	scope: 'match' | 'series' = 'match'
	readonly #self: ModuleInstance

	constructor(self: ModuleInstance) {
		this.#self = self
	}

	get #state(): SuiteState | undefined {
		return this.#self.suite?.state
	}

	/** Opens the setup on its first step, with the scope and stats on the HUD now. */
	start(): void {
		const stats = this.#state?.config.stats
		this.step = 'kind'
		this.kind = undefined
		this.team = undefined
		this.players = []
		this.types = [...(stats?.types ?? [])]
		this.scope = stats?.scope ?? 'match'
		this.#changed()
	}

	/** Goes to the previous step, or closes the setup from the first one. */
	back(): void {
		if (this.step === 'stats') {
			this.step = this.kind === 'teams' ? 'kind' : 'target'
			if (this.kind === 'versus') this.players = this.players.slice(0, 1)
		} else if (this.step === 'target') {
			this.step = 'kind'
			this.players = []
			this.team = undefined
		} else {
			this.step = 'idle'
		}
		this.#changed()
	}

	cancel(): void {
		this.step = 'idle'
		this.#changed()
	}

	toggleScope(): void {
		this.scope = this.scope === 'match' ? 'series' : 'match'
		this.#changed()
	}

	press(slot: number): void {
		this.#choices()[slot - 1]?.press()
	}

	/** Sends the chosen stats to the suite and closes the setup. Returns `false` when there is nothing to send yet. */
	done(): boolean {
		if (this.step !== 'stats' || !this.kind) {
			if (this.step !== 'idle') this.#self.log('warn', 'Stats setup: finish the steps first')
			return false
		}
		const types = this.#available().filter((key) => this.types.includes(key))
		if (types.length === 0) {
			this.#self.log('warn', 'Stats setup: choose at least one stat')
			return false
		}
		const scope = this.scope
		let cmd: SuiteCommand
		if (this.kind === 'teams') cmd = { type: 'stats.show', types, scope }
		else if (this.kind === 'team') cmd = { type: 'stats.showTeam', slot: this.team ?? 0, types, scope }
		else if (this.kind === 'player') cmd = { type: 'stats.showPlayer', player: this.players[0] ?? '', types, scope }
		else cmd = { type: 'stats.showVersus', players: [this.players[0] ?? '', this.players[1] ?? ''], types, scope }
		if (!this.#self.sendSuiteCommand(cmd)) return false
		this.step = 'idle'
		this.#changed()
		return true
	}

	/** `true` when choice `slot` (from 1) is selected. */
	selected(slot: number): boolean {
		return this.#choices()[slot - 1]?.selected ?? false
	}

	/** `true` when choice `slot` (from 1) has something to choose. */
	used(slot: number): boolean {
		return this.#choices()[slot - 1] !== undefined
	}

	variables(): StatsSetupVariablesSchema {
		const choices = this.#choices()
		const slots = Object.fromEntries(
			SLOT_NUMBERS.map((slot) => [`suiteSetupSlot${slot}`, choices[slot - 1]?.label ?? '']),
		) as SlotVariables
		return {
			...slots,
			suiteSetupActive: this.step !== 'idle',
			suiteSetupStep: this.step === 'idle' ? '' : this.step,
			suiteSetupTitle: this.#title(),
			suiteSetupSummary: this.#summary(),
			suiteSetupScope: this.scope,
		}
	}

	/** JSON of everything the feedbacks read, to re-check them only on a change. */
	feedbackKey(): string {
		return JSON.stringify([this.step, this.#choices().map((choice) => [choice.label, choice.selected])])
	}

	#title(): string {
		switch (this.step) {
			case 'kind':
				return 'STATS OF'
			case 'target':
				if (this.kind === 'team') return 'WHICH TEAM'
				if (this.#players().length === 0) return 'NO PLAYERS'
				if (this.kind === 'versus') return this.players.length === 0 ? 'PLAYER 1' : 'PLAYER 2'
				return 'WHICH PLAYER'
			case 'stats':
				return `STATS (${this.#available().filter((key) => this.types.includes(key)).length})`
			default:
				return ''
		}
	}

	#summary(): string {
		if (this.step === 'idle' || !this.kind) return ''
		if (this.kind === 'teams') return KIND_LABEL.teams
		if (this.kind === 'team') return this.team === undefined ? KIND_LABEL.team : this.#teamName(this.team)
		if (this.kind === 'player') return this.players[0] ?? KIND_LABEL.player
		return this.players.length ? this.players.join(' vs ') : KIND_LABEL.versus
	}

	#choices(): Choice[] {
		switch (this.step) {
			case 'kind':
				return KINDS.map(({ mode, label }) => ({
					label,
					selected: this.kind === mode,
					press: () => {
						if (this.kind !== mode) {
							this.team = undefined
							this.players = []
						}
						this.kind = mode
						this.step = mode === 'teams' ? 'stats' : 'target'
						this.#changed()
					},
				}))
			case 'target':
				if (this.kind === 'team') {
					return ([0, 1] as const).map((slot) => ({
						label: this.#teamName(slot),
						selected: this.team === slot,
						press: () => {
							this.team = slot
							this.step = 'stats'
							this.#changed()
						},
					}))
				}
				return this.#players()
					.slice(0, STATS_SETUP_SLOTS)
					.map(({ name, slot }) => ({
						label: `${name}\n${this.#teamName(slot, true)}`,
						selected: this.players.includes(name),
						press: () => this.#pickPlayer(name),
					}))
			case 'stats':
				return this.#available().map((key) => ({
					label: STAT_LABELS[key].toUpperCase(),
					selected: this.types.includes(key),
					press: () => {
						this.types = this.types.includes(key)
							? this.types.filter((type) => type !== key)
							: STAT_KEYS.filter((type) => type === key || this.types.includes(type))
						this.#changed()
					},
				}))
			default:
				return []
		}
	}

	#pickPlayer(name: string): void {
		if (this.kind === 'player') {
			this.players = [name]
			this.step = 'stats'
		} else if (this.players.includes(name)) {
			this.players = this.players.filter((player) => player !== name)
		} else {
			this.players = [...this.players, name]
			if (this.players.length === 2) this.step = 'stats'
		}
		this.#changed()
	}

	/** The stats that the chosen kind can show. */
	#available(): StatKey[] {
		return this.kind === 'player' || this.kind === 'versus' ? PLAYER_STAT_KEYS : STAT_KEYS
	}

	/** Players of the match being played, or of the last match of the series between matches. */
	#players(): StatsSetupPlayer[] {
		const live = this.#self.players
		const list = live.length ? live : sortPlayers(this.#self.series?.matches.at(-1)?.scoreboard ?? [])
		const seen = new Set<string>()
		const players: StatsSetupPlayer[] = []
		for (const player of list) {
			if (!player.Name || seen.has(player.Name) || (player.TeamNum !== 0 && player.TeamNum !== 1)) continue
			seen.add(player.Name)
			players.push({ name: player.Name, slot: player.TeamNum })
		}
		return players
	}

	#teamName(slot: Slot, short = false): string {
		const names = suiteTeamNames(this.#state)
		return (short ? names.short[slot] : names.name[slot]) || (slot === 0 ? 'LEFT' : 'RIGHT')
	}

	#changed(): void {
		this.#self.refreshSetup()
	}
}

// ---------------------------------------------------------------------------
// Actions and feedbacks
// ---------------------------------------------------------------------------

export type StatsSetupActionsSchema = {
	suite_setup: { options: { mode: 'start' | 'back' | 'cancel' | 'done' | 'scope' } }
	suite_setup_choice: { options: { slot: number } }
}

export type StatsSetupFeedbacksSchema = {
	suite_setup_active: { type: 'boolean'; options: Record<string, never> }
	suite_setup_selected: { type: 'boolean'; options: { slot: number } }
	suite_setup_unused: { type: 'boolean'; options: { slot: number } }
}

export const STATS_SETUP_FEEDBACK_IDS = ['suite_setup_active', 'suite_setup_selected', 'suite_setup_unused'] as const

const SLOT_OPTION = {
	id: 'slot',
	type: 'number',
	label: `Choice (1-${STATS_SETUP_SLOTS})`,
	default: 1,
	min: 1,
	max: STATS_SETUP_SLOTS,
	step: 1,
} as const

export function statsSetupActionDefinitions(self: ModuleInstance): CompanionActionDefinitions<ModuleSchema['actions']> {
	const definitions: CompanionActionDefinitions<StatsSetupActionsSchema> = {
		suite_setup: {
			name: 'Suite: stats setup',
			description:
				'Step-by-step stats picker for the match HUD: kind (team, 2 teams, player, player vs player), then the team or ' +
				"players, then one or several stats. Done sends them to the suite (they show on the HUD). Add Companion's " +
				'"Set surface page" to the Start button (setup page) and to Done and Cancel (Back), to switch pages.',
			options: [
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Do',
					choices: [
						{ id: 'start', label: 'Start (open on the first step)' },
						{ id: 'back', label: 'Back (previous step)' },
						{ id: 'scope', label: 'Match / series data' },
						{ id: 'done', label: 'Done (send the stats)' },
						{ id: 'cancel', label: 'Cancel' },
					],
					default: 'start',
				},
			],
			callback: (action) => {
				const setup = self.statsSetup
				switch (action.options.mode) {
					case 'start':
						setup.start()
						break
					case 'back':
						setup.back()
						break
					case 'scope':
						setup.toggleScope()
						break
					case 'done':
						setup.done()
						break
					case 'cancel':
						setup.cancel()
						break
				}
			},
		},
		suite_setup_choice: {
			name: 'Suite: stats setup choice',
			description: 'One of the choices of the current step of the stats setup. Its label is $(…:suiteSetupSlotN).',
			options: [SLOT_OPTION],
			callback: (action) => {
				self.statsSetup.press(Math.round(Number(action.options.slot)))
			},
		},
	}
	return definitions as unknown as CompanionActionDefinitions<ModuleSchema['actions']>
}

export function statsSetupFeedbackDefinitions(
	self: ModuleInstance,
): CompanionFeedbackDefinitions<ModuleSchema['feedbacks']> {
	const definitions: CompanionFeedbackDefinitions<StatsSetupFeedbacksSchema> = {
		suite_setup_active: {
			name: 'Suite: stats setup open',
			type: 'boolean',
			defaultStyle: { bgcolor: 0x1d4ed8, color: 0xffffff },
			options: [],
			callback: () => self.statsSetup.step !== 'idle',
		},
		suite_setup_selected: {
			name: 'Suite: stats setup choice selected',
			type: 'boolean',
			defaultStyle: { bgcolor: 0x15803d, color: 0xffffff },
			options: [SLOT_OPTION],
			callback: (feedback) => self.statsSetup.selected(Math.round(Number(feedback.options.slot))),
		},
		suite_setup_unused: {
			name: 'Suite: stats setup choice empty',
			description: 'True when this choice has nothing to choose in the current step.',
			type: 'boolean',
			defaultStyle: { bgcolor: 0x000000, color: 0x404040 },
			options: [SLOT_OPTION],
			callback: (feedback) => !self.statsSetup.used(Math.round(Number(feedback.options.slot))),
		},
	}
	return definitions as unknown as CompanionFeedbackDefinitions<ModuleSchema['feedbacks']>
}
