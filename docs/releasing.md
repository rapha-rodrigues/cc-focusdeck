# Releasing

Every published change bumps the version. The three places that must agree: `version` in
`plugins/cc-focusdeck/.claude-plugin/plugin.json`, the `CHANGELOG.md` entry, the git tag.

## Checklist

1. **Version.** Bump `version` in `plugins/cc-focusdeck/.claude-plugin/plugin.json` (patch for fixes,
   minor for features, major for a change that breaks settings).
2. **Changelog.** Move the `Unreleased` entries under `## [x.y.z] - YYYY-MM-DD`.
3. **Gate.** From the repository root:
   ```
   claude plugin validate plugins/cc-focusdeck
   claude plugin validate .
   claude plugin test plugins/cc-focusdeck
   ```
   No failures; the only warnings allowed are the plugin directory's.
4. **Scan.** No home paths, employer names or private emails anywhere:
   ```
   git grep -n -i -E "/Users/|/home/[a-z]|@gmail|@hotmail" -- . ':!LICENSE'
   ```
   Every image under `docs/screenshots/` was staged with invented prompts.
5. **Candidate.** Install from the repository itself, before the tag, and run the live check below:
   ```
   claude plugin marketplace add rapha-rodrigues/cc-focusdeck
   claude plugin install cc-focusdeck@focusdeck
   ```
   The installed copy is keyed by `version`: `claude plugin update` fetches nothing while the version
   reads the same, whatever was pushed. So every candidate bumps it (`1.0.0-rc.1`, `-rc.2`, …) and
   the release sets the final number; a machine that held a candidate under the final number already
   (a `~/.claude/plugins/cache/focusdeck/cc-focusdeck/<version>` folder) needs that folder moved away
   first.
6. **Tag and release.** Commit `Release x.y.z`, tag `vx.y.z`, push with tags, and create the GitHub
   release with the changelog section as its notes.
7. **Installed copies** update with `claude plugin update cc-focusdeck@focusdeck`.

## Live check

With the candidate installed:

1. Press **Model** under the prompt: the pane opens on Model; pick an effort, then open Settings.
2. Turn Focus **On** and send a task of a few steps: the band shows the plan, each step moving from
   pending to running to done, and tool rows are hidden until ctrl+o.
3. Open Themes, apply one, then **Claude Code default**: the colors come back.
4. On the Status line page, open the Layout Editor and Preview: nothing is written until Save.
5. With another mod that draws the hint row or the band, both show.
