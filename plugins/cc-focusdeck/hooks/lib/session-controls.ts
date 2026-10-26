// What the Model page controls, as data: the effort levels and their tint,
// the permission modes and their names, the models offered by alias, and
// the model id as a readable name. Pure.

import type { Effort } from '../../types'

export const EFFORT_LEVELS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']

// Each level's tint, cool to hot; max has none of its own and is drawn as a rainbow.
export const EFFORT_TINT: Readonly<Record<Effort, string | null>> = {
  low: '#67e8f9',
  medium: '#bef264',
  high: '#fde047',
  xhigh: '#fb923c',
  max: null,
}

export const isEffort = (v: unknown): v is Effort => typeof v === 'string' && (EFFORT_LEVELS as readonly string[]).includes(v)

// The permission modes a session can start in, as Claude Code names them.
export const START_MODES = ['default', 'plan', 'acceptEdits', 'auto', 'bypassPermissions'] as const
export type StartMode = (typeof START_MODES)[number]

const MODE_WORDS: Readonly<Record<string, string>> = {
  default: 'ask',
  plan: 'plan',
  acceptEdits: 'accept edits',
  auto: 'auto',
  dontAsk: "don't ask",
  bypassPermissions: 'bypass permissions',
}

// A permission mode in words; an unknown one as it came, null as "unknown".
export const modeWords = (mode: string | null): string => (mode === null ? 'unknown' : (MODE_WORDS[mode] ?? mode))

// The models the page offers, each by the alias `/model` accepts.
export const MODEL_CHOICES: readonly { alias: string; label: string }[] = [
  { alias: 'fable', label: 'Fable' },
  { alias: 'opus', label: 'Opus' },
  { alias: 'sonnet', label: 'Sonnet' },
  { alias: 'haiku', label: 'Haiku' },
]

// The family word of a Claude model id (`claude-opus-5-5` → `opus`); null otherwise.
export const familyOf = (id: string | null): string | null => {
  const found = id === null ? null : /^claude-([a-z]+)-/i.exec(id)
  return found === null ? null : found[1]!.toLowerCase()
}

// `claude-opus-5-5` as `Opus 5.5`; an id that is not a Claude model's stays as it is.
export const readableModel = (id: string): string => {
  const found = /^claude-([a-z]+)-(\d+)(?:-(\d+))?/i.exec(id)
  if (found === null) return id
  const family = found[1]!
  const version = found[3] === undefined ? found[2]! : `${found[2]}.${found[3]}`
  return `${family[0]!.toUpperCase()}${family.slice(1)} ${version}`
}
