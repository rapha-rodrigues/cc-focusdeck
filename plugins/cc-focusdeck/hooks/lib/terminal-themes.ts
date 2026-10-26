// Terminal color themes: a palette read from a Warp-format YAML file, and
// the three things made from it: a Claude Code custom theme, a Windows
// Terminal color scheme, and the OSC sequences that recolor a terminal.
// Pure; the page that downloads, keeps and paints is ../pages/themes.tsx.

import { blend, isLightColor, legible } from './colors'

export type Palette = {
  name: string
  background: string
  foreground: string
  cursor: string
  accent: string
  normal: string[]
  bright: string[]
}

// The sixteen ANSI colors by name, in their numeric order.
export const ANSI_NAMES = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'] as const

// Warp's YAML: `key: value` lines, a value left empty opening a nested
// block whose depth is its indentation. Returns dotted keys to values,
// quotes stripped; comments and blank lines skipped.
export const readYamlMap = (text: string): Map<string, string> => {
  const out = new Map<string, string>()
  const path: { depth: number; key: string }[] = []
  for (const rawLine of text.split(/\r?\n/)) {
    const content = rawLine.trim()
    if (content === '' || content[0] === '#') continue
    const entry = /^([\w-]+):\s*(.*)$/.exec(content)
    if (entry === null) continue
    const depth = rawLine.length - rawLine.trimStart().length
    while (path.length > 0 && path[path.length - 1]!.depth >= depth) path.pop()
    const key = entry[1]!
    const value = (entry[2] ?? '').replace(/^"(.*)"$|^'(.*)'$/, '$1$2')
    if (value === '') path.push({ depth, key })
    else out.set([...path.map(p => p.key), key].join('.'), value)
  }
  return out
}

// The one form a color takes here. Every color goes on to the terminal as
// an OSC sequence and into the Claude Code theme and the Windows Terminal
// scheme, so a downloaded value is held to it: nothing else, no control
// characters, reaches the terminal.
export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/
const hex = (value: string | undefined): string | null => (value !== undefined && HEX_COLOR.test(value) ? value.toLowerCase() : null)

// A palette from a theme file; null when a color the theme needs is missing
// or is not a `#rrggbb` color.
export const readWarpTheme = (yaml: string): Palette | null => {
  const map = readYamlMap(yaml)
  const row = (group: 'normal' | 'bright') => ANSI_NAMES.map(name => hex(map.get(`terminal_colors.${group}.${name}`)))
  const normal = row('normal')
  const bright = row('bright')
  const background = hex(map.get('background'))
  const foreground = hex(map.get('foreground'))
  if (background === null || foreground === null || normal.includes(null) || bright.includes(null)) return null
  const cursor = map.get('cursor')
  const accent = map.get('accent')
  if ((cursor !== undefined && hex(cursor) === null) || (accent !== undefined && hex(accent) === null)) return null
  return {
    name: (map.get('name') ?? 'Unnamed').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 80),
    background,
    foreground,
    cursor: hex(cursor) ?? foreground,
    accent: hex(accent) ?? normal[5]! ?? foreground,
    normal: normal as string[],
    bright: bright as string[],
  }
}

// Claude Code theme ---------------------------------------------------------------

export type ClaudeTheme = { name: string; base: 'dark' | 'light'; overrides: Record<string, string> }

// The colors a palette lends to Claude Code's tokens, by role.
type Roles = {
  fg: string
  bg: string
  accent: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  gray: string
  redBright: string
  greenBright: string
  yellowBright: string
  blueBright: string
  magentaBright: string
  orange: string
  indigo: string
}

const rolesOf = (p: Palette): Roles => {
  const fg = p.foreground
  const bg = p.background
  const n = (i: number) => p.normal[i] ?? fg
  const b = (i: number, fallback: string) => p.bright[i] ?? fallback
  const red = n(1)
  const green = n(2)
  const yellow = n(3)
  const blue = n(4)
  const magenta = n(5)
  const cyan = n(6)
  // Dim text is drawn in the gray. A theme whose bright black is its own
  // background would hide it: a blend of background and foreground stands in.
  const grayCandidate = b(0, blend(bg, fg, 0.5))
  const gray = legible(grayCandidate, bg) ? grayCandidate : blend(bg, fg, 0.5)
  return {
    fg,
    bg,
    accent: p.accent,
    red,
    green,
    yellow,
    blue,
    magenta,
    cyan,
    gray,
    redBright: b(1, red),
    greenBright: b(2, green),
    yellowBright: b(3, yellow),
    blueBright: b(4, blue),
    magentaBright: b(5, magenta),
    orange: blend(red, yellow, 0.5),
    indigo: blend(blue, magenta, 0.5),
  }
}

// The lighter (dark themes) or darker (light themes) twin an animation pulses to.
const pulse = (color: string, r: Roles) => blend(color, r.fg, 0.3)

// Every color token Claude Code (2.1.292) has, and the role or blend that
// fills it: what each token means decides its role (an error is red, a
// success green, text the foreground); the blends are this plugin's own
// shades. A token left out would keep the base theme's color, so none is.
const TOKEN_RECIPES: readonly [token: string, fill: (r: Roles) => string][] = [
  ['claude', r => r.accent],
  ['claudeShimmer', r => pulse(r.accent, r)],
  ['claudeBlue_FOR_SYSTEM_SPINNER', r => r.blue],
  ['claudeBlueShimmer_FOR_SYSTEM_SPINNER', r => pulse(r.blue, r)],
  ['text', r => r.fg],
  ['inverseText', r => r.bg],
  ['inactive', r => r.gray],
  ['inactiveShimmer', r => pulse(r.gray, r)],
  ['subtle', r => blend(r.bg, r.fg, 0.28)],
  ['background', r => r.cyan],
  ['suggestion', r => r.blue],
  ['permission', r => r.blue],
  ['permissionShimmer', r => pulse(r.blue, r)],
  ['remember', r => r.magenta],
  ['skill', r => r.magentaBright],
  ['success', r => r.green],
  ['error', r => r.red],
  ['warning', r => r.yellow],
  ['warningShimmer', r => pulse(r.yellow, r)],
  ['planMode', r => r.cyan],
  ['autoAccept', r => r.magenta],
  ['autoAcceptShimmer', r => pulse(r.magenta, r)],
  ['promptBorder', r => blend(r.bg, r.fg, 0.4)],
  ['promptBorderShimmer', r => blend(r.bg, r.fg, 0.65)],
  ['bashBorder', r => r.magenta],
  ['ide', r => r.blue],
  ['merged', r => r.magenta],
  ['professionalBlue', r => r.blueBright],
  ['chromeYellow', r => r.yellowBright],
  ['fastMode', r => r.orange],
  ['fastModeShimmer', r => pulse(r.orange, r)],
  ['effortUltra', r => r.magenta],
  ['briefLabelYou', r => r.blue],
  ['briefLabelClaude', r => r.accent],
  ['clawd_body', r => r.accent],
  ['clawd_background', r => r.bg],
  ['rate_limit_fill', r => r.blue],
  ['rate_limit_empty', r => blend(r.bg, r.blue, 0.25)],
  ['red_FOR_SUBAGENTS_ONLY', r => r.red],
  ['blue_FOR_SUBAGENTS_ONLY', r => r.blue],
  ['green_FOR_SUBAGENTS_ONLY', r => r.green],
  ['yellow_FOR_SUBAGENTS_ONLY', r => r.yellow],
  ['purple_FOR_SUBAGENTS_ONLY', r => r.magenta],
  ['orange_FOR_SUBAGENTS_ONLY', r => r.orange],
  ['pink_FOR_SUBAGENTS_ONLY', r => r.magentaBright],
  ['cyan_FOR_SUBAGENTS_ONLY', r => r.cyan],
  ['rainbow_red', r => r.red],
  ['rainbow_red_shimmer', r => pulse(r.red, r)],
  ['rainbow_orange', r => r.orange],
  ['rainbow_orange_shimmer', r => pulse(r.orange, r)],
  ['rainbow_yellow', r => r.yellow],
  ['rainbow_yellow_shimmer', r => pulse(r.yellow, r)],
  ['rainbow_green', r => r.green],
  ['rainbow_green_shimmer', r => pulse(r.green, r)],
  ['rainbow_blue', r => r.cyan],
  ['rainbow_blue_shimmer', r => pulse(r.cyan, r)],
  ['rainbow_indigo', r => r.indigo],
  ['rainbow_indigo_shimmer', r => pulse(r.indigo, r)],
  ['rainbow_violet', r => r.magenta],
  ['rainbow_violet_shimmer', r => pulse(r.magenta, r)],
  ['userMessageBackground', r => blend(r.bg, r.fg, 0.07)],
  ['userMessageBackgroundHover', r => blend(r.bg, r.fg, 0.11)],
  ['composerSidebarBackground', r => blend(r.bg, r.fg, 0.045)],
  ['bashMessageBackgroundColor', r => blend(r.bg, r.magenta, 0.07)],
  ['memoryBackgroundColor', r => blend(r.bg, r.cyan, 0.07)],
  ['selectionBg', r => blend(r.bg, r.blue, 0.33)],
  ['diffAdded', r => blend(r.bg, r.green, 0.2)],
  ['diffRemoved', r => blend(r.bg, r.red, 0.2)],
  ['diffAddedDimmed', r => blend(r.bg, r.green, 0.1)],
  ['diffRemovedDimmed', r => blend(r.bg, r.red, 0.1)],
  ['diffAddedWord', r => blend(r.bg, r.greenBright, 0.42)],
  ['diffRemovedWord', r => blend(r.bg, r.redBright, 0.42)],
]

// The custom theme Claude Code reads from ~/.claude/themes/<slug>.json.
// Claude Code keeps the terminal's own background; what it draws on it comes
// from these tokens. The base is light when the palette's background is.
export const claudeThemeOf = (p: Palette): ClaudeTheme => {
  const roles = rolesOf(p)
  const overrides: Record<string, string> = {}
  for (const [token, fill] of TOKEN_RECIPES) overrides[token] = fill(roles)
  return { name: p.name, base: isLightColor(p.background) ? 'light' : 'dark', overrides }
}

// Windows Terminal ------------------------------------------------------------------

// Windows Terminal spells magenta "purple" and the bright ones "brightX".
const WT_COLOR_NAMES = ['black', 'red', 'green', 'yellow', 'blue', 'purple', 'cyan', 'white'] as const

export const windowsTerminalSchemeOf = (p: Palette): Record<string, string> => {
  // In the order Windows Terminal writes them itself.
  const scheme: Record<string, string> = { name: p.name }
  scheme.background = p.background
  scheme.foreground = p.foreground
  scheme.cursorColor = p.cursor
  scheme.selectionBackground = p.bright[0] ?? p.foreground
  WT_COLOR_NAMES.forEach((name, i) => {
    scheme[name] = p.normal[i] ?? p.foreground
    scheme[`bright${name[0]!.toUpperCase()}${name.slice(1)}`] = p.bright[i] ?? p.foreground
  })
  return scheme
}

// Windows Terminal's settings.json allows comments and trailing commas.
export const parseLooseJson = (text: string): unknown => {
  let clean = ''
  let i = 0
  while (i < text.length) {
    const ch = text[i]!
    if (ch === '"') {
      // A string, copied whole, escapes included.
      let j = i + 1
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1
      clean += text.slice(i, j + 1)
      i = j + 1
    } else if (ch === '/' && text[i + 1] === '/') {
      const end = text.indexOf('\n', i)
      clean += '\n'
      i = end < 0 ? text.length : end + 1
    } else if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      i = end < 0 ? text.length : end + 2
    } else {
      clean += ch
      i++
    }
  }
  return JSON.parse(clean.replace(/,(\s*[}\]])/g, '$1'))
}

export type WtProfile = { guid?: string; colorScheme?: unknown }
// settings.json's shape as far as the plugin reads it: the profiles, as a
// list or as defaults plus a list, and the named schemes.
export type WtProfiles = WtProfile[] | { defaults?: WtProfile; list?: WtProfile[] }
export type WtSettings = { profiles?: WtProfiles; schemes?: Record<string, unknown>[] }

// The scheme name this plugin writes into Windows Terminal's settings.
export const WT_SCHEME = 'cc-focusdeck'

const profilesOf = (settings: WtSettings): WtProfile[] => {
  const { profiles } = settings
  if (profiles === undefined) return []
  return Array.isArray(profiles) ? profiles : (profiles.list ?? [])
}
const defaultsOf = (settings: WtSettings): WtProfile | undefined => (Array.isArray(settings.profiles) ? undefined : settings.profiles?.defaults)

const sameGuid = (a: string | undefined, b: string) => a !== undefined && a.toLowerCase() === b.toLowerCase()

export const profileByGuid = (settings: WtSettings, guid: string): WtProfile | undefined => profilesOf(settings).find(p => sameGuid(p.guid, guid))

// The profile Claude Code runs in; without one, the defaults every profile
// inherits (made where the settings have none).
export const profileToTheme = (settings: WtSettings, guid: string | null): WtProfile => {
  const own = guid === null ? undefined : profileByGuid(settings, guid)
  if (own !== undefined) return own
  const list = profilesOf(settings)
  if (Array.isArray(settings.profiles) || settings.profiles === undefined) settings.profiles = { defaults: {}, list }
  const withDefaults = settings.profiles as { defaults?: WtProfile }
  withDefaults.defaults ??= {}
  return withDefaults.defaults
}

// Puts the palette on `profile` as the plugin's scheme, or with null gives
// the profile `original` back (undefined: no scheme of its own). The
// plugin's scheme stays listed only while a profile still uses it.
export const setProfileTheme = (settings: WtSettings, profile: WtProfile, palette: Palette | null, original?: unknown): void => {
  if (palette !== null) profile.colorScheme = WT_SCHEME
  else if (original !== undefined) profile.colorScheme = original
  else delete profile.colorScheme
  const others = (settings.schemes ?? []).filter(s => s.name !== WT_SCHEME)
  const stillUsed = [...profilesOf(settings), defaultsOf(settings)].some(p => p?.colorScheme === WT_SCHEME)
  if (palette !== null) settings.schemes = [...others, { ...windowsTerminalSchemeOf(palette), name: WT_SCHEME }]
  else settings.schemes = stillUsed ? (settings.schemes ?? []) : others
}

// OSC -------------------------------------------------------------------------------

const osc = (body: string) => `\u001b]${body}\u0007`

// The escape sequences that recolor a terminal that takes OSC 4/10/11/12
// (Ghostty, iTerm2, kitty, WezTerm, Terminal.app); null is the reset.
export const terminalOscFor = (p: Palette | null): string => {
  if (p === null) return ['104', '110', '111', '112'].map(osc).join('')
  const colors = [...p.normal, ...p.bright].map((color, index) => osc(`4;${index};${color}`))
  return colors.join('') + osc(`10;${p.foreground}`) + osc(`11;${p.background}`) + osc(`12;${p.cursor}`)
}

// Every first capture group a pattern finds in a text.
export const captures = (text: string, pattern: RegExp): string[] => {
  const found: string[] = []
  for (const m of text.matchAll(pattern)) if (m[1] !== undefined) found.push(m[1])
  return found
}
