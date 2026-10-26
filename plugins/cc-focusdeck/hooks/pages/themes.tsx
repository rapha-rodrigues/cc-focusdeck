// The Theme page: palettes from terminalcolors.com kept on disk, one chosen
// for Claude Code (as its custom theme) and for the terminal itself (OSC
// sequences, or the Windows Terminal profile this tab runs in).

import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderChildren, RenderInput } from 'claude-code'

import type { Panel, ThemeEntry } from '../../types'
import { homeDir, isWindows } from '../lib/platform'
import { setSettingsKey } from '../lib/settings-file'
import {
  claudeThemeOf,
  type Palette,
  parseLooseJson,
  profileByGuid,
  profileToTheme,
  readWarpTheme,
  setProfileTheme,
  terminalOscFor,
  WT_SCHEME,
  type WtSettings,
} from '../lib/terminal-themes'
import { familyPages, keptFileName, slugOf, THEME_SITE, variantPages, warpFileOn } from '../lib/theme-site'
import { TAB_STRIP_ROWS, type Frame } from '../ui/frame'

const catalog = atom({ plugin: 'cc-focusdeck', key: 'themes' } as const, [])
const chosenName = atom({ plugin: 'cc-focusdeck', key: 'themeName' } as const, null)
const query = atom({ plugin: 'cc-focusdeck', key: 'themeQuery' } as const, '')
const windowTop = atom({ plugin: 'cc-focusdeck', key: 'themeScroll' } as const, 0)
const notice = atom({ plugin: 'cc-focusdeck', key: 'themeStatus' } as const, '')
const fetching = atom({ plugin: 'cc-focusdeck', key: 'isDownloading' } as const, false)
const paneBackground = atom({ plugin: 'cc-focusdeck', key: 'paneBg' } as const, null)

// The custom theme Claude Code is pointed at: ~/.claude/themes/<CLAUDE_THEME>.json.
const CLAUDE_THEME = 'cc-focusdeck'
const KEPT_KEY = 'theme'
const BEFORE_KEY = 'themeBefore'
const WT_ORIGINALS_KEY = 'wtOriginal'
const DOWNLOADS_AT_ONCE = 6

type Kept = { slug: string; name: string }

export function readThemeName($: EngineInterface) {
  return read($, chosenName)
}
export function readPaneBg($: EngineInterface) {
  return read($, paneBackground)
}

async function keptTheme($: EngineInterface): Promise<Kept | null> {
  const kept = (await $.store.get(KEPT_KEY)) as Kept | undefined
  return kept === undefined ? null : kept
}

async function say($: EngineInterface, text: string) {
  await update($, notice, () => text)
}

// Where the YAML files live, and one of them read as a palette.
async function catalogDir($: EngineInterface) {
  return `${await homeDir($)}/.claude/cc-focusdeck/themes`
}
async function paletteOf($: EngineInterface, slug: string): Promise<Palette | null> {
  const path = `${await catalogDir($)}/${slug}.yaml`
  return (await $.fs.exists(path)) ? readWarpTheme(await $.fs.read(path)) : null
}

// Catalog ------------------------------------------------------------------------

// The kept files, as the picker lists them: by name, each with its eight colors.
async function reindex($: EngineInterface): Promise<ThemeEntry[]> {
  const dir = await catalogDir($)
  const entries: ThemeEntry[] = []
  const present = await $.fs.exists(dir)
  if (present) {
    for (const file of await $.fs.list(dir)) {
      if (file.kind !== 'file' || !file.name.endsWith('.yaml')) continue
      const palette = readWarpTheme(await $.fs.read(`${dir}/${file.name}`))
      if (palette !== null) entries.push({ slug: slugOf(file.name), name: palette.name, colors: palette.normal })
    }
  }
  entries.sort((a, b) => a.name.localeCompare(b.name))
  await update($, catalog, () => entries)
  return entries
}

async function pageText($: EngineInterface, url: string): Promise<string> {
  const response = await $.http.fetch(url)
  if (!response.ok) throw new Error(`${response.status} for ${url}`)
  return response.text
}

// Every theme on the site, saved as its Warp file: the home page's variants
// plus each family page's, fetched a few at a time.
async function fetchCatalog($: EngineInterface) {
  const dir = await catalogDir($)
  await say($, 'Reading terminalcolors.com…')
  const home = await pageText($, `${THEME_SITE}/`)
  const variants = new Set(variantPages(home))
  for (const family of familyPages(home)) {
    try {
      for (const variant of variantPages(await pageText($, THEME_SITE + family))) variants.add(variant)
    } catch {}
  }
  const queue = [...variants]
  let seen = 0
  let kept = 0
  const saveOne = async (page: string) => {
    try {
      const filePath = warpFileOn(await pageText($, THEME_SITE + page))
      if (filePath === null) return
      const yaml = await pageText($, THEME_SITE + filePath)
      if (readWarpTheme(yaml) === null) return
      await $.fs.write(`${dir}/${keptFileName(filePath)}`, yaml)
      kept++
    } catch {
    } finally {
      seen++
    }
  }
  for (let at = 0; at < queue.length; at += DOWNLOADS_AT_ONCE) {
    await Promise.all(queue.slice(at, at + DOWNLOADS_AT_ONCE).map(saveOne))
    await say($, `Downloading themes… ${seen}/${queue.length}`)
  }
  await reindex($)
  await say($, `Saved ${kept} themes to ${dir}`)
}

// The first visit fetches the catalog; later visits find it on disk.
async function fetchCatalogOnce($: EngineInterface) {
  if ((await read($, catalog)).length > 0 || (await read($, fetching))) return
  await update($, fetching, () => true)
  try {
    await fetchCatalog($)
  } catch (error) {
    await say($, `Download failed: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    await update($, fetching, () => false)
  }
}

// Windows Terminal ----------------------------------------------------------------

// Where Windows Terminal keeps its settings: the store app, its preview,
// or the unpackaged install, whichever holds this tab's profile.
async function windowsTerminalSettings($: EngineInterface, profileGuid: string | null): Promise<string | null> {
  const appData = ((await $.env.get('LOCALAPPDATA')) ?? '').replaceAll('\\', '/')
  if (appData === '') return null
  const places = [
    `${appData}/Packages/Microsoft.WindowsTerminal_8wekyb3d8bbwe/LocalState/settings.json`,
    `${appData}/Packages/Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe/LocalState/settings.json`,
    `${appData}/Microsoft/Windows Terminal/settings.json`,
  ]
  let firstFound: string | null = null
  for (const path of places) {
    if (!(await $.fs.exists(path))) continue
    firstFound ??= path
    if (profileGuid !== null && (await $.fs.read(path)).toLowerCase().includes(profileGuid.toLowerCase())) return path
  }
  return firstFound
}

// The backgrounds of Windows Terminal's built-in schemes.
const WT_STOCK_BACKGROUNDS: Record<string, string> = {
  Campbell: '#0C0C0C',
  'Campbell Powershell': '#012456',
  'Dark+': '#1E1E1E',
  Dimidium: '#141414',
  'One Half Dark': '#282C34',
  'One Half Light': '#FFFFFF',
  Ottosson: '#000000',
  'Solarized Dark': '#002B36',
  'Solarized Light': '#FDF6E3',
  'Tango Dark': '#000000',
  'Tango Light': '#FFFFFF',
  Vintage: '#000000',
}

// The background this tab draws on, from its profile, the defaults, the
// scheme either names, or the stock scheme's known color.
async function windowsBackground($: EngineInterface): Promise<string | null> {
  const guid = (await $.env.get('WT_PROFILE_ID')) ?? null
  const path = await windowsTerminalSettings($, guid)
  if (path === null) return null
  const settings = parseLooseJson(await $.fs.read(path)) as WtSettings
  type Colored = { background?: unknown; colorScheme?: unknown }
  const profile = profileToTheme(settings, guid) as Colored
  const profiles = settings.profiles
  const defaults = (profiles === undefined || Array.isArray(profiles) ? undefined : profiles.defaults) as Colored | undefined
  for (const holder of [profile, defaults]) if (typeof holder?.background === 'string') return holder.background
  const named = profile.colorScheme ?? defaults?.colorScheme ?? 'Campbell'
  const schemeName = typeof named === 'string' ? named : ((named as { dark?: string }).dark ?? 'Campbell')
  const scheme = (settings.schemes ?? []).find(s => s.name === schemeName) as { background?: unknown } | undefined
  return typeof scheme?.background === 'string' ? scheme.background : (WT_STOCK_BACKGROUNDS[schemeName] ?? null)
}

// This tab's Windows Terminal profile takes the palette (background too):
// Windows Terminal reloads its settings live. Its own scheme is kept in the
// store before the first change and comes back with null, at session end.
async function paintWindowsProfile($: EngineInterface, palette: Palette | null) {
  const guid = (await $.env.get('WT_PROFILE_ID')) ?? null
  if (guid === null) return
  const path = await windowsTerminalSettings($, guid)
  if (path === null) return
  const before = await $.fs.read(path)
  const settings = parseLooseJson(before) as WtSettings
  const profile = profileByGuid(settings, guid)
  if (profile === undefined) return
  const id = guid.toLowerCase()
  const originals = ((await $.store.get(WT_ORIGINALS_KEY)) ?? {}) as Record<string, { colorScheme?: unknown }>
  if (palette === null && originals[id] === undefined) return
  if (originals[id] === undefined) {
    const own = profile.colorScheme
    originals[id] = own === undefined || own === WT_SCHEME ? {} : { colorScheme: own }
    await $.store.set(WT_ORIGINALS_KEY, originals)
  }
  setProfileTheme(settings, profile, palette, originals[id]!.colorScheme)
  const after = JSON.stringify(settings, null, 4)
  if (after !== JSON.stringify(parseLooseJson(before), null, 4)) {
    const backup = `${path}.cc-focusdeck.bak`
    if (!(await $.fs.exists(backup))) await $.fs.write(backup, before)
    await $.fs.write(path, after)
  }
  if (palette === null) {
    delete originals[id]
    await $.store.set(WT_ORIGINALS_KEY, originals)
  }
  await refreshPaneBg($)
}

// OSC terminals -------------------------------------------------------------------

// The terminal device this session draws on: the nearest ancestor process
// with one (/dev/ttys002, /dev/pts/3). A command the engine runs has none of
// its own, so /dev/tty cannot be used.
const TTY_OF_ANCESTOR = [
  'p=$$',
  'while [ "$p" -gt 1 ]; do',
  '  t=$(ps -o tty= -p "$p" | tr -d " ")',
  '  case "$t" in ""|"?"|"??") ;; *) printf "/dev/%s" "$t"; exit 0 ;; esac',
  '  p=$(ps -o ppid= -p "$p" | tr -d " ")',
  'done',
  'exit 1',
].join('\n')

let ttyDevice: string | null | undefined

async function ttyOfSession($: EngineInterface): Promise<string | null> {
  if (ttyDevice === undefined) {
    const ran = await $.process.run(['sh', '-c', TTY_OF_ANCESTOR])
    ttyDevice = ran.exitCode === 0 && ran.stdout.startsWith('/dev/') ? ran.stdout : null
  }
  return ttyDevice
}

async function paintWithOsc($: EngineInterface, palette: Palette | null) {
  const tty = await ttyOfSession($)
  if (tty === null) return
  await $.process.run(['sh', '-c', 'printf "%s" "$1" > "$2"', 'sh', terminalOscFor(palette), tty])
}

async function paintTerminal($: EngineInterface, palette: Palette | null) {
  if (await isWindows($)) await paintWindowsProfile($, palette)
  else await paintWithOsc($, palette)
}

// Claude Code's theme ---------------------------------------------------------------

// The background the menu's pane sits on: Windows Terminal's, or the kept
// palette's where the terminal is painted by OSC.
export async function refreshPaneBg($: EngineInterface) {
  try {
    let bg: string | null = null
    if (await isWindows($)) bg = await windowsBackground($)
    else {
      const kept = await keptTheme($)
      bg = kept === null ? null : ((await paletteOf($, kept.slug))?.background ?? null)
    }
    await update($, paneBackground, () => bg)
  } catch {}
}

// Points Claude Code at a theme by its /theme value. The row in /config
// takes the built-in names; a custom one is written to settings.json, which
// Claude Code reads at startup (hence the one restart the first time). The
// theme in use before the plugin's first is kept, for the way back.
async function chooseClaudeTheme($: EngineInterface, value: string) {
  const rows = await $.config.list()
  const row = rows.find(({ key }) => key === 'theme')
  if (row === undefined) throw new Error('No theme row in /config to set')
  if (row.value === value) return
  const isOurs = value === `custom:${CLAUDE_THEME}`
  if (isOurs && (await $.store.get(BEFORE_KEY)) === undefined) await $.store.set(BEFORE_KEY, row.value)
  const rowTakesIt = !value.startsWith('custom:') || row.options?.includes(value) === true
  if (rowTakesIt) {
    const answer = await $.config.set({ key: 'theme', value })
    if (answer.deny === undefined) return
    if (!value.startsWith('custom:')) throw new Error(answer.deny)
  }
  const written = await setSettingsKey($, 'theme', value)
  if (written) $.ui.toast(`One restart of Claude Code puts the ${CLAUDE_THEME} theme in place; from then on themes change live`)
}

// A palette on everything: Claude Code (the custom theme file, reloaded
// live once chosen) and the terminal. Null undoes both.
async function applyPalette($: EngineInterface, slug: string | null): Promise<Palette | null> {
  if (slug === null) {
    const before = (await $.store.get(BEFORE_KEY)) as string | undefined
    await chooseClaudeTheme($, before ?? 'dark')
    await $.store.delete(BEFORE_KEY)
    await paintTerminal($, null)
    return null
  }
  const palette = await paletteOf($, slug)
  if (palette === null) throw new Error(`${slug}.yaml is not a theme this plugin can read`)
  await $.fs.write(`${await homeDir($)}/.claude/themes/${CLAUDE_THEME}.json`, `${JSON.stringify(claudeThemeOf(palette), null, 2)}\n`)
  await chooseClaudeTheme($, `custom:${CLAUDE_THEME}`)
  await paintTerminal($, palette)
  return palette
}

// Chooses a theme for this and later sessions (null: the terminal's own colors).
async function chooseTheme($: EngineInterface, slug: string | null) {
  const palette = await applyPalette($, slug)
  await update($, chosenName, () => palette?.name ?? null)
  if (palette === null || slug === null) await $.store.delete(KEPT_KEY)
  else await $.store.set(KEPT_KEY, { slug, name: palette.name } satisfies Kept)
  await refreshPaneBg($)
  await say($, '')
}

// At a session's start: the catalog indexed, the kept theme painted on the terminal.
export async function loadThemes($: EngineInterface) {
  const entries = await reindex($)
  const kept = await keptTheme($)
  if (kept === null || !entries.some(entry => entry.slug === kept.slug)) return
  await update($, chosenName, () => kept.name)
  try {
    await paintTerminal($, await paletteOf($, kept.slug))
  } catch {}
}

// At a session's end the terminal gets its own colors back; a /clear keeps
// the session's process and tab, so the caller skips this then.
export async function themesSessionEnd($: EngineInterface) {
  try {
    await paintTerminal($, null)
  } catch {}
}

// The picker ----------------------------------------------------------------------

// Rows around the list: the tabs, the Back chip, the kept line and the search,
// the actions, the notice when there is one, the footer, one spare.
const roomFor = (bodyRows: number, hasNotice: boolean) => Math.max(3, bodyRows - (TAB_STRIP_ROWS + 3 + 3 + (hasNotice ? 1 : 0) + 3 + 1))

async function matches($: EngineInterface): Promise<ThemeEntry[]> {
  const needle = (await read($, query)).trim().toLowerCase()
  return (await read($, catalog)).filter(entry => entry.name.toLowerCase().includes(needle))
}

async function moveWindow($: EngineInterface, top: number, bodyRows: number) {
  const room = roomFor(bodyRows, (await read($, notice)) !== '')
  const last = Math.max(0, (await matches($)).length - room)
  const next = Math.max(0, Math.min(last, top))
  if (next !== (await read($, windowTop))) await update($, windowTop, () => next)
}

// Opening the page: the kept theme a few rows into view; the catalog fetched on the first visit.
export async function openThemes($: EngineInterface) {
  const kept = await keptTheme($)
  const at = kept === null ? -1 : (await matches($)).findIndex(entry => entry.slug === kept.slug)
  await update($, windowTop, () => Math.max(0, at - 3))
  void fetchCatalogOnce($)
}

// From register.tsx's ui.scroll hook: the wheel moves the list's window, not the pane.
export async function scrollThemesBy($: EngineInterface, by: number, bodyRows: number) {
  await moveWindow($, (await read($, windowTop)) + by, bodyRows)
}

export const THEME_ROW_PREFIX = 'pick-theme:'

// From register.tsx's ui.focus hook: a row the focus ring reached outside the window brings it in.
export async function focusThemes($: EngineInterface, element: string | undefined, bodyRows: number) {
  if (element === undefined || !element.startsWith(THEME_ROW_PREFIX)) return
  const slug = element.slice(THEME_ROW_PREFIX.length)
  const at = (await matches($)).findIndex(entry => entry.slug === slug)
  if (at < 0) return
  const top = await read($, windowTop)
  const room = roomFor(bodyRows, (await read($, notice)) !== '')
  if (at < top) await moveWindow($, at, bodyRows)
  else if (at >= top + room) await moveWindow($, at - room + 1, bodyRows)
}

// A press that may fail reports in the notice line instead of throwing.
function tryFromButton($: EngineInterface, work: () => Promise<unknown>) {
  return () => {
    void work().catch((error: unknown) => say($, `Failed: ${error instanceof Error ? error.message : String(error)}`))
  }
}

export async function drawThemesTab($: EngineInterface, e: RenderInput<'Pane'>, ui: Frame, go: (panel: Panel) => unknown): Promise<RenderChildren[]> {
  if (e.surface !== 'terminal' && e.surface !== 'desktop') return []
  const { Box, Text, Button, Input } = $.ui.resolve(e)
  const { t, check, swatches, chips, chip } = ui
  const rows: RenderChildren[] = [chips('themes-nav', [chip('themes-back', t('backSettings'), false, () => go('settings'))])]
  const entries = await read($, catalog)
  const status = await read($, notice)
  if (entries.length === 0) {
    rows.push(
      <Text key="theme-empty" dimColor>
        {status || t('themesWait')}
      </Text>,
    )
    if (!(await read($, fetching))) rows.push(<Button key="theme-fetch" plain label={t('themesRetry')} onPress={() => fetchCatalogOnce($)} />)
    return rows
  }
  const found = await matches($)
  const top = await read($, windowTop)
  const room = roomFor(e.props.scroll.bodyRows, status !== '')
  const hidden = top > 0 || found.length - top - room > 0
  const keptSlug = (await keptTheme($))?.slug ?? null
  const typed = await read($, query)
  const search = (value: string) => update($, query, () => value).then(() => update($, windowTop, () => 0))
  rows.push(
    <Box key="theme-kept" justifyContent="space-between" gap={1} flexShrink={0}>
      <Text wrap="truncate">
        <Text dimColor>{t('kept')} </Text>
        <Text bold>{(await read($, chosenName)) ?? t('terminalDefault')}</Text>
      </Text>
      <Text dimColor>{hidden ? `${top + 1}–${Math.min(found.length, top + room)}/${found.length}` : ''}</Text>
    </Box>,
    <Input key="theme-search" label={t('search')} value={typed} placeholder={t('themesCount', { n: entries.length })} onInput={search} onSubmit={search} />,
    <Box key="theme-actions" columnGap={2} flexWrap="wrap" flexShrink={0}>
      <Button key="theme-default" plain dimColor label={t('defaultTheme')} onPress={tryFromButton($, () => chooseTheme($, null))} />
      <Button key="theme-redownload" plain dimColor label={t('downloadAgain')} onPress={tryFromButton($, () => fetchCatalog($))} />
    </Box>,
  )
  if (status !== '')
    rows.push(
      <Text key="theme-notice" color="claude" wrap="truncate">
        {status}
      </Text>,
    )
  if (found.length === 0)
    rows.push(
      <Text key="theme-none" dimColor>
        {t('themesNone', { q: typed })}
      </Text>,
    )
  // Two rows past the room, so the focus ring can step off the window's edge and pull it along.
  for (const entry of found.slice(top, top + room + 2)) {
    const isKept = entry.slug === keptSlug
    rows.push(
      <Button key={`${THEME_ROW_PREFIX}${entry.slug}`} plain label={entry.name} onPress={tryFromButton($, () => chooseTheme($, entry.slug))}>
        {swatches(entry.colors)}
        <Text bold={isKept}>{entry.name}</Text>
        {check(isKept)}
      </Button>,
    )
  }
  return rows
}
