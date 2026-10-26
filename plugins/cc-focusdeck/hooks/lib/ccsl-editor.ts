import type { CcslConfig, CcslPowerline, CcslWidget } from '../../types'
import { readableModel } from './session-controls'

export const modelName = readableModel

// The ccstatusline configuration as the editor reads, changes and checks it.
// Pure: the page is in ../pages/ccsl-editor.tsx. Facts from ccstatusline
// 2.2.32 (src/types/Settings.ts, Widget.ts, PowerlineConfig.ts,
// utils/widget-manifest.ts, utils/colors.ts).

// The ccstatusline release the catalog below was read from.
export const CATALOG_VERSION = '2.2.32'
export const MAX_LINES = 3

export type Category = 'Model and context' | 'Git' | 'Tokens and cost' | 'Usage and limits' | 'Session and machine' | 'Custom' | 'Layout'
export type CatalogEntry = { type: string; name: string; category: Category }

// The widgets the Add page offers by name. Ids and the grouping follow the
// manifest; the names are ours.
export const CATALOG: readonly CatalogEntry[] = [
  { type: 'model', name: 'Model', category: 'Model and context' },
  { type: 'thinking-effort', name: 'Thinking effort', category: 'Model and context' },
  { type: 'output-style', name: 'Output style', category: 'Model and context' },
  { type: 'context-bar', name: 'Context bar', category: 'Model and context' },
  { type: 'context-percentage', name: 'Context %', category: 'Model and context' },
  { type: 'context-percentage-usable', name: 'Context % (usable)', category: 'Model and context' },
  { type: 'context-length', name: 'Context length', category: 'Model and context' },
  { type: 'context-window', name: 'Context window', category: 'Model and context' },
  { type: 'compaction-counter', name: 'Compaction counter', category: 'Model and context' },
  { type: 'git-branch', name: 'Git branch', category: 'Git' },
  { type: 'git-changes', name: 'Git changes', category: 'Git' },
  { type: 'git-status', name: 'Git status', category: 'Git' },
  { type: 'git-staged', name: 'Git staged', category: 'Git' },
  { type: 'git-unstaged', name: 'Git unstaged', category: 'Git' },
  { type: 'git-untracked', name: 'Git untracked', category: 'Git' },
  { type: 'git-insertions', name: 'Git insertions', category: 'Git' },
  { type: 'git-deletions', name: 'Git deletions', category: 'Git' },
  { type: 'git-ahead-behind', name: 'Git ahead/behind', category: 'Git' },
  { type: 'git-conflicts', name: 'Git conflicts', category: 'Git' },
  { type: 'git-sha', name: 'Git SHA', category: 'Git' },
  { type: 'git-root-dir', name: 'Git root dir', category: 'Git' },
  { type: 'git-worktree', name: 'Git worktree', category: 'Git' },
  { type: 'git-review', name: 'Git PR/MR', category: 'Git' },
  { type: 'git-ci-status', name: 'Git CI status', category: 'Git' },
  { type: 'git-origin-owner-repo', name: 'Git origin owner/repo', category: 'Git' },
  { type: 'tokens-input', name: 'Tokens in', category: 'Tokens and cost' },
  { type: 'tokens-output', name: 'Tokens out', category: 'Tokens and cost' },
  { type: 'tokens-cached', name: 'Tokens cached', category: 'Tokens and cost' },
  { type: 'tokens-total', name: 'Tokens total', category: 'Tokens and cost' },
  { type: 'cache-hit-rate', name: 'Cache hit rate', category: 'Tokens and cost' },
  { type: 'cache-timer', name: 'Cache timer', category: 'Tokens and cost' },
  { type: 'input-speed', name: 'Input speed', category: 'Tokens and cost' },
  { type: 'output-speed', name: 'Output speed', category: 'Tokens and cost' },
  { type: 'session-cost', name: 'Session cost', category: 'Tokens and cost' },
  { type: 'session-cost-rate', name: 'Session cost rate', category: 'Tokens and cost' },
  { type: 'session-usage', name: 'Session usage (5h)', category: 'Usage and limits' },
  { type: 'block-timer', name: 'Block timer', category: 'Usage and limits' },
  { type: 'reset-timer', name: 'Block reset timer', category: 'Usage and limits' },
  { type: 'weekly-usage', name: 'Weekly usage', category: 'Usage and limits' },
  { type: 'weekly-reset-timer', name: 'Weekly reset timer', category: 'Usage and limits' },
  { type: 'weekly-sonnet-usage', name: 'Weekly Sonnet usage', category: 'Usage and limits' },
  { type: 'weekly-opus-usage', name: 'Weekly Opus usage', category: 'Usage and limits' },
  { type: 'fable-weekly-usage', name: 'Weekly Fable usage', category: 'Usage and limits' },
  { type: 'extra-usage-used', name: 'Extra usage used', category: 'Usage and limits' },
  { type: 'extra-usage-remaining', name: 'Extra usage remaining', category: 'Usage and limits' },
  { type: 'session-clock', name: 'Session clock', category: 'Session and machine' },
  { type: 'session-name', name: 'Session name', category: 'Session and machine' },
  { type: 'current-working-dir', name: 'Working dir', category: 'Session and machine' },
  { type: 'claude-status', name: 'Claude status', category: 'Session and machine' },
  { type: 'claude-account-email', name: 'Account email', category: 'Session and machine' },
  { type: 'sandbox-status', name: 'Sandbox status', category: 'Session and machine' },
  { type: 'vim-mode', name: 'Vim mode', category: 'Session and machine' },
  { type: 'voice-status', name: 'Voice status', category: 'Session and machine' },
  { type: 'skills', name: 'Skills', category: 'Session and machine' },
  { type: 'free-memory', name: 'Free memory', category: 'Session and machine' },
  { type: 'version', name: 'Claude Code version', category: 'Session and machine' },
  { type: 'custom-text', name: 'Custom text', category: 'Custom' },
  { type: 'custom-symbol', name: 'Custom symbol', category: 'Custom' },
  { type: 'custom-command', name: 'Custom command', category: 'Custom' },
  { type: 'link', name: 'Link', category: 'Custom' },
  { type: 'separator', name: 'Separator', category: 'Layout' },
  { type: 'flex-separator', name: 'Flex separator', category: 'Layout' },
]
export const CATEGORIES: readonly Category[] = ['Model and context', 'Git', 'Tokens and cost', 'Usage and limits', 'Session and machine', 'Custom', 'Layout']

// Every widget id the manifest of CATALOG_VERSION lists, catalog or not.
export const MANIFEST_IDS: readonly string[] = [
  ...CATALOG.map(c => c.type),
  'git-staged-files', 'git-unstaged-files', 'git-untracked-files', 'git-clean-status', 'git-origin-owner', 'git-origin-repo',
  'git-upstream-owner', 'git-upstream-repo', 'git-upstream-owner-repo', 'git-is-fork',
  'jj-bookmarks', 'jj-workspace', 'jj-root-dir', 'jj-changes', 'jj-insertions', 'jj-deletions', 'jj-description', 'jj-revision',
  'cache-read', 'cache-write', 'total-speed', 'terminal-width', 'claude-session-id',
  'extra-usage-utilization', 'extra-usage-daily-budget', 'spend-limit-usage', 'spend-limit-amount',
  'remote-control-status', 'worktree-mode', 'worktree-name', 'worktree-branch', 'worktree-original-branch',
]
export const isKnownType = (type: string) => MANIFEST_IDS.includes(type)
export const catalogName = (type: string) => CATALOG.find(c => c.type === type)?.name ?? type

export const FOREGROUNDS: readonly string[] = [
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite',
]
export const BACKGROUNDS: readonly string[] = FOREGROUNDS.map(c => `bg${c.charAt(0).toUpperCase()}${c.slice(1)}`)
export const POWERLINE_THEMES: readonly string[] = ['nord-aurora', 'nord', 'monokai', 'solarized', 'minimal', 'dracula', 'catppuccin', 'gruvbox', 'onedark', 'tokyonight', 'custom']
export const FLEX_MODES: readonly string[] = ['full', 'full-minus-40', 'full-until-compact']
export const COMPACT_THRESHOLDS: readonly number[] = [40, 50, 60, 70]

// A color the palette knows, or ccstatusline's pass-through forms.
export const isColor = (v: unknown, isBackground: boolean): boolean =>
  typeof v === 'string' &&
  ((isBackground ? BACKGROUNDS : FOREGROUNDS).includes(v) || (/^ansi256:\d{1,3}$/.test(v) && Number(v.slice(8)) <= 255) || /^hex:[0-9A-Fa-f]{6}$/.test(v))

// What a person types for a color outside the palette, as ccstatusline
// spells it: `ansi256:235`, `235`, `hex:1a2b3c` or `#1a2b3c`; null otherwise.
export const normalizeColorInput = (raw: string): string | null => {
  const v = raw.trim()
  if (/^\d{1,3}$/.test(v) && Number(v) <= 255) return `ansi256:${Number(v)}`
  if (/^ansi256:\d{1,3}$/i.test(v) && Number(v.slice(8)) <= 255) return `ansi256:${Number(v.slice(8))}`
  if (/^#[0-9A-Fa-f]{6}$/.test(v)) return `hex:${v.slice(1)}`
  if (/^hex:[0-9A-Fa-f]{6}$/i.test(v)) return `hex:${v.slice(4)}`
  return null
}

// A color value as the pane can draw a swatch of it: a palette name as the
// terminal names it (`brightRed` → `redBright`), `ansi256:N` through the
// xterm palette, `hex:RRGGBB` as is.
export const swatchOf = (value: string): string | undefined => {
  if (/^ansi256:\d{1,3}$/.test(value)) return ansi256Color(Math.min(255, Number(value.slice(8))))
  if (/^hex:[0-9A-Fa-f]{6}$/.test(value)) return `#${value.slice(4)}`
  const bare = value.replace(/^bg/, '')
  const m = bare.match(/^(bright|Bright)?([A-Za-z]+)$/)
  if (m === null) return undefined
  const name = m[2]!.charAt(0).toLowerCase() + m[2]!.slice(1)
  return m[1] ? `${name}Bright` : name
}

export type WidgetItem = CcslWidget
export type Powerline = CcslPowerline
export type Config = CcslConfig

export type Parsed = { ok: true; config: Config } | { ok: false; reason: 'invalid-json' | 'no-lines' | 'old-version' }

// The file as the editor can take it: an object with a `lines` array of
// arrays of items with string ids and types, version 4. Older versions are
// left to ccstatusline's own migration (it runs at its next render).
export const parseConfig = (text: string): Parsed => {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'invalid-json' }
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return { ok: false, reason: 'no-lines' }
  const c = data as Record<string, unknown>
  if (c.version !== undefined && (typeof c.version !== 'number' || c.version < 4)) return { ok: false, reason: 'old-version' }
  if (c.version === undefined) return { ok: false, reason: 'old-version' }
  if (!Array.isArray(c.lines) || c.lines.some(l => !Array.isArray(l))) return { ok: false, reason: 'no-lines' }
  return { ok: true, config: c as Config }
}

// What the local check refuses before any dry run.
export const validate = (c: Config): string[] => {
  const errors: string[] = []
  if (c.lines.length < 1) errors.push('at least one line')
  if (c.lines.length > MAX_LINES) errors.push(`at most ${MAX_LINES} lines`)
  const ids = new Set<string>()
  c.lines.forEach((line, li) =>
    line.forEach((w, wi) => {
      const at = `line ${li + 1}, widget ${wi + 1}`
      if (typeof w !== 'object' || w === null) return errors.push(`${at}: not an object`)
      if (typeof w.id !== 'string' || w.id === '') errors.push(`${at}: no id`)
      else if (ids.has(w.id)) errors.push(`${at}: duplicate id ${w.id}`)
      else ids.add(w.id)
      if (typeof w.type !== 'string' || w.type === '') errors.push(`${at}: no type`)
      if (w.color !== undefined && !isColor(w.color, false)) errors.push(`${at}: color ${String(w.color)}`)
      if (w.backgroundColor !== undefined && !isColor(w.backgroundColor, true)) errors.push(`${at}: background ${String(w.backgroundColor)}`)
    }),
  )
  const theme = c.powerline?.theme
  if (theme !== undefined && !POWERLINE_THEMES.includes(theme)) errors.push(`powerline theme ${theme}`)
  if (c.flexMode !== undefined && !FLEX_MODES.includes(c.flexMode)) errors.push(`flex mode ${c.flexMode}`)
  if (c.compactThreshold !== undefined && !(c.compactThreshold >= 1 && c.compactThreshold <= 99)) errors.push('compact threshold out of 1..99')
  return errors
}

// Ids for new widgets; never one the file holds.
export const newId = (taken: ReadonlySet<string> = new Set()): string => {
  for (;;) {
    const id = `cc-${Math.random().toString(36).slice(2, 8)}`
    if (!taken.has(id)) return id
  }
}
export const takenIds = (c: Config): Set<string> => new Set(c.lines.flat().map(w => w.id))

// Draft operations: each returns a new object, the rest shared.
const withLines = (c: Config, lines: WidgetItem[][]): Config => ({ ...c, lines })
const at = (c: Config, line: number) => c.lines[line] ?? []

export const addWidget = (c: Config, line: number, type: string): Config =>
  withLines(c, c.lines.map((l, i) => (i === line ? [...l, { id: newId(takenIds(c)), type }] : l)))
export const removeWidget = (c: Config, line: number, index: number): Config =>
  withLines(c, c.lines.map((l, i) => (i === line ? l.filter((_, j) => j !== index) : l)))
export const moveWidget = (c: Config, line: number, index: number, delta: -1 | 1): Config => {
  const l = [...at(c, line)]
  const to = index + delta
  if (index < 0 || index >= l.length || to < 0 || to >= l.length) return c
  const [w] = l.splice(index, 1)
  l.splice(to, 0, w!)
  return withLines(c, c.lines.map((x, i) => (i === line ? l : x)))
}
export const setWidgetField = (c: Config, line: number, index: number, field: 'color' | 'backgroundColor' | 'bold' | 'rawValue', value: string | boolean | undefined): Config =>
  withLines(c, c.lines.map((l, i) => (i === line ? l.map((w, j) => (j === index ? strip({ ...w, [field]: value }, field, value) : w)) : l)))
const strip = (w: WidgetItem, field: string, value: unknown): WidgetItem => {
  if (value !== undefined) return w
  const { [field]: _dropped, ...rest } = w
  return rest as WidgetItem
}
export const addLine = (c: Config): Config => (c.lines.length >= MAX_LINES ? c : withLines(c, [...c.lines, []]))
export const removeLine = (c: Config, line: number): Config =>
  c.lines.length <= 1 || at(c, line).length > 0 ? c : withLines(c, c.lines.filter((_, i) => i !== line))
export const setPowerline = (c: Config, patch: Partial<Powerline>): Config => ({ ...c, powerline: { ...(c.powerline ?? { enabled: false }), ...patch } })
export const setLayout = (c: Config, patch: { flexMode?: string; compactThreshold?: number; minimalistMode?: boolean }): Config => ({ ...c, ...patch })

// Equal as JSON, `updatemessage` aside: ccstatusline rewrites that field on
// its own while a message counts down after an update.
export const sameConfigIgnoringUpdateMessage = (a: unknown, b: unknown): boolean => {
  const bare = (v: unknown) => {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return v
    const { updatemessage: _u, ...rest } = v as Record<string, unknown>
    return rest
  }
  return JSON.stringify(bare(a)) === JSON.stringify(bare(b))
}

// The config as a key for the preview kept in the store: `updatemessage`
// aside, since ccstatusline rewrites it on its own.
export const configKey = (c: Config): string => {
  const { updatemessage: _u, ...rest } = c
  return JSON.stringify(rest)
}

// The draft with the message currently on disk, so a save never resurrects
// one ccstatusline removed.
export const withDiskUpdateMessage = (draft: Config, disk: Config | null): Config => {
  const { updatemessage: _own, ...rest } = draft
  return disk?.updatemessage === undefined ? (rest as Config) : { ...rest, updatemessage: disk.updatemessage }
}

// As ccstatusline writes it: two-space JSON, no trailing newline.
export const serialize = (c: Config): string => JSON.stringify({ ...c, version: c.version ?? 4 }, null, 2)

// The command adapter: the status line commands the editor can run itself
// (explicit argv, no shell). Anything else, including wrappers and pipelines,
// is not verified by a dry run.
export type Adapter = { argv: string[]; configPath: string | null; label: string }

const PACKAGE_TOKEN = /^ccstatusline(@[\w.^~<>=-]+)?$/
export const commandAdapter = (command: string): Adapter | null => {
  if (/["'|;&<>`$()]/.test(command)) return null
  const tokens = command.trim().split(/\s+/).filter(t => t !== '')
  if (tokens.length === 0) return null
  let argv: string[]
  let rest: string[]
  const head = tokens[0]!
  const base = head.split(/[\\/]/).pop() ?? head
  if (base === 'ccstatusline') {
    argv = [head]
    rest = tokens.slice(1)
  } else if (head === 'npx' || head === 'bunx') {
    let i = 1
    if (tokens[i] === '-y' || tokens[i] === '--yes') i++
    if (tokens[i] === undefined || !PACKAGE_TOKEN.test(tokens[i]!)) return null
    argv = tokens.slice(0, i + 1)
    rest = tokens.slice(i + 1)
  } else return null
  let configPath: string | null = null
  if (rest.length === 2 && rest[0] === '--config') configPath = rest[1]!
  else if (rest.length !== 0) return null
  return { argv, configPath, label: argv.join(' ') }
}
export const dryRunArgv = (a: Adapter, candidatePath: string): string[] => [...a.argv, '--config', candidatePath]
export const versionArgv = (a: Adapter): string[] => [...a.argv, '--version']


// A status JSON like the one Claude Code pipes, for the dry run: this
// session's folder and model, so the git and model widgets draw what the
// real line draws; the cost, context and usage numbers are samples.
export type SampleStatus = { cwd: string; modelId: string }
export const sampleStatusJson = ({ cwd, modelId }: SampleStatus): string =>
  JSON.stringify({
    hook_event_name: 'Status',
    session_id: 'cc-focusdeck-dry-run',
    cwd,
    model: { id: modelId, display_name: modelName(modelId) },
    workspace: { current_dir: cwd, project_dir: cwd },
    version: '2.1.306',
    cost: { total_cost_usd: 0.42, total_duration_ms: 1_200_000, total_api_duration_ms: 300_000, total_lines_added: 12, total_lines_removed: 3 },
    context_window: { context_window_size: 200_000, total_input_tokens: 24_000, total_output_tokens: 3_000, used_percentage: 12, remaining_percentage: 88 },
    rate_limits: { five_hour: { used_percentage: 20, resets_at: Math.floor(Date.now() / 1000) + 3600 }, seven_day: { used_percentage: 35, resets_at: Math.floor(Date.now() / 1000) + 86_400 } },
  })

export const stripAnsi = (s: string): string => s.replace(/\x1b\]8;;[^\x07\x1b]*(?:\x07|\x1b\\)/g, '').replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')

// `preview` is the drawn text, ANSI stripped; `raw` keeps the colors for
// the page to draw (see parseAnsi).
export type DryRunVerdict = { ok: true; preview: string; raw: string } | { ok: false; reason: string }

// What the dry run says: a failure when the exit code is not 0, when
// ccstatusline fell back to its defaults (stderr), or when the line it drew
// says the config is invalid (stdout).
export const dryRunVerdict = (exitCode: number, stdout: string, stderr: string): DryRunVerdict => {
  const out = stripAnsi(stdout).trim()
  if (exitCode !== 0) return { ok: false, reason: stripAnsi(stderr).trim().split('\n')[0] || `exit ${exitCode}` }
  if (/using defaults/i.test(stderr)) return { ok: false, reason: 'ccstatusline rejected the config and used its defaults' }
  if (/invalid config/i.test(out)) return { ok: false, reason: 'ccstatusline drew "invalid config"' }
  return { ok: true, preview: out, raw: stdout.trim() }
}

// The colored output, as the pane can draw it: one segment per run of text
// with the same look. ccstatusline writes chalk's SGR codes at its
// colorLevel (16, 256 or true color); OSC 8 links are dropped, their text kept.
export type AnsiSegment = { text: string; color?: string; backgroundColor?: string; bold?: boolean; dim?: boolean; inverse?: boolean }

const ANSI_NAMES = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white']
const hex2 = (n: number) => n.toString(16).padStart(2, '0')
const rgbHex = (r: number, g: number, b: number) => `#${hex2(r)}${hex2(g)}${hex2(b)}`
// xterm's 256-color palette: the 16 named colors, a 6x6x6 cube, 24 grays.
export const ansi256Color = (n: number): string => {
  if (n < 8) return ANSI_NAMES[n]!
  if (n < 16) return `${ANSI_NAMES[n - 8]}Bright`
  if (n < 232) {
    const i = n - 16
    const level = (x: number) => (x === 0 ? 0 : 55 + x * 40)
    return rgbHex(level(Math.floor(i / 36)), level(Math.floor(i / 6) % 6), level(i % 6))
  }
  const gray = 8 + (n - 232) * 10
  return rgbHex(gray, gray, gray)
}

export const parseAnsi = (line: string): AnsiSegment[] => {
  const segments: AnsiSegment[] = []
  let look: Omit<AnsiSegment, 'text'> = {}
  let text = ''
  const flush = () => {
    if (text !== '') segments.push({ text, ...look })
    text = ''
  }
  const re = /\x1b\[([0-9;]*)m|\x1b\]8;;[^\x07\x1b]*(?:\x07|\x1b\\)/g
  let last = 0
  for (let m = re.exec(line); m !== null; m = re.exec(line)) {
    text += line.slice(last, m.index)
    last = m.index + m[0].length
    if (m[1] === undefined) continue
    flush()
    const codes = (m[1] === '' ? '0' : m[1]).split(';').map(n => parseInt(n, 10))
    for (let i = 0; i < codes.length; i++) {
      const c = codes[i]!
      if (c === 0) look = {}
      else if (c === 1) look = { ...look, bold: true }
      else if (c === 2) look = { ...look, dim: true }
      else if (c === 22) look = { ...look, bold: undefined, dim: undefined }
      else if (c === 7) look = { ...look, inverse: true }
      else if (c === 27) look = { ...look, inverse: undefined }
      else if (c >= 30 && c <= 37) look = { ...look, color: ANSI_NAMES[c - 30] }
      else if (c >= 90 && c <= 97) look = { ...look, color: `${ANSI_NAMES[c - 90]}Bright` }
      else if (c === 39) look = { ...look, color: undefined }
      else if (c >= 40 && c <= 47) look = { ...look, backgroundColor: ANSI_NAMES[c - 40] }
      else if (c >= 100 && c <= 107) look = { ...look, backgroundColor: `${ANSI_NAMES[c - 100]}Bright` }
      else if (c === 49) look = { ...look, backgroundColor: undefined }
      else if ((c === 38 || c === 48) && codes[i + 1] === 5 && codes[i + 2] !== undefined) {
        look = { ...look, [c === 38 ? 'color' : 'backgroundColor']: ansi256Color(codes[i + 2]!) }
        i += 2
      } else if ((c === 38 || c === 48) && codes[i + 1] === 2 && codes[i + 4] !== undefined) {
        look = { ...look, [c === 38 ? 'color' : 'backgroundColor']: rgbHex(codes[i + 2]!, codes[i + 3]!, codes[i + 4]!) }
        i += 4
      }
    }
  }
  text += line.slice(last)
  flush()
  return segments
}

// The drawn lines with their colors, blank ones dropped.
export const previewLines = (raw: string): string[] => raw.split('\n').filter(l => stripAnsi(l).trim() !== '')

// Backups sort by name into time order; the token keeps two saves in one
// second from sharing a name.
const two = (n: number) => String(n).padStart(2, '0')
export const token = () => Math.random().toString(36).slice(2, 8)
export const backupName = (path: string, now: Date, suffix: string = token()): string =>
  `${path}.cc-focusdeck.bak-${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}-${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}-${suffix}`
export const isBackupName = (name: string): boolean => /\.cc-focusdeck\.bak-\d{8}-\d{6}(-[a-z0-9]+)?$/.test(name)
// `20261022-153000` out of a backup's name, for the list.
export const backupStamp = (name: string): string => {
  const m = name.match(/\.cc-focusdeck\.bak-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/)
  return m === null ? name : `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}`
}

// The first `N.N.N` in what `--version` printed, at least `min`: numeric,
// part by part. No version in the text: false.
export const versionAtLeast = (version: string, min: string): boolean => {
  const found = version.match(/\d+(?:\.\d+)+/)
  if (found === null) return false
  const a = found[0].split('.').map(n => parseInt(n, 10))
  const b = min.split('.').map(n => parseInt(n, 10))
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (Number.isNaN(x)) return false
    if (x !== y) return x > y
  }
  return true
}
