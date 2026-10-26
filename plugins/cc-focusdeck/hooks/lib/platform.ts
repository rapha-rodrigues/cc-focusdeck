// Where the person's files are and what the machine is. Pure wrappers over $.env.

import type { EngineInterface } from 'claude-code'

export async function homeDir($: EngineInterface) {
  const windowsHome = await $.env.get('USERPROFILE')
  const home = windowsHome ?? (await $.env.get('HOME')) ?? '.'
  return home.split('\\').join('/')
}

export async function isWindows($: EngineInterface) {
  const os = await $.env.get('OS')
  return os === 'Windows_NT'
}

// A command line, run the way the platform's own shell reads it.
export function shellArgv(command: string, isWin: boolean): string[] {
  return isWin ? ['cmd', '/d', '/s', '/c', command] : ['sh', '-c', command]
}

// Exit 0 when `name` is on PATH.
export function whichArgv(name: string, isWin: boolean): string[] {
  return isWin ? ['cmd', '/d', '/c', 'where', name] : ['sh', '-c', 'command -v -- "$1"', 'sh', name]
}

export async function hasTool($: EngineInterface, name: string): Promise<boolean> {
  try {
    const ran = await $.process.run(whichArgv(name, await isWindows($)), { timeoutMs: 5000 })
    return ran.exitCode === 0
  } catch {
    return false
  }
}

// Replaces a file's text in one step on POSIX. The new text comes on stdin.
// A copy of the file (mode kept) takes the text, then moves into place, so an
// interrupted write never leaves the file truncated and a 0600 file stays
// 0600; a new file is made private. A `mkdir` lock beside the file keeps two
// of these from interleaving (exit 75 while another holds it; a lock older
// than a minute is taken over). `token` makes the sibling's name unique.
// `expect`, when given, is what the file must still be: the path of a file
// holding the text read, or `-` for a file that did not exist. That check is
// the last step before the move, under the lock; a file that changed is left
// as it is (exit 76). The expect file is removed on the way out.
export const REPLACE_LOCKED_EXIT = 75
export const REPLACE_CHANGED_EXIT = 76
const REPLACE_CLEANUP = 'rm -f -- "$tmp"; case $expect in ""|-) ;; *) rm -f -- "$expect" ;; esac'
const REPLACE_SCRIPT = [
  'set -e',
  'f=$1; tmp="$1.tmp-$2"; lock="$1.cc-focusdeck.lock"; expect=${3-}',
  `trap '${REPLACE_CLEANUP}' EXIT`,
  'if ! mkdir "$lock" 2>/dev/null; then',
  '  if [ -n "$(find "$lock" -maxdepth 0 -mmin +1 2>/dev/null)" ]; then rmdir "$lock" 2>/dev/null; mkdir "$lock" 2>/dev/null || exit 75; else exit 75; fi',
  'fi',
  `trap '${REPLACE_CLEANUP}; rmdir "$lock" 2>/dev/null' EXIT`,
  'umask 077',
  'if [ -f "$f" ]; then cp -p -- "$f" "$tmp"; fi',
  'cat > "$tmp"',
  'if [ "$expect" = - ]; then [ ! -e "$f" ] || exit 76',
  'elif [ -n "$expect" ]; then cmp -s -- "$expect" "$f" || exit 76; fi',
  'mv -f -- "$tmp" "$f"',
].join('\n')
export function replaceFileArgv(path: string, token: string = Math.random().toString(36).slice(2, 8), expect?: string): string[] {
  const argv = ['sh', '-c', REPLACE_SCRIPT, 'sh', path, token]
  return expect === undefined ? argv : [...argv, expect]
}

// A private copy that keeps the source's mode (backups, candidates).
export function copyFileArgv(from: string, to: string): string[] {
  return ['sh', '-c', 'umask 077 && cp -p -- "$1" "$2"', 'sh', from, to]
}

// Windows: a file written beside the target moved over it (a rename on the
// same volume), the target's ACL kept.
export function moveFileWinArgv(from: string, to: string): string[] {
  return ['cmd', '/d', '/c', 'move', '/Y', from, to]
}
export function copyFileWinArgv(from: string, to: string): string[] {
  return ['cmd', '/d', '/c', 'copy', '/Y', from, to]
}

// A private file from stdin (the editor's candidates), on POSIX.
export function writePrivateArgv(path: string): string[] {
  return ['sh', '-c', 'umask 077 && cat > "$1"', 'sh', path]
}

// A file of the plugin's own making removed (a candidate after its dry run).
export function removeFileArgv(path: string, isWin: boolean): string[] {
  return isWin ? ['cmd', '/d', '/c', 'del', '/q', path] : ['rm', '-f', '--', path]
}
