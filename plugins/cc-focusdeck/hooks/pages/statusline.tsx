// The Status line page, opened from Settings: ccstatusline detected, installed,
// looked after and removed, and its layout edited from here.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderChildren, RenderInput } from 'claude-code'

import type { Panel, StatusLineInfo, StatusLineVersion } from '../../types'
import {
  classify,
  commandOf,
  CONFIG_PATH,
  CONFIGURATOR_COMMAND,
  INSTALL_COMMAND,
  installBlock,
  isOp,
  REPO_URL,
  sameBlock,
  STARTER_CONFIG,
  type StatusLineOp,
  summarizeConfig,
  versionCommand,
} from '../lib/ccstatusline'
import { hasTool, homeDir, isWindows, shellArgv } from '../lib/platform'
import { readSettings, writeSettings } from '../lib/settings-file'
import type { Frame } from '../ui/frame'

const statusLine = atom({ plugin: 'cc-focusdeck', key: 'statusLine' } as const, null)
const statusLineVersion = atom({ plugin: 'cc-focusdeck', key: 'statusLineVersion' } as const, { state: 'idle', text: '' } satisfies StatusLineVersion)
const statusLineBusy = atom({ plugin: 'cc-focusdeck', key: 'statusLineBusy' } as const, false)
const statusLineConfirm = atom({ plugin: 'cc-focusdeck', key: 'statusLineConfirm' } as const, false)

const OP_KEY = 'statusLineOp'
const REMOVED_KEY = 'statusLineRemoved'

async function configPath($: EngineInterface) {
  return `${await homeDir($)}/${CONFIG_PATH}`
}

async function readOp($: EngineInterface): Promise<StatusLineOp | null> {
  const op = await $.store.get(OP_KEY)
  return isOp(op) ? op : null
}

// What the settings and the machine say now.
export async function detectStatusLine($: EngineInterface) {
  let info: StatusLineInfo
  try {
    const { data } = await readSettings($)
    const op = await readOp($)
    const path = await configPath($)
    const configExists = await $.fs.exists(path)
    const summary = configExists ? summarizeConfig(await $.fs.read(path)) : null
    info = {
      kind: classify(data.statusLine, op),
      command: commandOf(data.statusLine),
      configExists,
      summary,
      hasNpx: await hasTool($, 'npx'),
      removed: (await $.store.get(REMOVED_KEY)) !== undefined,
    }
  } catch (error) {
    info = { kind: 'none', command: null, configExists: false, summary: null, hasNpx: false, removed: false, error: String(error instanceof Error ? error.message : error) }
  }
  await update($, statusLine, () => info)
  await update($, statusLineConfirm, () => false)
}

// An Install that did not finish: installed after all when the settings hold
// its block, otherwise forgotten (the starter config, if written, stays; it is
// harmless without the setting).
async function reconcile($: EngineInterface) {
  const op = await readOp($)
  if (op === null || op.phase !== 'installing') return
  try {
    const { data } = await readSettings($)
    if (sameBlock(data.statusLine, op.block)) await $.store.set(OP_KEY, { ...op, phase: 'installed' } satisfies StatusLineOp)
    else await $.store.delete(OP_KEY)
  } catch {}
}

export async function loadStatusLine($: EngineInterface) {
  await reconcile($)
  await detectStatusLine($)
}

// For the icons: whether the ccstatusline config draws powerline glyphs.
export async function readStatusLinePowerline($: EngineInterface): Promise<boolean> {
  return (await read($, statusLine))?.summary?.powerline === true
}

// For the editor: the configured command, whatever set it.
export async function readStatusLineCommand($: EngineInterface): Promise<string | null> {
  return (await read($, statusLine))?.command ?? null
}

// For the Settings chip: whether ccstatusline draws the status line.
export async function readStatusLineIsCcsl($: EngineInterface): Promise<boolean> {
  const kind = (await read($, statusLine))?.kind
  return kind === 'managed' || kind === 'unmanaged'
}

// Actions ----------------------------------------------------------------------

async function busy($: EngineInterface, work: () => Promise<void>) {
  if (await read($, statusLineBusy)) return
  await update($, statusLineBusy, () => true)
  try {
    await work()
  } catch (error) {
    $.ui.toast(error instanceof Error ? error.message : String(error))
  } finally {
    await update($, statusLineBusy, () => false)
  }
}

// The record first, then the starter config where none exists, then the
// setting; idempotent: a record already installed is left alone.
async function install($: EngineInterface) {
  await busy($, async () => {
    const existing = await readOp($)
    if (existing?.phase === 'installed') return
    const snapshot = await readSettings($)
    const op: StatusLineOp = { phase: 'installing', predecessor: snapshot.data.statusLine ?? null, block: installBlock(), wroteConfig: false }
    await $.store.set(OP_KEY, op)
    const path = await configPath($)
    if (!(await $.fs.exists(path))) {
      await $.fs.write(path, `${JSON.stringify(STARTER_CONFIG, null, 2)}\n`)
      op.wroteConfig = true
      await $.store.set(OP_KEY, op)
    }
    await writeSettings($, snapshot, { ...snapshot.data, statusLine: op.block })
    await $.store.set(OP_KEY, { ...op, phase: 'installed' } satisfies StatusLineOp)
    await $.store.delete(REMOVED_KEY)
    await detectStatusLine($)
    $.ui.toast('ccstatusline installed: it draws from the next session on')
  })
}

// Only what this page installed, and only while the setting is still the block
// it wrote: the predecessor comes back (or the key goes). The ccstatusline
// config folder is never touched.
async function uninstall($: EngineInterface) {
  await busy($, async () => {
    const op = await readOp($)
    if (op === null || op.phase !== 'installed') throw new Error('Nothing installed from here to uninstall')
    const snapshot = await readSettings($)
    if (!sameBlock(snapshot.data.statusLine, op.block)) throw new Error('The status line was changed outside this page: not touching it')
    const data = { ...snapshot.data }
    if (op.predecessor === null || op.predecessor === undefined) delete data.statusLine
    else data.statusLine = op.predecessor
    await writeSettings($, snapshot, data)
    await $.store.delete(OP_KEY)
    await detectStatusLine($)
    $.ui.toast(op.predecessor ? 'Your previous status line is back' : 'ccstatusline uninstalled')
  })
}

// A status line the person set themselves: removed only after a second press,
// and kept in the store so it can be put back.
async function removeUnmanaged($: EngineInterface) {
  if (!(await read($, statusLineConfirm))) {
    await update($, statusLineConfirm, () => true)
    return
  }
  await busy($, async () => {
    const snapshot = await readSettings($)
    if (snapshot.data.statusLine === undefined) return
    await $.store.set(REMOVED_KEY, snapshot.data.statusLine)
    const data = { ...snapshot.data }
    delete data.statusLine
    await writeSettings($, snapshot, data)
    await detectStatusLine($)
    $.ui.toast('statusLine removed from settings.json; "Put it back" restores it')
  })
}

async function putBack($: EngineInterface) {
  await busy($, async () => {
    const removed = await $.store.get(REMOVED_KEY)
    if (removed === undefined) return
    const snapshot = await readSettings($)
    if (snapshot.data.statusLine !== undefined) throw new Error('A status line is set already')
    await writeSettings($, snapshot, { ...snapshot.data, statusLine: removed })
    await $.store.delete(REMOVED_KEY)
    await detectStatusLine($)
    $.ui.toast('Status line put back')
  })
}

// The configured command with --version, through the platform's shell.
async function checkVersion($: EngineInterface) {
  const info = await read($, statusLine)
  const command = info?.command ?? INSTALL_COMMAND
  await update($, statusLineVersion, () => ({ state: 'checking', text: '' }))
  try {
    const ran = await $.process.run(shellArgv(versionCommand(command), await isWindows($)), { timeoutMs: 20_000 })
    const line = (ran.exitCode === 0 ? ran.stdout : ran.stderr).trim().split('\n')[0] ?? ''
    await update($, statusLineVersion, () => (ran.exitCode === 0 ? { state: 'ok', text: line } : { state: 'failed', text: line || `exit ${ran.exitCode}` }))
  } catch (error) {
    await update($, statusLineVersion, () => ({ state: 'failed', text: error instanceof Error ? error.message : String(error) }))
  }
}

// Drawing ----------------------------------------------------------------------

export async function drawStatusLinePage($: EngineInterface, e: RenderInput<'Pane'>, ui: Frame, go: (panel: Panel) => unknown): Promise<RenderChildren[]> {
  if (e.surface !== 'terminal' && e.surface !== 'desktop') return []
  const { Box, Text } = $.ui.resolve(e)
  const { t, heading, chips, chip } = ui
  const info = await read($, statusLine)
  const version = await read($, statusLineVersion)
  const isBusy = await read($, statusLineBusy)
  const confirm = await read($, statusLineConfirm)
  const rows: RenderChildren[] = [
    chips('statusline-nav', [chip('statusline-back', t('backSettings'), false, () => go('settings'))]),
    <Text key="statusline-intro">{t('slIntro')}</Text>,
  ]
  if (info === null) {
    rows.push(<Text key="statusline-wait" dimColor>…</Text>)
    return rows
  }
  // With ccstatusline in place the chips say it all; without it, a word on
  // what Install will do.
  const isCcsl = info.kind === 'unmanaged' || info.kind === 'managed'
  if (!isCcsl) rows.push(<Text key="statusline-state">{info.kind === 'none' ? t('slNone') : t('slOther')}</Text>)
  if (info.error !== undefined) rows.push(<Text key="statusline-error" color="red">{info.error}</Text>)
  if (isCcsl) rows.push(chips('statusline-edit-row', [chip('statusline-edit', t('ccslRow'), true, () => go('ccsl-editor'))]))

  const actions: RenderChildren[] = []
  if (!isCcsl) actions.push(chip('statusline-install', t('slInstall'), isBusy, () => install($)))
  if (isCcsl) actions.push(chip('statusline-version-check', t('slCheckVersion'), version.state === 'checking', () => checkVersion($)))
  if (info.kind === 'managed') actions.push(chip('statusline-uninstall', t('slUninstall'), false, () => uninstall($)))
  if (info.kind === 'unmanaged') actions.push(chip('statusline-remove', confirm ? t('slRemoveConfirm') : t('slRemove'), confirm, () => removeUnmanaged($)))
  if (info.kind === 'none' && info.removed) actions.push(chip('statusline-putback', t('slPutBack'), false, () => putBack($)))
  rows.push(chips('statusline-actions', actions))
  if (version.state !== 'idle')
    rows.push(
      <Text key="statusline-version" color={version.state === 'failed' ? 'red' : undefined} dimColor={version.state !== 'failed'}>
        {version.state === 'checking' ? t('slVersionChecking') : version.text}
      </Text>,
    )
  if (!info.hasNpx && info.kind === 'none') rows.push(<Text key="statusline-nonpx" color="warning">{t('slNoNpx')}</Text>)
  rows.push(
    heading(t('slConfigurator')),
    <Box key="statusline-configurator">
      <Text bold>{CONFIGURATOR_COMMAND}</Text>
    </Box>,
    <Text key="statusline-note" dimColor>
      {t('slNote')}
    </Text>,
    <Box key="statusline-about" flexDirection="column" marginTop={1}>
      <Text dimColor>{t('slAbout')}</Text>
      <Text color="claude">{REPO_URL}</Text>
    </Box>,
  )
  return rows
}
