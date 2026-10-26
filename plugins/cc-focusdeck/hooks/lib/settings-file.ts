// The one way this plugin writes ~/.claude/settings.json: a snapshot read
// first, a write refused when the file changed in between (nothing another
// tool wrote is lost), one backup before the first change, and on POSIX the
// new text landing in one step.

import type { ConfigValue, EngineInterface } from 'claude-code'

import { homeDir, isWindows, moveFileWinArgv, removeFileArgv, REPLACE_CHANGED_EXIT, REPLACE_LOCKED_EXIT, replaceFileArgv, writePrivateArgv } from './platform'

export type SettingsSnapshot = { path: string; text: string; data: Record<string, unknown>; exists: boolean }

// What a file must still hold for a replace to go ahead (null: no file), and
// the error to throw when it does not.
export type Expected = { text: string | null; changed: () => Error }

export async function settingsPath($: EngineInterface) {
  return `${await homeDir($)}/.claude/settings.json`
}

// The user settings as they stand: the text and the parsed object. A file
// that does not parse throws here, so it is never rewritten.
export async function readSettings($: EngineInterface): Promise<SettingsSnapshot> {
  const path = await settingsPath($)
  const exists = await $.fs.exists(path)
  const text = exists ? await $.fs.read(path) : '{}'
  const data: unknown = JSON.parse(text)
  if (data === null || typeof data !== 'object' || Array.isArray(data)) throw new Error('settings.json is not a JSON object')
  return { path, text, data: data as Record<string, unknown>, exists }
}

// Writes `data` over the file the snapshot came from. Refused when the file
// changed since the snapshot: checked here before the backup, and checked
// again by replaceFile as its last step before the move, so an edit that
// lands in between is kept, not overwritten.
export async function writeSettings($: EngineInterface, snapshot: SettingsSnapshot, data: Record<string, unknown>) {
  const changed = () => new Error('settings.json changed meanwhile: try again')
  const now = (await $.fs.exists(snapshot.path)) ? await $.fs.read(snapshot.path) : '{}'
  if (now !== snapshot.text) throw changed()
  const backup = `${snapshot.path}.cc-focusdeck.bak`
  if (!(await $.fs.exists(backup))) await $.fs.write(backup, snapshot.text)
  await replaceFile($, snapshot.path, `${JSON.stringify(data, null, 2)}\n`, { text: snapshot.exists ? snapshot.text : null, changed })
}

// `text` over the file at `path`, in one step on every platform. With
// `expected`, the file is compared with it as the last step before the move
// and left as it is when it differs. On POSIX that comparison runs under the
// replace's lock; Windows has no lock, so there another writer can still land
// between the comparison and the move.
export async function replaceFile($: EngineInterface, path: string, text: string, expected?: Expected) {
  const token = Math.random().toString(36).slice(2, 8)
  if (await isWindows($)) {
    const tmp = `${path}.tmp-${token}`
    await $.fs.write(tmp, text)
    if (expected !== undefined && ((await $.fs.exists(path)) ? await $.fs.read(path) : null) !== expected.text) {
      await $.process.run(removeFileArgv(tmp, true), { timeoutMs: 10_000 })
      throw expected.changed()
    }
    const moved = await $.process.run(moveFileWinArgv(tmp, path), { timeoutMs: 10_000 })
    if (moved.exitCode !== 0) throw new Error(moved.stderr.trim() || `move exited with ${moved.exitCode}`)
    return
  }
  let expect: string | undefined
  if (expected !== undefined) {
    expect = expected.text === null ? '-' : `${path}.cc-focusdeck.expect-${token}`
    if (expected.text !== null) {
      const wrote = await $.process.run(writePrivateArgv(expect), { stdin: expected.text })
      if (wrote.exitCode !== 0) throw new Error(wrote.stderr.trim() || `sh exited with ${wrote.exitCode}`)
    }
  }
  const ran = await $.process.run(replaceFileArgv(path, token, expect), { stdin: text })
  if (ran.exitCode === REPLACE_LOCKED_EXIT) throw new Error('another save is in progress: try again in a moment')
  if (ran.exitCode === REPLACE_CHANGED_EXIT && expected !== undefined) throw expected.changed()
  if (ran.exitCode !== 0) throw new Error(ran.stderr.trim() || `sh exited with ${ran.exitCode}`)
}

// Sets one top-level key (undefined deletes it): through the /config row when
// the engine has one for it, else through the file. Returns whether anything changed.
export async function setSettingsKey($: EngineInterface, key: string, value: unknown): Promise<boolean> {
  if (value !== undefined) {
    try {
      const row = (await $.config.list()).find(r => r.key === key)
      if (row !== undefined) {
        const set = await $.config.set({ key, value: value as ConfigValue })
        if (set.deny === undefined) return true
      }
    } catch {}
  }
  const snapshot = await readSettings($)
  if (JSON.stringify(snapshot.data[key]) === JSON.stringify(value)) return false
  const data = { ...snapshot.data }
  if (value === undefined) delete data[key]
  else data[key] = value
  await writeSettings($, snapshot, data)
  return true
}
