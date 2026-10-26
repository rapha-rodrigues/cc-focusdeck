# Changelog

Notable changes to cc-focusdeck. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0] - 2026-10-26

cc-focusdeck is the part of [cc-esol](https://github.com/rapha-rodrigues/cc-esol) 1.0.2 that was not
the English coach, now a plugin of its own, so the coach and this deck install apart.

### Added

- **Focus.** A band above the prompt with the task's progress. Claude posts its plan to the band's
  own `focus_progress` tool, then only the number of each step as it starts, and a turn that ends on
  the last step finishes the task; todos, tasks and an approved plan feed it too where the session
  has them. A feed of the last tool calls sits under the running step, a row opening on what its call
  ran and the first lines it printed. Tool calls and results are hidden while Focus is on, except a
  failed or interrupted call; ctrl+o shows every call. Six band colors plus a custom one.
- **Model page.** The model, the effort (low to max) and the permission mode new sessions start in.
- **Themes.** Terminal color themes from terminalcolors.com, downloaded on request and applied to the
  terminal (OSC, or a Windows Terminal profile) and to Claude Code's own colors.
- **Status line page and Layout Editor.** Install, check and remove ccstatusline; edit its layout
  line by line with a live preview, a dry run before every save and timestamped backups. A write to
  `settings.json` or the ccstatusline config is refused when the file changed since it was read,
  checked last thing before the move, under a lock.
- **Settings.** The Focus switch and its color, the theme, the status line, the icon set.
- **`/focusdeck`** and a **Model** button under the prompt that open the pane.

### Changed, compared with cc-esol 1.0.2

- The row under the prompt and the band keep what other mods draw there: the deck adds its button
  beside the row and its band above theirs, instead of drawing over them.
- The pane closes when another pane opens (cc-esol's, any mod's), so the sidebar shows one pane,
  never a row of tabs; with no theme picked it sits on the background of Claude Code's theme.
- Its own names everywhere: the pane, the `/focusdeck` command, the `mcp__cc-focusdeck__focus_progress`
  tool, the store, and the files it writes (`settings.json.cc-focusdeck.bak`,
  `~/.claude/themes/cc-focusdeck.json`, `~/.claude/cc-focusdeck/themes/`, the Windows Terminal scheme
  `cc-focusdeck`). Settings kept by cc-esol 1.x do not carry over.

[Unreleased]: https://github.com/rapha-rodrigues/cc-focusdeck/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/rapha-rodrigues/cc-focusdeck/releases/tag/v1.0.0
