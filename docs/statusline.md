# Status line (ccstatusline)

[ccstatusline](https://github.com/sirmalloc/ccstatusline) is a separate, third-party project by Matthew Breedlove (sirmalloc), MIT-licensed. Nothing of it ships in this plugin: the Status line page under **Settings** recommends it, installs it, looks after it and, from **Layout Editor**, edits its configuration in place. Linux, macOS and Windows alike.

## The page

It opens with a line on what it is for; the disclaimer and the project's address close it.

- **Install** writes the `statusLine` block into `~/.claude/settings.json` (keeping whatever was there, for **Uninstall**) and a starter config at `~/.config/ccstatusline/settings.json` where none exists. A status line you set yourself is left alone, with a two-press removal that can be put back.
- **Check version** runs your own configured command with `--version`. The full configurator (ccstatusline's own TUI) is a command shown on the page, to run in a terminal.
- **Layout Editor** opens the editor below. It edits your own config file whoever installed ccstatusline.

## The editor

One shape throughout: chips for actions and choices, `label  value ›` rows to open a page. The editor page holds Back, Save and Revert; the line chips (`Line 1` to `Line 3`, `+ line`, `✕ line` on an empty line); the page chips `+ Add widget`, `Powerline`, `Layout`, `More`; then the chosen line's widgets, one row each. A widget's row opens its page: move left or right, remove, bold, raw value, and the Color and Background rows that open the palette.

Under the widgets, after a gap, the **⟳ Preview** chip and the preview: the lines as your own status line command drew the draft, in their colors, with this session's folder and model (so the git and model widgets show the real thing) and sample cost, context and usage numbers. Nothing is written by a preview. The preview follows the draft: every change on the editor, widget, color, powerline and layout pages redraws it a moment later (a run of changes becomes one run; a result older than the newest change is dropped), and the sub-pages show it under their content. The last preview is kept for the next session and shown at once when the file is still the config it was drawn from; with nothing kept, one is drawn on opening. The Color page stays open after a pick, so colors can be tried against the preview; Back returns to the widget.

What it edits: the lines (one to three), the widgets on each line (add from a catalog, remove, move), each widget's color and background (the 16 palette names, or any `ansi256:N`, `N`, `hex:RRGGBB` or `#RRGGBB` typed under **Other**), bold and raw value, powerline on/off, its theme, auto-align and continue-across-lines, the flex mode, the compact threshold and minimalist mode.

What it leaves alone: everything else in the file is carried as read, byte for byte as values: separators and caps, gradients, number formats, per-widget metadata (display modes, labels, hide flags), custom-command paths, the cache TTLs. Those stay in ccstatusline's own configurator. A widget id the catalog does not know is kept and marked `?`.

The catalog was read from ccstatusline **2.2.32**. **Add widget** checks the installed version first (through your configured command) and opens the catalog from that release on; older or unknown, it offers only the widgets already in your file, plus separators, so nothing is added that your ccstatusline would ignore.

### Save

Nothing touches the file until **Save**, which goes in this order, stopping at the first step that fails and saying why:

1. A local check: one to three lines, every widget with an id and a type, colors in the palette or ccstatusline's pass-through forms, a known powerline theme, the compact threshold in 1..99, unique ids.
2. The file compared with the editor's reading of it. Changed outside (the configurator, perhaps): refused; **Revert** reloads. The `updatemessage` field is ignored in that compare and the value on disk is the one written, since ccstatusline rewrites it by itself while a message counts down after an update.
3. A dry run: the candidate goes to a private file beside the config (`settings.json.cc-focusdeck.candidate-<token>`) and your own status line command renders it with `--config <that file>` and a sample status on stdin. Not saved when the exit code is not 0, when stderr says `using defaults`, or when the line drawn says `invalid config`. The lines it drew are shown as a preview. The candidate is removed afterwards. The dry run runs your widgets as a repaint would (git, usage fetches, custom commands), capped at 20 s; when it cannot finish or start, that is not a verdict on the config: **More › Save without preview** writes the draft after the local check alone.
4. A backup of the file as it is: `settings.json.cc-focusdeck.bak-<yyyymmdd>-<hhmmss>-<token>` beside it, private, mode kept.
5. The compare again, then the file replaced in one step: on macOS and Linux a copy of the file (mode kept) takes the new text and is moved into place, under a `mkdir` lock (`settings.json.cc-focusdeck.lock`, taken over after a minute if left behind) so two saves cannot interleave; on Windows a sibling file is written and moved over the target. The bytes the dry run saw are the bytes written.

ccstatusline reads the file at its next render, so the status line follows within its refresh interval. **Revert** drops the draft. **More › Reset to starter** makes the plugin's starter layout the draft; Save still writes it. **More › Restore a backup** lists the newest five backups: restoring one backs the current file up first, then writes the chosen one. The plugin never deletes a backup.

The commands the editor can run for a dry run and the version check: `ccstatusline`, `<path>/ccstatusline`, `npx [-y] ccstatusline[@tag]`, `bunx [-y] ccstatusline[@tag]`, each with an optional `--config <path>` (then that is the file edited). Anything else (`sh -c …`, pipelines, wrappers) gets no preview and no automatic Save: the page says so and offers Save without preview.

With no config file, or one that does not parse or is from an older ccstatusline, the editor opens reduced: a notice and **More** (restore a backup, reset to the starter). An older file migrates at ccstatusline's next render; open the editor again after.

## Troubleshooting

- *another save is in progress*: a second save ran while the first held the lock, or a lock folder was left behind by a crash; it is taken over after a minute.
- *The file changed outside the editor*: the configurator or ccstatusline wrote it meanwhile. Revert reloads it; your changes are lost.
- *No preview (…)*: the dry run could not start or finish (no `npx`, no network for `npx -y`, a slow widget). Save without preview is under More.
- The status line did not change after a save: ccstatusline redraws at its refresh interval (`refreshInterval` in the `statusLine` block) or at the next turn.
