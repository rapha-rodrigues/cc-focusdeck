// The Settings page: Focus on and off with the chip to its color, the Theme
// block with the chosen theme's chip, the status line's chip, then the icon
// sets. What opens a page comes back with the Back chip.

import type { EngineInterface, RenderChildren, RenderInput } from 'claude-code'

import type { Panel } from '../../types'
import type { Frame } from '../ui/frame'
import { drawFocusSettings } from './focus'
import { readStatusLineIsCcsl } from './statusline'
import { readThemeName } from './themes'
import { ICON_SETS, readIconSet, setIconSet } from '../icons'

export async function drawSettingsPage($: EngineInterface, e: RenderInput<'Pane'>, ui: Frame, go: (panel: Panel) => unknown): Promise<RenderChildren[]> {
  if (e.surface !== 'terminal' && e.surface !== 'desktop') return []
  const { t, heading, chip, chips } = ui
  const iconSet = await readIconSet($)
  const theme = (await readThemeName($)) ?? t('terminalDefault')
  const isCcsl = await readStatusLineIsCcsl($)

  return [
    ...(await drawFocusSettings($, e, ui, go)),
    // The theme chosen, as the chip that opens the page; plain while it is the terminal's own.
    heading(t('themeRow')),
    chips('settings-theme-chips', [chip('settings-theme', theme, (await readThemeName($)) !== null, () => go('themes'))]),
    // Lit while ccstatusline draws the status line.
    heading(t('statusLineRow')),
    chips('settings-statusline-chips', [chip('settings-statusline', 'ccstatusline', isCcsl, () => go('statusline'))]),
    heading(t('iconsTitle')),
    chips(
      'settings-icons',
      ICON_SETS.map(set => chip(`settings-icons-${set}`, t(set === 'auto' ? 'iconsAuto' : set === 'nerd' ? 'iconsNerd' : 'iconsUnicode'), set === iconSet, () => setIconSet($, set))),
    ),
  ]
}
