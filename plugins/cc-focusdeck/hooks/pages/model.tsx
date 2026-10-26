// The Model page: the model and effort this session runs with, the permission
// mode it is in, and the mode new sessions start in.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderChildren, RenderInput } from 'claude-code'

import type { Effort } from '../../types'
import { RAINBOW } from '../lib/focus'
import { modeName } from '../lib/i18n'
import { EFFORT_LEVELS, EFFORT_TINT, familyOf, isEffort, MODEL_CHOICES, modeWords, readableModel, START_MODES, type StartMode } from '../lib/session-controls'
import { readSettings, writeSettings } from '../lib/settings-file'
import { rainbow, type Frame } from '../ui/frame'

const effortChoice = atom({ plugin: 'cc-focusdeck', key: 'effort' } as const, null)
const startMode = atom({ plugin: 'cc-focusdeck', key: 'defaultMode' } as const, null)
const effortSeen = atom({ plugin: 'cc-focusdeck', key: 'sessionEffort' } as const, null)
const modelSeen = atom({ plugin: 'cc-focusdeck', key: 'sessionModel' } as const, null)

const EFFORT_KEY = 'effort'
const LAST_EFFORT_KEY = 'lastSessionEffort'

// The theme token Claude Code draws each permission mode with.
const MODE_TOKEN: Readonly<Record<string, string>> = {
  default: 'text',
  plan: 'planMode',
  acceptEdits: 'autoAccept',
  auto: 'warning',
  dontAsk: 'warning',
  bypassPermissions: 'error',
}
const modeToken = (mode: string) => MODE_TOKEN[mode] ?? 'text'

export function readEffort($: EngineInterface) {
  return read($, effortChoice)
}

// Changing ---------------------------------------------------------------------

// The effort every request of this session goes out with. The /config row
// for effort, where there is one, is set too, so Claude Code shows the same.
async function chooseEffort($: EngineInterface, level: Effort) {
  await update($, effortChoice, () => level)
  await $.store.set(EFFORT_KEY, level)
  try {
    const rows = await $.config.list()
    const effortRow = rows.find(({ key, options }) => /effort/i.test(key) && options?.includes(level) === true)
    if (effortRow !== undefined) await $.config.set({ key: effortRow.key, value: level })
  } catch {}
  $.ui.toast(`Effort set to ${level}`)
}

// The model, through Claude Code's own /model, so everything agrees on it.
async function chooseModel($: EngineInterface, alias: string) {
  await $.command.run({ args: alias, command: 'model' })
  const id = await $.session.model()
  await update($, modelSeen, () => id)
  $.ui.toast(`Model: ${readableModel(id)}`)
}

// `permissions.defaultMode` in the user's settings: what new sessions start
// in. The running session's mode is shift+tab's; no plugin can set it.
async function chooseStartMode($: EngineInterface, mode: StartMode) {
  const snapshot = await readSettings($)
  const permissions = (snapshot.data.permissions as Record<string, unknown> | undefined) ?? {}
  await writeSettings($, snapshot, { ...snapshot.data, permissions: { ...permissions, defaultMode: mode } })
  await update($, startMode, () => mode)
  $.ui.toast(`New sessions start in ${modeWords(mode)} mode`)
}

// Tracking ---------------------------------------------------------------------

export async function trackModel($: EngineInterface, id: string) {
  if (id !== (await read($, modelSeen))) await update($, modelSeen, () => id)
}

// The level a request actually ran at, as the engine reports it.
export async function trackEffort($: EngineInterface, level: unknown) {
  if (!isEffort(level) || level === (await read($, effortSeen))) return
  await update($, effortSeen, () => level)
  await $.store.set(LAST_EFFORT_KEY, level)
}

export async function loadModel($: EngineInterface) {
  const kept = await $.store.get(EFFORT_KEY)
  if (isEffort(kept)) await update($, effortChoice, () => kept)
  try {
    const user = (await $.settings.read({ source: 'user' })) as { permissions?: { defaultMode?: string } }
    const configured = user.permissions?.defaultMode
    await update($, startMode, () => configured ?? 'default')
  } catch {}
}

// Drawing ----------------------------------------------------------------------

export async function drawModeTab($: EngineInterface, e: RenderInput<'Pane'>, ui: Frame): Promise<RenderChildren[]> {
  if (e.surface !== 'terminal' && e.surface !== 'desktop') return []
  const { Text, Button } = $.ui.resolve(e)
  const { lng, t, heading, chips, chip, framed } = ui
  const family = familyOf(await read($, modelSeen))
  const level = (await read($, effortChoice)) ?? (await read($, effortSeen))
  // The start mode marked: the one settings.json holds. The running session's
  // mode is not shown: only the classic hook events carry it, and Claude Code's
  // built-in guard keeps those from user plugins on Team and Enterprise logins.
  const marked = await read($, startMode)
  const onModel = (alias: string) => () => chooseModel($, alias).catch((error: unknown) => $.ui.toast(`Could not switch the model: ${String(error)}`))
  const onStartMode = (mode: StartMode) => () => chooseStartMode($, mode).catch((error: unknown) => $.ui.toast(`Could not save the mode: ${String(error)}`))

  // Five cells, lit up to the level in its tint; max lights them as a rainbow.
  const litUpTo = level === null ? -1 : EFFORT_LEVELS.indexOf(level)
  const meter = (
    <Text>
      {EFFORT_LEVELS.map((each, i) =>
        i <= litUpTo ? <Text color={level === 'max' ? RAINBOW[i * 2] : (EFFORT_TINT[each] ?? undefined)}>▰</Text> : <Text dimColor>▱</Text>,
      )}
    </Text>
  )

  // An effort chip: its word in its tint, filled when chosen; max as ✦ and a rainbow word.
  const effortChip = (each: Effort) => {
    const tint = EFFORT_TINT[each]
    const isOn = each === level
    const word =
      tint === null ? (
        <Text bold={isOn}>
          {isOn && '✦ '}
          {rainbow(each).map(({ ch, color }) => (
            <Text color={color}>{ch}</Text>
          ))}
        </Text>
      ) : isOn ? (
        <Text bold color="#111111" backgroundColor={tint}>{` ${each} `}</Text>
      ) : (
        <Text color={tint}>{each}</Text>
      )
    return framed(
      `effort:${each}`,
      isOn,
      <Button key={`effort:${each}`} plain label={each} onPress={() => chooseEffort($, each)}>
        {word}
      </Button>,
      tint ?? RAINBOW[7],
    )
  }

  const startModeChip = (mode: StartMode) =>
    framed(
      `start-mode:${mode}`,
      mode === marked,
      <Button key={`start-mode:${mode}`} plain label={modeName(lng, mode)} onPress={onStartMode(mode)}>
        <Text color={modeToken(mode)} bold={mode === marked}>
          {modeName(lng, mode)}
        </Text>
      </Button>,
    )

  const rows: RenderChildren[] = [
    heading(t('model')),
    chips('model-choices', [
      ...MODEL_CHOICES.map(m => chip(`pick-model:${m.alias}`, m.label, m.alias === family, onModel(m.alias))),
      <Button key="model-reset" plain dimColor label={t('modelDefault')} onPress={onModel('default')} />,
    ]),
    heading(t('effort'), meter),
    chips('effort-choices', EFFORT_LEVELS.map(effortChip)),
    heading(t('newSessions')),
    chips('start-mode-choices', START_MODES.map(startModeChip)),
    <Text key="shift-tab" dimColor>
      {t('shiftTab')}
    </Text>,
  ]
  if (marked === 'bypassPermissions')
    rows.push(
      <Text key="mode-caution" color="warning">
        {t('bypassWarning')}
      </Text>,
    )
  return rows
}
