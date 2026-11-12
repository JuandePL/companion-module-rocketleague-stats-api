import type { Player, UpdateStateData } from 'rocketleague-stats-api-client'

/** Players sorted by team (Blue first) and then by spectator shortcut. Does not mutate the input. */
export function sortPlayers(players: readonly Player[]): Player[] {
	return [...players].sort((a, b) => a.TeamNum - b.TeamNum || a.Shortcut - b.Shortcut)
}

/** Formats a number of seconds as `m:ss` (e.g. `305` gives `5:05`). */
export function formatClock(totalSeconds: number): string {
	const seconds = Math.max(0, Math.floor(totalSeconds))
	const minutes = Math.floor(seconds / 60)
	return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

/** `true` when the spectator camera is currently following the player with this shortcut. */
export function hasPov(state: UpdateStateData | undefined, shortcut: number | undefined): boolean {
	if (!state || shortcut === undefined) return false
	const { Game } = state
	return Game.bHasTarget && Game.Target !== undefined && Game.Target.Shortcut === shortcut
}

/** Normalizes a `ChangePOV` focus typed by the user: `'Ball'`, an all-digit shortcut, or `undefined` when empty. */
export function parseFocus(value: unknown): 'Ball' | `${number}` | undefined | null {
	const text = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
	if (text === '') return undefined
	if (text.toLowerCase() === 'ball') return 'Ball'
	if (/^\d+$/.test(text)) return text as `${number}`
	return null
}
