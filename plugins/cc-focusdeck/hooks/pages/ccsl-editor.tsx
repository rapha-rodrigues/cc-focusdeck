// The ccstatusline layout editor, opened from the Status line page: the
// config's lines and widgets, each widget's colors and flags, powerline and
// layout. Nothing touches the file until Save, which dry-runs the candidate
// through the person's own status line command first, backs the file up and
// replaces it in one step. The rules are in ../lib/ccsl-editor.ts.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderChildren, RenderInput, Timer } from 'claude-code'

import type { CcslConfig, CcslDraft, CcslMessage, CcslPanel, CcslWidget, Panel, StatusLineVersion } from '../../types'
import {
  type Adapter,
  addLine,
  addWidget,
  BACKGROUNDS,
  backupName,
  backupStamp,
  CATALOG,
  CATALOG_VERSION,
  CATEGORIES,
  catalogName,
  commandAdapter,
  COMPACT_THRESHOLDS,
  configKey,
  dryRunArgv,
  dryRunVerdict,
  FLEX_MODES,
  FOREGROUNDS,
  isBackupName,
  isColor,
  isKnownType,
  MAX_LINES,
  moveWidget,
  normalizeColorInput,
  parseAnsi,
  parseConfig,
  POWERLINE_THEMES,
  previewLines,
  removeLine,
  removeWidget,
  sameConfigIgnoringUpdateMessage,
  sampleStatusJson,
  serialize,
  setLayout,
  setPowerline,
  setWidgetField,
  swatchOf,
  token,
  validate,
  versionArgv,
  versionAtLeast,
  withDiskUpdateMessage,
} from '../lib/ccsl-editor'
import { CONFIG_PATH, STARTER_CONFIG } from '../lib/ccstatusline'
import { copyFileArgv, copyFileWinArgv, homeDir, isWindows, removeFileArgv, writePrivateArgv } from '../lib/platform'
import { replaceFile } from '../lib/settings-file'
import { TAB_STRIP_ROWS, type Frame } from '../ui/frame'
import { detectStatusLine, readStatusLineCommand } from './statusline'

const draft = atom({ plugin: 'cc-focusdeck', key: 'ccslDraft' } as const, null)
const line = atom({ plugin: 'cc-focusdeck', key: 'ccslLine' } as const, 0)
const widget = atom({ plugin: 'cc-focusdeck', key: 'ccslWidget' } as const, null)
const scroll = atom({ plugin: 'cc-focusdeck', key: 'ccslScroll' } as const, 0)
const addScroll = atom({ plugin: 'cc-focusdeck', key: 'ccslAddScroll' } as const, 0)
const addCategory = atom({ plugin: 'cc-focusdeck', key: 'ccslAddCategory' } as const, null)
const colorField = atom({ plugin: 'cc-focusdeck', key: 'ccslColorField' } as const, 'color')
const busy = atom({ plugin: 'cc-focusdeck', key: 'ccslBusy' } as const, false)
const message = atom({ plugin: 'cc-focusdeck', key: 'ccslMessage' } as const, null)
const preview = atom({ plugin: 'cc-focusdeck', key: 'ccslPreview' } as const, null)
const previewBusy = atom({ plugin: 'cc-focusdeck', key: 'ccslPreviewBusy' } as const, false)
const backups = atom({ plugin: 'cc-focusdeck', key: 'ccslBackups' } as const, [])
const version = atom({ plugin: 'cc-focusdeck', key: 'ccslVersion' } as const, { state: 'idle', text: '' } satisfies StatusLineVersion)

const DRY_RUN_MS = 20_000
// A run of changes becomes one preview, this long after the last one.
const PREVIEW_DEBOUNCE_MS = 600
const PREVIEW_KEY = 'ccslPreview'
const BACKUPS_SHOWN = 5
// Rows around the editor's scrolling list: the tabs, the Back/Save/Revert
// chips, the message, the line chips, the page chips, the footer.
const EDITOR_OVERHEAD = TAB_STRIP_ROWS + 3 + 1 + 3 + 3 + 3
// Around the Add page's list: the tabs, the Back chip, the heading, the
// version, the categories, the footer.
const ADD_OVERHEAD = TAB_STRIP_ROWS + 3 + 2 + 1 + 2 + 3

const dirOf = (path: string) => path.slice(0, path.lastIndexOf('/'))
const fileOf = (path: string) => path.slice(path.lastIndexOf('/') + 1)
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error))
export const isCcslPanel = (panel: Panel): panel is CcslPanel => panel.startsWith('ccsl-')

// The file the editor works on: the one the status line command names
// with --config (a leading ~ expanded), else ccstatusline's default.
async function configPath($: EngineInterface) {
  const home = await homeDir($)
  const named = (await adapterOf($))?.configPath ?? null
  if (named === null) return `${home}/${CONFIG_PATH}`
  const slashed = named.split('\\').join('/')
  return slashed === '~' || slashed.startsWith('~/') ? `${home}${slashed.slice(1)}` : slashed
}

// The file as it is now: its text, or null when it is not there.
async function readDisk($: EngineInterface, path: string): Promise<string | null> {
  return (await $.fs.exists(path)) ? await $.fs.read(path) : null
}

// The draft's reading of the file against the file now, `updatemessage`
// aside (ccstatusline rewrites that field on its own); a file that does not
// parse compares by its text.
const sameOnDisk = (draftText: string | null, diskText: string | null): boolean => {
  if (draftText === null || diskText === null) return draftText === diskText
  const a = parseConfig(draftText)
  const b = parseConfig(diskText)
  return a.ok && b.ok ? sameConfigIgnoringUpdateMessage(a.config, b.config) : draftText === diskText
}

async function refreshBackups($: EngineInterface, path: string) {
  let names: string[] = []
  try {
    const base = fileOf(path)
    names = (await $.fs.list(dirOf(path)))
      .filter(entry => entry.kind === 'file' && entry.name.startsWith(base) && isBackupName(entry.name))
      .map(entry => entry.name)
      .sort()
      .reverse()
      .slice(0, BACKUPS_SHOWN)
  } catch {}
  await update($, backups, () => names)
}

// The file into a fresh draft; the selections start over.
export async function loadDraft($: EngineInterface) {
  const path = await configPath($)
  const text = await readDisk($, path)
  let next: CcslDraft
  if (text === null) next = { path, text, config: null, reason: 'missing', dirty: false }
  else {
    const parsed = parseConfig(text)
    next = parsed.ok ? { path, text, config: parsed.config, reason: null, dirty: false } : { path, text, config: null, reason: parsed.reason, dirty: false }
  }
  await update($, draft, () => next)
  await update($, line, l => Math.max(0, Math.min(l, (next.config?.lines.length ?? 1) - 1)))
  await update($, widget, () => null)
  await update($, scroll, () => 0)
  previewTimer?.cancel()
  previewSeq++
  await update($, previewBusy, () => false)
  const kept = next.config === null ? null : await keptPreview($, next.config)
  await update($, preview, () => kept)
  await refreshBackups($, path)
  // No preview kept for this config: one is drawn now, so every page has it.
  if (kept === null && next.config !== null) schedulePreview($)
}

// The preview kept in the store, when it was drawn from this very config.
async function keptPreview($: EngineInterface, config: CcslConfig): Promise<string[] | null> {
  const kept = (await $.store.get(PREVIEW_KEY)) as { key?: unknown; lines?: unknown } | undefined
  if (kept === undefined || kept.key !== configKey(config) || !Array.isArray(kept.lines)) return null
  return kept.lines.filter((l): l is string => typeof l === 'string')
}

async function keepPreview($: EngineInterface, config: CcslConfig, lines: string[]) {
  await $.store.set(PREVIEW_KEY, { key: configKey(config), lines })
}

// On the way into the editor: a draft with changes is kept; one without is
// reloaded when the file changed (or never loaded).
export async function openEditor($: EngineInterface) {
  const d = await read($, draft)
  if (d === null) return loadDraft($)
  if (d.dirty) return
  if ((await readDisk($, d.path)) !== d.text) await loadDraft($)
}

// A change to the draft's config: a new object from the pure operation, and
// the draft marked dirty when the object changed.
async function edit($: EngineInterface, fn: (c: CcslConfig) => CcslConfig) {
  let changed = false
  await update($, draft, d => {
    if (d === null || d.config === null) return d
    const config = fn(d.config)
    if (config === d.config) return d
    changed = true
    return { ...d, config, dirty: true }
  })
  if (changed) schedulePreview($)
}

// The preview follows the draft: a change schedules a dry run a moment
// later, a run of changes becoming one; a result older than the newest
// change is dropped. Module variables: they start over with a reload.
let previewSeq = 0
let previewTimer: Timer | undefined

function schedulePreview($: EngineInterface) {
  previewTimer?.cancel()
  previewSeq++
  void update($, previewBusy, () => true)
  previewTimer = $.clock.after(PREVIEW_DEBOUNCE_MS, () => {
    void refreshPreview($)
  })
}

async function refreshPreview($: EngineInterface) {
  const seq = previewSeq
  try {
    const d = await read($, draft)
    if (d === null || d.config === null || validate(d.config).length > 0) return
    const adapter = await adapterOf($)
    if (adapter === null) return
    const result = await dryRun($, adapter, d.path, serialize(withDiskUpdateMessage(d.config, null)), await isWindows($))
    if (seq !== previewSeq) return
    if (result.kind === 'ok') {
      const lines = previewLines(result.raw)
      await update($, preview, () => lines)
      await keepPreview($, d.config, lines)
    } else await update($, message, () => ({ kind: 'warn', text: `Preview: ${result.reason}` }) satisfies CcslMessage)
  } catch (error) {
    if (seq === previewSeq) await update($, message, () => ({ kind: 'warn', text: `Preview: ${errorText(error)}` }) satisfies CcslMessage)
  } finally {
    if (seq === previewSeq) await update($, previewBusy, () => false)
  }
}

async function run($: EngineInterface, work: () => Promise<void>) {
  if (await read($, busy)) return
  await update($, busy, () => true)
  await update($, message, () => null)
  try {
    await work()
  } catch (error) {
    await update($, message, () => ({ kind: 'error', text: errorText(error) }) satisfies CcslMessage)
  } finally {
    await update($, busy, () => false)
  }
}

async function adapterOf($: EngineInterface): Promise<Adapter | null> {
  const command = await readStatusLineCommand($)
  return command === null ? null : commandAdapter(command)
}

type DryRun = { kind: 'ok'; raw: string } | { kind: 'failed'; reason: string } | { kind: 'unavailable'; reason: string }

// What the sample status carries from this session: its folder, so the git
// widgets draw the real branch, and its model.
async function sessionFacts($: EngineInterface) {
  const home = await homeDir($)
  let cwd = home
  let modelId = 'claude-opus-5-5'
  try {
    cwd = (await $.session.cwd()) || home
  } catch {}
  try {
    modelId = (await $.session.model()) || modelId
  } catch {}
  return { cwd, modelId }
}

// The candidate, in a private file of its own beside the config, rendered by
// the person's own command with a sample status on stdin. The file goes
// after. The call rejecting (a timeout, a command that cannot start) is not
// a verdict on the config: the page then offers Save without preview.
async function dryRun($: EngineInterface, adapter: Adapter, path: string, candidate: string, win: boolean): Promise<DryRun> {
  const candidatePath = `${path}.cc-focusdeck.candidate-${token()}`
  if (win) await $.fs.write(candidatePath, candidate)
  else {
    const wrote = await $.process.run(writePrivateArgv(candidatePath), { stdin: candidate, timeoutMs: 10_000 })
    if (wrote.exitCode !== 0) throw new Error(`Could not write the candidate: ${wrote.stderr.trim() || `exit ${wrote.exitCode}`}`)
  }
  try {
    const facts = await sessionFacts($)
    const ran = await $.process.run(dryRunArgv(adapter, candidatePath), { stdin: sampleStatusJson(facts), cwd: facts.cwd, timeoutMs: DRY_RUN_MS })
    const verdict = dryRunVerdict(ran.exitCode, ran.stdout, ran.stderr)
    return verdict.ok ? { kind: 'ok', raw: verdict.raw } : { kind: 'failed', reason: verdict.reason }
  } catch (error) {
    return { kind: 'unavailable', reason: errorText(error) }
  } finally {
    try {
      await $.process.run(removeFileArgv(candidatePath, win), { timeoutMs: 5000 })
    } catch {}
  }
}

// A private copy of the file, mode kept, named by the time.
async function backup($: EngineInterface, path: string, win: boolean): Promise<string> {
  const to = backupName(path, new Date())
  const ran = await $.process.run(win ? copyFileWinArgv(path, to) : copyFileArgv(path, to), { timeoutMs: 10_000 })
  if (ran.exitCode !== 0) throw new Error(`Could not back the file up: ${ran.stderr.trim() || `exit ${ran.exitCode}`}`)
  return to
}

const changedOutside = () => new Error('The file changed outside the editor (the configurator, perhaps): Revert reloads it')

// Save: the local check, the file compared with the draft's reading of it,
// the candidate (the draft with the `updatemessage` now on disk) dry-run,
// a backup, the compare again, the one-step replace, the draft reloaded.
// The bytes the dry run saw are the bytes written, and the replace goes ahead
// only while the file is still the text the candidate was built from.
async function save($: EngineInterface, mode: 'preview' | 'blind') {
  await run($, async () => {
    const d = await read($, draft)
    if (d === null || d.config === null) throw new Error('Nothing to save')
    const errors = validate(d.config)
    if (errors.length > 0) throw new Error(`Not saved: ${errors.slice(0, 3).join('; ')}`)
    const win = await isWindows($)
    const disk = await readDisk($, d.path)
    if (!sameOnDisk(d.text, disk)) throw changedOutside()
    const parsedDisk = disk === null ? null : parseConfig(disk)
    const candidate = serialize(withDiskUpdateMessage(d.config, parsedDisk?.ok ? parsedDisk.config : null))
    if (mode === 'preview') {
      const adapter = await adapterOf($)
      if (adapter === null) throw new Error('No preview: the status line command is not one the editor can run. More › Save without preview.')
      const result = await dryRun($, adapter, d.path, candidate, win)
      if (result.kind === 'failed') throw new Error(`Not saved: ${result.reason}`)
      if (result.kind === 'unavailable') throw new Error(`No preview (${result.reason}). More › Save without preview writes it anyway.`)
      await keepPreview($, d.config, previewLines(result.raw))
    }
    if (disk !== null) await backup($, d.path, win)
    if (!sameOnDisk(d.text, await readDisk($, d.path))) throw changedOutside()
    await replaceFile($, d.path, candidate, { text: disk, changed: changedOutside })
    await loadDraft($)
    await update($, message, () => ({ kind: 'ok', text: mode === 'preview' ? 'Saved: the status line follows at its next refresh' : 'Saved without a preview' }) satisfies CcslMessage)
    await detectStatusLine($)
  })
}

// The draft drawn by the status line command, nothing written.
async function previewDraft($: EngineInterface) {
  await run($, async () => {
    const d = await read($, draft)
    if (d === null || d.config === null) throw new Error('Nothing to preview')
    const errors = validate(d.config)
    if (errors.length > 0) throw new Error(`No preview: ${errors.slice(0, 3).join('; ')}`)
    const adapter = await adapterOf($)
    if (adapter === null) throw new Error('No preview: the status line command is not one the editor can run.')
    const result = await dryRun($, adapter, d.path, serialize(withDiskUpdateMessage(d.config, null)), await isWindows($))
    if (result.kind !== 'ok') throw new Error(`No preview: ${result.reason}`)
    const lines = previewLines(result.raw)
    await update($, preview, () => lines)
    await keepPreview($, d.config, lines)
    await update($, message, () => ({ kind: 'ok', text: d.dirty ? 'Preview of the draft; nothing saved yet' : 'Preview of the file as saved' }) satisfies CcslMessage)
  })
}

// A backup over the file, the file backed up first; then the draft reloads.
async function restore($: EngineInterface, name: string) {
  await run($, async () => {
    const d = await read($, draft)
    if (d === null) return
    const text = await $.fs.read(`${dirOf(d.path)}/${name}`)
    if (!parseConfig(text).ok) throw new Error('That backup does not parse: not restoring it')
    const win = await isWindows($)
    if (await $.fs.exists(d.path)) await backup($, d.path, win)
    await replaceFile($, d.path, text)
    await loadDraft($)
    await update($, message, () => ({ kind: 'ok', text: `Restored ${backupStamp(name)}; the file before it is backed up` }) satisfies CcslMessage)
    await detectStatusLine($)
  })
}

// The plugin's starter config as the draft, Save still to come.
async function resetToStarter($: EngineInterface) {
  await update($, draft, d => (d === null ? d : { ...d, config: JSON.parse(JSON.stringify(STARTER_CONFIG)) as CcslConfig, reason: null, dirty: true }))
  await update($, line, () => 0)
  await update($, widget, () => null)
  await update($, scroll, () => 0)
  await update($, message, () => ({ kind: 'warn', text: 'The starter layout is the draft now: Save writes it' }) satisfies CcslMessage)
  schedulePreview($)
}

// The installed version, through the adapter (no shell): the catalog opens
// only from the release it was read from.
async function checkVersion($: EngineInterface) {
  const adapter = await adapterOf($)
  if (adapter === null) {
    await update($, version, () => ({ state: 'failed', text: 'not a command the editor can run' }))
    return
  }
  await update($, version, () => ({ state: 'checking', text: '' }))
  try {
    const ran = await $.process.run(versionArgv(adapter), { timeoutMs: DRY_RUN_MS })
    const text = (ran.exitCode === 0 ? ran.stdout : ran.stderr).trim().split('\n')[0] ?? ''
    await update($, version, () => (ran.exitCode === 0 ? { state: 'ok', text } : { state: 'failed', text: text || `exit ${ran.exitCode}` }))
  } catch (error) {
    await update($, version, () => ({ state: 'failed', text: errorText(error) }))
  }
}

// Selections -------------------------------------------------------------------

async function chooseLine($: EngineInterface, i: number) {
  await update($, line, () => i)
  await update($, widget, () => null)
  await update($, scroll, () => 0)
}

async function removeCurrentLine($: EngineInterface) {
  const li = await read($, line)
  await edit($, c => removeLine(c, li))
  const d = await read($, draft)
  await chooseLine($, Math.max(0, Math.min(li, (d?.config?.lines.length ?? 1) - 1)))
}

async function moveChosen($: EngineInterface, delta: -1 | 1) {
  const li = await read($, line)
  const wi = await read($, widget)
  if (wi === null) return
  const before = await read($, draft)
  await edit($, c => moveWidget(c, li, wi, delta))
  if ((await read($, draft)) !== before) await update($, widget, () => wi + delta)
}

async function removeChosen($: EngineInterface) {
  const li = await read($, line)
  const wi = await read($, widget)
  if (wi === null) return
  await edit($, c => removeWidget(c, li, wi))
  await update($, widget, () => null)
}

async function toggleFlag($: EngineInterface, field: 'bold' | 'rawValue') {
  const li = await read($, line)
  const wi = await read($, widget)
  if (wi === null) return
  await edit($, c => {
    const w = c.lines[li]?.[wi]
    return w === undefined ? c : setWidgetField(c, li, wi, field, w[field] ? undefined : true)
  })
}

async function pickColor($: EngineInterface, value: string | undefined) {
  const li = await read($, line)
  const wi = await read($, widget)
  const field = await read($, colorField)
  if (wi === null) return
  await edit($, c => setWidgetField(c, li, wi, field, value))
}

async function addChosen($: EngineInterface, type: string) {
  const li = await read($, line)
  await edit($, c => addWidget(c, li, type))
  const d = await read($, draft)
  await update($, widget, () => Math.max(0, (d?.config?.lines[li]?.length ?? 1) - 1))
}

// The widgets the Add page offers: the catalog from CATALOG_VERSION on; an
// older or unknown version, only the types the file holds and the separators.
type Offer = { gated: boolean; entries: { type: string; name: string }[] }
const offerFor = (config: CcslConfig | null, v: StatusLineVersion, category: string | null): Offer => {
  if (v.state === 'ok' && versionAtLeast(v.text, CATALOG_VERSION)) {
    const cat = category ?? CATEGORIES[0]
    return { gated: false, entries: CATALOG.filter(c => c.category === cat) }
  }
  const present = new Set((config?.lines ?? []).flat().map(w => w.type))
  present.add('separator')
  present.add('flex-separator')
  return { gated: true, entries: [...present].sort().map(type => ({ type, name: catalogName(type) })) }
}

// Scrolling ----------------------------------------------------------------------

// The editor list's items, by height: one row a widget (or the empty-line
// notice), a blank row, the Preview chip (three rows), then the preview's
// lines or the hint under it. The scroll window is a run of whole items.
const PREVIEW_CHIP_ROWS = 3
const editorHeights = (widgetCount: number, previewRows: number): number[] => [
  ...Array<number>(Math.max(1, widgetCount)).fill(1),
  1,
  PREVIEW_CHIP_ROWS,
  ...Array<number>(Math.max(1, previewRows)).fill(1),
]
async function editorHeightsNow($: EngineInterface): Promise<number[]> {
  const d = await read($, draft)
  const li = await read($, line)
  const shown = await read($, preview)
  return editorHeights((d?.config?.lines[li] ?? []).length, shown?.length ?? 0)
}
// The items from `top` that fit `room` rows: [from, to), at least one.
const windowByRows = (heights: readonly number[], top: number, room: number) => {
  const from = Math.max(0, Math.min(top, heights.length - 1))
  let rows = 0
  let to = from
  while (to < heights.length) {
    if (rows + heights[to]! > room && to > from) break
    rows += heights[to]!
    to++
  }
  return { from, to }
}
// The highest `top` that still fills the room from the end.
const maxTop = (heights: readonly number[], room: number) => {
  let rows = 0
  let i = heights.length
  while (i > 0 && rows + heights[i - 1]! <= room) rows += heights[--i]!
  return Math.min(i, Math.max(0, heights.length - 1))
}

const clamp = (top: number, count: number, room: number) => Math.max(0, Math.min(top, count - room))

// The wheel and the scroll keys move the page's own list window (from
// register.tsx's ui.scroll hook).
export async function scrollCcsl($: EngineInterface, page: CcslPanel, by: number, bodyRows: number) {
  if (page === 'ccsl-editor') {
    const heights = await editorHeightsNow($)
    const room = Math.max(3, bodyRows - EDITOR_OVERHEAD)
    await update($, scroll, top => Math.max(0, Math.min(top + by, maxTop(heights, room))))
  } else if (page === 'ccsl-add') {
    const d = await read($, draft)
    const { entries } = offerFor(d?.config ?? null, await read($, version), await read($, addCategory))
    await update($, addScroll, top => clamp(top + by, entries.length, Math.max(3, bodyRows - ADD_OVERHEAD)))
  }
}

// The focus ring stepping onto a row past either end of the window brings it
// into view (from register.tsx's ui.focus hook).
export async function focusCcsl($: EngineInterface, page: CcslPanel, element: string | undefined, bodyRows: number) {
  if (element === undefined) return
  if (page === 'ccsl-editor') {
    const heights = await editorHeightsNow($)
    let at: number
    if (element.startsWith('ccsl-w:')) at = Number(element.slice('ccsl-w:'.length))
    else if (element === 'ccsl-preview-run') at = heights.length - Math.max(1, (await read($, preview))?.length ?? 0) - 1
    else return
    if (!Number.isInteger(at) || at < 0 || at >= heights.length) return
    const room = Math.max(3, bodyRows - EDITOR_OVERHEAD)
    const top = await read($, scroll)
    const { to } = windowByRows(heights, top, room)
    if (at < top) await update($, scroll, () => at)
    else if (at >= to) {
      // The lowest top from which `at` is in the window.
      let newTop = at
      let rows = heights[at]!
      while (newTop > 0 && rows + heights[newTop - 1]! <= room) rows += heights[--newTop]!
      await update($, scroll, () => newTop)
    }
  } else if (page === 'ccsl-add' && element.startsWith('ccsl-add:')) {
    const type = element.slice('ccsl-add:'.length)
    const d = await read($, draft)
    const { entries } = offerFor(d?.config ?? null, await read($, version), await read($, addCategory))
    const at = entries.findIndex(en => en.type === type)
    if (at < 0) return
    const room = Math.max(3, bodyRows - ADD_OVERHEAD)
    const top = await read($, addScroll)
    if (at < top) await update($, addScroll, () => at)
    else if (at >= top + room) await update($, addScroll, () => clamp(at - room + 1, entries.length, room))
  }
}

// Drawing ------------------------------------------------------------------------
// One shape throughout: chips for actions and small choices, the Settings
// page's `label  value ›` rows to open a page, plain rows for lists.

const detailOf = (w: CcslWidget) => `${w.color ?? '·'}/${(w.backgroundColor ?? '·').replace(/^bg/, '')}${w.bold ? ' B' : ''}${w.rawValue ? ' R' : ''}`

type Go = (panel: Panel) => unknown

export async function drawCcslPage($: EngineInterface, e: RenderInput<'Pane'>, ui: Frame, go: Go, page: CcslPanel): Promise<RenderChildren[]> {
  if (e.surface !== 'terminal' && e.surface !== 'desktop') return []
  if (page === 'ccsl-widget') return drawWidget($, e, ui, go)
  if (page === 'ccsl-add') return drawAdd($, e, ui, go)
  if (page === 'ccsl-color') return drawColor($, e, ui, go)
  if (page === 'ccsl-powerline') return drawPowerline($, e, ui, go)
  if (page === 'ccsl-layout') return drawLayout($, e, ui, go)
  if (page === 'ccsl-more') return drawMore($, e, ui, go)
  return drawEditor($, e, ui, go)
}

// A row that opens a page: the label, the value now, the chevron.
function navRow($: EngineInterface, e: RenderInput<'Pane'>, key: string, label: string, value: string, onPress: () => unknown) {
  const { Button, Text } = $.ui.resolve(e)
  return (
    <Button key={key} plain label={label} onPress={onPress}>
      <Text>{label.padEnd(14)}</Text>
      <Text bold wrap="truncate">
        {value}
      </Text>
      <Text dimColor>{' ›'}</Text>
    </Button>
  )
}

// The lines as the status line drew them, in their colors.
function previewRows($: EngineInterface, e: RenderInput<'Pane'>, shown: readonly string[]): RenderChildren[] {
  const { Text } = $.ui.resolve(e)
  return shown.map((l, i) => (
    <Text key={`ccsl-preview:${i}`} wrap="truncate">
      {parseAnsi(l).map(seg => (
        <Text color={seg.color} backgroundColor={seg.backgroundColor} bold={seg.bold} dimColor={seg.dim} inverse={seg.inverse}>
          {seg.text}
        </Text>
      ))}
    </Text>
  ))
}

// The preview under a sub-page: its title, "updating" while a refresh is
// due or running, the lines; nothing before the first preview.
async function previewBlock($: EngineInterface, e: RenderInput<'Pane'>, ui: Frame): Promise<RenderChildren[]> {
  const { Box, Text } = $.ui.resolve(e)
  const shown = await read($, preview)
  const isBusy = await read($, previewBusy)
  if (!isBusy && (shown === null || shown.length === 0)) return []
  return [
    <Box key="ccsl-preview-head" gap={1} marginTop={1}>
      <Text dimColor>{ui.t('ccslPreviewTitle')}</Text>
      {isBusy && <Text dimColor>{ui.t('ccslPreviewUpdating')}</Text>}
    </Box>,
    ...previewRows($, e, shown ?? []),
  ]
}

// The last action's result; `fallback`, dim, while there is none.
function messageRow($: EngineInterface, e: RenderInput<'Pane'>, note: CcslMessage | null, fallback = '') {
  const { Text } = $.ui.resolve(e)
  if (note === null)
    return (
      <Text key="ccsl-message" dimColor wrap="truncate">
        {fallback}
      </Text>
    )
  return (
    <Text key="ccsl-message" color={note.kind === 'error' ? 'error' : note.kind === 'warn' ? 'warning' : 'success'} wrap="truncate">
      {note.text}
    </Text>
  )
}

async function drawEditor($: EngineInterface, e: RenderInput<'Pane'>, ui: Frame, go: Go): Promise<RenderChildren[]> {
  const { Box, Text, Button } = $.ui.resolve(e)
  const { t, chip, chips } = ui
  const d = await read($, draft)
  const li = await read($, line)
  const isBusy = await read($, busy)
  const note = await read($, message)
  const shown = await read($, preview)
  const updating = await read($, previewBusy)
  const top = await read($, scroll)
  const home = await homeDir($)
  const back = chip('ccsl-back', t('ccslBackStatus'), false, () => go('statusline'))
  if (d === null) return [chips('ccsl-top', [back]), <Text key="ccsl-wait" dimColor>…</Text>]

  const c = d.config
  const shortPath = d.path.startsWith(home) ? `~${d.path.slice(home.length)}` : d.path
  const rows: RenderChildren[] = [
    chips(
      'ccsl-top',
      c === null
        ? [back]
        : [
            back,
            chip('ccsl-save', isBusy ? t('ccslSaving') : d.dirty ? t('ccslSave') : t('ccslSaved'), d.dirty && !isBusy, () => save($, 'preview')),
            chip('ccsl-revert', t('ccslRevert'), false, () => loadDraft($)),
          ],
    ),
    messageRow($, e, note, shortPath),
  ]
  const more = chip('ccsl-more', t('ccslMore'), false, () => go('ccsl-more'))
  if (c === null) {
    // The reduced state: no config to edit; More restores a backup or resets.
    rows.push(
      <Text key="ccsl-reduced" color="warning">
        {d.reason === 'missing' ? t('ccslMissing') : d.reason === 'old-version' ? t('ccslOld') : t('ccslBroken')}
      </Text>,
      chips('ccsl-nav', [more]),
    )
    return rows
  }

  const widgets = c.lines[li] ?? []
  const lineChips = c.lines.map((_, i) => chip(`ccsl-line:${i}`, t('ccslLine', { n: i + 1 }), i === li, () => chooseLine($, i)))
  if (c.lines.length < MAX_LINES) lineChips.push(chip('ccsl-add-line', t('ccslAddLine'), false, () => edit($, addLine).then(() => chooseLine($, c.lines.length))))
  if (c.lines.length > 1 && widgets.length === 0) lineChips.push(chip('ccsl-remove-line', t('ccslRemoveLine'), false, () => removeCurrentLine($)))
  rows.push(
    chips('ccsl-lines', lineChips),
    chips('ccsl-nav', [
      chip('ccsl-add', t('ccslAdd'), false, () => openAdd($, go), 'claude'),
      chip('ccsl-powerline', `${t('ccslPowerline')}${c.powerline?.enabled ? ' ✓' : ''}`, false, () => go('ccsl-powerline')),
      chip('ccsl-layout', t('ccslLayout'), false, () => go('ccsl-layout')),
      more,
    ]),
  )

  // The chosen line's widgets, one row each, opening the widget's page.
  const items: RenderChildren[] = widgets.map((w, i) => (
    <Button key={`ccsl-w:${i}`} plain label={catalogName(w.type)} onPress={() => update($, widget, () => i).then(() => go('ccsl-widget'))}>
      <Text>{`${i + 1}. ${catalogName(w.type)}${isKnownType(w.type) ? '' : ' ?'}`.padEnd(22)}</Text>
      <Text dimColor wrap="truncate">
        {detailOf(w)}
      </Text>
      <Text dimColor>{' ›'}</Text>
    </Button>
  ))
  if (widgets.length === 0)
    items.push(
      <Text key="ccsl-empty" dimColor>
        {t('ccslEmptyLine')}
      </Text>,
    )
  // A gap, the Preview chip, then the lines as the status line drew them, in
  // their colors.
  items.push(
    <Text key="ccsl-gap"> </Text>,
    chips('ccsl-preview-row', [chip('ccsl-preview-run', updating ? t('ccslPreviewUpdating') : t('ccslPreviewRun'), updating, () => previewDraft($), 'claude')]),
  )
  if (shown === null || shown.length === 0)
    items.push(
      <Text key="ccsl-preview-hint" dimColor wrap="wrap">
        {t('ccslPreviewHint')}
      </Text>,
    )
  else items.push(...previewRows($, e, shown))
  const room = Math.max(3, e.props.scroll.bodyRows - EDITOR_OVERHEAD)
  const { from, to } = windowByRows(editorHeights(widgets.length, shown?.length ?? 0), top, room)
  rows.push(
    <Box key="ccsl-list" flexDirection="column" flexGrow={1} flexShrink={1} overflow="hidden">
      {items.slice(from, to)}
    </Box>,
  )
  return rows
}

// One widget: where it sits, its moves, its flags, its colors.
async function drawWidget($: EngineInterface, e: RenderInput<'Pane'>, ui: Frame, go: Go): Promise<RenderChildren[]> {
  const { Box, Text } = $.ui.resolve(e)
  const { t, chip, chips, heading } = ui
  const d = await read($, draft)
  const li = await read($, line)
  const wi = await read($, widget)
  const widgets = d?.config?.lines[li] ?? []
  const w = wi === null ? undefined : widgets[wi]
  const back = chip('ccsl-widget-back', t('ccslBackEditor'), false, () => go('ccsl-editor'))
  if (w === undefined || wi === null)
    return [
      chips('ccsl-widget-top', [back]),
      <Text key="ccsl-widget-none" dimColor>
        {t('ccslNoWidget')}
      </Text>,
    ]
  const name = catalogName(w.type)
  const actions: RenderChildren[] = []
  if (wi > 0) actions.push(chip('ccsl-left', t('ccslMoveLeft'), false, () => moveChosen($, -1)))
  if (wi < widgets.length - 1) actions.push(chip('ccsl-right', t('ccslMoveRight'), false, () => moveChosen($, 1)))
  actions.push(chip('ccsl-remove', t('ccslRemove'), false, () => removeChosen($).then(() => go('ccsl-editor')), 'error'))
  return [
    chips('ccsl-widget-top', [back]),
    heading(t('ccslWidgetTitle', { name, n: li + 1, i: wi + 1, m: widgets.length })),
    chips('ccsl-widget-actions', actions),
    chips('ccsl-widget-flags', [
      chip('ccsl-bold', t('ccslBoldChip'), w.bold === true, () => toggleFlag($, 'bold')),
      chip('ccsl-raw', t('ccslRawChip'), w.rawValue === true, () => toggleFlag($, 'rawValue')),
    ]),
    <Box key="ccsl-widget-rows" flexDirection="column" marginTop={1}>
      {navRow($, e, 'ccsl-color', t('ccslColorRow'), w.color ?? t('ccslNone'), () => update($, colorField, () => 'color').then(() => go('ccsl-color')))}
      {navRow($, e, 'ccsl-bg', t('ccslBgRow'), w.backgroundColor ?? t('ccslNone'), () => update($, colorField, () => 'backgroundColor').then(() => go('ccsl-color')))}
    </Box>,
    ...(await previewBlock($, e, ui)),
  ]
}

async function openAdd($: EngineInterface, go: Go) {
  await update($, addScroll, () => 0)
  await go('ccsl-add')
  if ((await read($, version)).state === 'idle') await checkVersion($)
}

async function drawAdd($: EngineInterface, e: RenderInput<'Pane'>, ui: Frame, go: Go): Promise<RenderChildren[]> {
  const { Box, Text, Button } = $.ui.resolve(e)
  const { t, heading, chip, chips } = ui
  const d = await read($, draft)
  const li = await read($, line)
  const v = await read($, version)
  const cat = (await read($, addCategory)) ?? CATEGORIES[0]!
  const top = await read($, addScroll)
  const { gated, entries } = offerFor(d?.config ?? null, v, cat)
  const rows: RenderChildren[] = [
    chips('ccsl-add-top', [chip('ccsl-add-back', t('ccslBackEditor'), false, () => go('ccsl-editor'))]),
    heading(t('ccslAddTitle', { n: li + 1 })),
    v.state === 'checking' ? (
      <Text key="ccsl-add-version" dimColor>
        {t('ccslVersionChecking')}
      </Text>
    ) : gated ? (
      <Text key="ccsl-add-version" color="warning">
        {t('ccslVersionGate', { v: CATALOG_VERSION })}
      </Text>
    ) : (
      <Text key="ccsl-add-version" dimColor>
        {`ccstatusline ${v.text}`}
      </Text>
    ),
  ]
  if (!gated)
    rows.push(
      <Box key="ccsl-cats" flexWrap="wrap" columnGap={2}>
        {CATEGORIES.map(name => (
          <Button key={`ccsl-cat:${name}`} plain label={name} onPress={() => update($, addCategory, () => name).then(() => update($, addScroll, () => 0))}>
            <Text bold={name === cat} color={name === cat ? 'claude' : undefined} dimColor={name !== cat}>
              {name}
            </Text>
          </Button>
        ))}
      </Box>,
    )
  const room = Math.max(3, e.props.scroll.bodyRows - ADD_OVERHEAD)
  const from = Math.max(0, Math.min(top, entries.length - 1))
  rows.push(
    <Box key="ccsl-add-list" flexDirection="column" flexGrow={1} flexShrink={1} overflow="hidden">
      {entries.slice(from, from + room).map(en => (
        <Button key={`ccsl-add:${en.type}`} plain label={en.name} onPress={() => addChosen($, en.type).then(() => go('ccsl-editor'))}>
          <Text>{en.name.padEnd(22)}</Text>
          <Text dimColor>{en.type}</Text>
        </Button>
      ))}
    </Box>,
  )
  return rows
}

// A color typed in, in any of ccstatusline's spellings.
async function setOtherColor($: EngineInterface, raw: string) {
  const field = await read($, colorField)
  const value = normalizeColorInput(raw)
  if (value === null || !isColor(value, field === 'backgroundColor')) {
    $.ui.toast(`${raw.trim()} is not a color: ansi256:N (0 to 255), N, hex:RRGGBB or #RRGGBB`)
    return
  }
  await pickColor($, value)
}

async function drawColor($: EngineInterface, e: RenderInput<'Pane'>, ui: Frame, go: Go): Promise<RenderChildren[]> {
  // Input exists on the terminal and desktop surfaces only.
  if (e.surface !== 'terminal' && e.surface !== 'desktop') return []
  const { Box, Text, Button, Input } = $.ui.resolve(e)
  const { t, heading, chip, chips } = ui
  const d = await read($, draft)
  const li = await read($, line)
  const wi = await read($, widget)
  const field = await read($, colorField)
  const w = wi === null ? undefined : d?.config?.lines[li]?.[wi]
  const name = w === undefined ? '' : catalogName(w.type)
  const current = w?.[field]
  const palette = field === 'color' ? FOREGROUNDS : BACKGROUNDS
  const pick = (value: string | undefined) => pickColor($, value)
  const rows: RenderChildren[] = [
    chips('ccsl-color-top', [chip('ccsl-color-back', t('ccslBackWidget'), false, () => go('ccsl-widget'))]),
    heading(t(field === 'color' ? 'ccslColorTitle' : 'ccslBgTitle', { name })),
    <Text key="ccsl-color-current" dimColor>
      {`${t('ccslCurrent')}: `}
      {current !== undefined && <Text color={swatchOf(current)}>{'■ '}</Text>}
      {current ?? t('ccslNone')}
    </Text>,
  ]
  if (current !== undefined && !palette.includes(current))
    rows.push(
      <Text key="ccsl-color-kept" color="warning">
        {t('ccslKept')}
      </Text>,
    )
  rows.push(
    <Box key="ccsl-palette" flexWrap="wrap" marginTop={1}>
      <Button key="ccsl-pal:none" plain label={t('ccslNone')} onPress={() => pick(undefined)}>
        <Text bold={current === undefined} color={current === undefined ? 'claude' : undefined}>
          {`  ${t('ccslNone')}`.padEnd(26)}
        </Text>
      </Button>
      {palette.map(value => (
        <Button key={`ccsl-pal:${value}`} plain label={value} onPress={() => pick(value)}>
          <Text color={swatchOf(value)}>{'■ '}</Text>
          <Text bold={value === current} color={value === current ? 'claude' : undefined}>
            {value.replace(/^bg/, '').padEnd(24)}
          </Text>
        </Button>
      ))}
    </Box>,
    heading(t('ccslOtherTitle')),
    <Input
      key="ccsl-color-other"
      label={t('ccslOtherLabel')}
      value={current !== undefined && !palette.includes(current) ? current : ''}
      placeholder="ansi256:235"
      submitLabel="set"
      onSubmit={value => setOtherColor($, value)}
    />,
    ...(await previewBlock($, e, ui)),
  )
  return rows
}

async function drawPowerline($: EngineInterface, e: RenderInput<'Pane'>, ui: Frame, go: Go): Promise<RenderChildren[]> {
  const { Box, Text, Button } = $.ui.resolve(e)
  const { t, heading, chip, chips } = ui
  const d = await read($, draft)
  const pl = d?.config?.powerline ?? {}
  const enabled = pl.enabled === true
  const theme = pl.theme ?? 'nord-aurora'
  return [
    chips('ccsl-pl-top', [chip('ccsl-pl-back', t('ccslBackEditor'), false, () => go('ccsl-editor'))]),
    heading(t('ccslPowerline')),
    chips('ccsl-pl-switch', [
      chip('ccsl-pl-on', t('on'), enabled, () => edit($, c => setPowerline(c, { enabled: true }))),
      chip('ccsl-pl-off', t('off'), !enabled, () => edit($, c => setPowerline(c, { enabled: false }))),
    ]),
    heading(t('ccslTheme')),
    <Box key="ccsl-themes" flexWrap="wrap">
      {POWERLINE_THEMES.map(name => (
        <Button key={`ccsl-theme:${name}`} plain label={name} onPress={() => edit($, c => setPowerline(c, { theme: name }))}>
          <Text bold={name === theme} color={name === theme ? 'claude' : undefined} dimColor={name !== theme}>
            {`${name === theme ? '◆' : ' '} ${name}`.padEnd(17)}
          </Text>
        </Button>
      ))}
    </Box>,
    chips('ccsl-pl-flags', [
      chip('ccsl-pl-align', t('ccslAutoAlign'), pl.autoAlign === true, () => edit($, c => setPowerline(c, { autoAlign: !(c.powerline?.autoAlign === true) }))),
      chip('ccsl-pl-continue', t('ccslContinue'), pl.continueThemeAcrossLines === true, () =>
        edit($, c => setPowerline(c, { continueThemeAcrossLines: !(c.powerline?.continueThemeAcrossLines === true) })),
      ),
    ]),
    ...(await previewBlock($, e, ui)),
  ]
}

async function drawLayout($: EngineInterface, e: RenderInput<'Pane'>, ui: Frame, go: Go): Promise<RenderChildren[]> {
  const { t, heading, chip, chips } = ui
  const d = await read($, draft)
  const c = d?.config
  const flex = c?.flexMode ?? 'full'
  const compact = c?.compactThreshold ?? 60
  return [
    chips('ccsl-layout-top', [chip('ccsl-layout-back', t('ccslBackEditor'), false, () => go('ccsl-editor'))]),
    heading(t('ccslFlex')),
    chips(
      'ccsl-flex',
      FLEX_MODES.map(mode => chip(`ccsl-flex:${mode}`, mode, mode === flex, () => edit($, x => setLayout(x, { flexMode: mode })))),
    ),
    heading(t('ccslCompact')),
    chips(
      'ccsl-compact',
      COMPACT_THRESHOLDS.map(n => chip(`ccsl-compact:${n}`, `${n}%`, n === compact, () => edit($, x => setLayout(x, { compactThreshold: n })))),
    ),
    heading(t('ccslMinimalist')),
    chips('ccsl-minimalist-row', [chip('ccsl-minimalist', t('ccslMinimalist'), c?.minimalistMode === true, () => edit($, x => setLayout(x, { minimalistMode: !(x.minimalistMode === true) })))]),
    ...(await previewBlock($, e, ui)),
  ]
}

async function drawMore($: EngineInterface, e: RenderInput<'Pane'>, ui: Frame, go: Go): Promise<RenderChildren[]> {
  const { Box, Text } = $.ui.resolve(e)
  const { t, heading, chip, chips } = ui
  const names = await read($, backups)
  const note = await read($, message)
  const adapter = await adapterOf($)
  const d = await read($, draft)
  return [
    chips('ccsl-more-top', [chip('ccsl-more-back', t('ccslBackEditor'), false, () => go('ccsl-editor'))]),
    heading(t('ccslRestoreTitle')),
    <Box key="ccsl-backups" flexDirection="column">
      {names.length === 0 ? (
        <Text dimColor>{t('ccslNoBackups')}</Text>
      ) : (
        names.map(name => navRow($, e, `ccsl-restore:${name}`, backupStamp(name), '', () => restore($, name).then(() => go('ccsl-editor'))))
      )}
    </Box>,
    heading(t('ccslMore')),
    chips('ccsl-more-actions', [
      chip('ccsl-reset', t('ccslReset'), false, () => resetToStarter($).then(() => go('ccsl-editor'))),
      chip('ccsl-save-blind', t('ccslSaveBlind'), false, () => save($, 'blind'), d?.dirty === true ? undefined : 'inactive'),
    ]),
    <Text key="ccsl-more-note" dimColor>
      {adapter === null ? t('ccslNoAdapter') : t('ccslBlindNote')}
    </Text>,
    messageRow($, e, note),
  ]
}
