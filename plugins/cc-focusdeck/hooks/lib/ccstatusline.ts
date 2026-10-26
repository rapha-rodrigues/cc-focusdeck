// ccstatusline, the status line the sidebar installs and looks after: what
// its settings say, what to write, what to run. Pure; the page is in
// ../pages/statusline.tsx.

export const PACKAGE = 'ccstatusline'
export const REPO_URL = 'https://github.com/sirmalloc/ccstatusline'
export const INSTALL_COMMAND = 'npx -y ccstatusline@latest'
export const CONFIGURATOR_COMMAND = 'npx ccstatusline@latest'
// Under the home directory, on every platform.
export const CONFIG_PATH = '.config/ccstatusline/settings.json'

export type StatusLineBlock = { type: 'command'; command: string; padding?: number; refreshInterval?: number }

// The block written into ~/.claude/settings.json by Install. refreshInterval
// needs Claude Code 2.1.97 or newer, which the sidebar itself needs anyway.
export const installBlock = (): StatusLineBlock => ({ type: 'command', command: INSTALL_COMMAND, padding: 0, refreshInterval: 10 })

// What the status line setting is, as the page tells them apart:
// none, another status line, ccstatusline installed by the person (unmanaged),
// ccstatusline installed from here (managed: the record holds the block written).
export type Kind = 'none' | 'other' | 'unmanaged' | 'managed'

// The record Install writes to the store BEFORE anything else changes: the
// phase, what was there, what is written, whether the starter config was made.
export type StatusLineOp = { phase: 'installing' | 'installed'; predecessor: unknown; block: StatusLineBlock; wroteConfig: boolean }

const sortedJson = (v: unknown): string =>
  JSON.stringify(v, (_, value: unknown) =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : value,
  )

// Equal as JSON, whatever the key order.
export const sameBlock = (a: unknown, b: unknown): boolean => sortedJson(a) === sortedJson(b)

export const commandOf = (statusLine: unknown): string | null => {
  const command = (statusLine as { command?: unknown } | null)?.command
  return typeof command === 'string' ? command : null
}

export const classify = (statusLine: unknown, op: StatusLineOp | null): Kind => {
  if (statusLine === undefined || statusLine === null) return 'none'
  const command = commandOf(statusLine)
  if (command === null || !command.includes(PACKAGE)) return 'other'
  return op !== null && op.phase === 'installed' && sameBlock(statusLine, op.block) ? 'managed' : 'unmanaged'
}

export const isOp = (v: unknown): v is StatusLineOp => {
  const r = v as { phase?: unknown; block?: unknown; wroteConfig?: unknown } | null
  return r !== null && typeof r === 'object' && (r.phase === 'installing' || r.phase === 'installed') && typeof r.block === 'object' && typeof r.wroteConfig === 'boolean'
}

// The configured command plus --version: the same code the status line runs
// every few seconds, never a fresh package.
export const versionCommand = (command: string) => `${command} --version`

export type ConfigSummary = { version: number | null; lines: string[][]; powerline: boolean }

// What the ccstatusline settings file holds, for the page: the widget ids per
// line and whether powerline is on. null when the file does not parse.
export const summarizeConfig = (text: string): ConfigSummary | null => {
  try {
    const data = JSON.parse(text) as { version?: unknown; lines?: unknown; powerline?: { enabled?: unknown } }
    const lines = Array.isArray(data.lines)
      ? data.lines.map(line =>
          Array.isArray(line) ? line.map(w => (typeof (w as { type?: unknown }).type === 'string' ? ((w as { type: string }).type) : '?')) : [],
        )
      : []
    return { version: typeof data.version === 'number' ? data.version : null, lines, powerline: data.powerline?.enabled === true }
  } catch {
    return null
  }
}

// A starter config for a first install: three powerline lines (model and
// context; branch and changes; the block's reset time and its timer). No
// colors beyond the standard palette, nothing personal.
export const STARTER_CONFIG = {
  version: 4,
  lines: [
    [
      { id: 'model', type: 'model', color: 'black', backgroundColor: 'bgBrightCyan', bold: true, rawValue: true },
      { id: 'context', type: 'context-bar', color: 'ansi256:235', backgroundColor: 'bgBlue', bold: false, rawValue: true, metadata: { display: 'progress-short' } },
    ],
    [
      { id: 'branch', type: 'git-branch', color: 'ansi256:235', backgroundColor: 'bgBrightCyan', bold: true, rawValue: false, metadata: { linkToGitHub: 'false' } },
      { id: 'changes', type: 'git-changes', color: 'ansi256:235', backgroundColor: 'bgBlue' },
    ],
    [
      { id: 'reset', type: 'reset-timer', color: 'black', backgroundColor: 'bgBrightCyan', bold: true, rawValue: false, metadata: { display: 'time', compact: 'true' } },
      { id: 'block', type: 'block-timer', color: 'ansi256:235', backgroundColor: 'bgBlue', rawValue: false, metadata: { display: 'progress-short', invert: 'false' } },
    ],
  ],
  flexMode: 'full-minus-40',
  compactThreshold: 60,
  colorLevel: 2,
  defaultPadding: ' ',
  inheritSeparatorColors: false,
  globalBold: false,
  minimalistMode: false,
  powerline: {
    enabled: true,
    separators: [''],
    separatorInvertBackground: [false],
    startCaps: [''],
    endCaps: [''],
    theme: 'custom',
    autoAlign: false,
    continueThemeAcrossLines: true,
  },
}
