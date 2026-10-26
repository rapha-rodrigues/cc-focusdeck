import { describe, expect, test } from 'claude-code/testing'

import { blend, isLightColor, legible, lightness, toHex, toRgb } from '../hooks/lib/colors'
import {
  claudeThemeOf,
  parseLooseJson,
  profileByGuid,
  profileToTheme,
  readWarpTheme,
  readYamlMap,
  setProfileTheme,
  terminalOscFor,
  windowsTerminalSchemeOf,
  WT_SCHEME,
  type WtSettings,
} from '../hooks/lib/terminal-themes'
import { familyPages, keptFileName, slugOf, variantPages, warpFileOn } from '../hooks/lib/theme-site'

// A palette of this test's own, in Warp's YAML shape.
const HARBOR = [
  'name: Night Harbor',
  'accent: "#5ec4d6"',
  'cursor: "#f2e9d8"',
  'background: "#101820"',
  'foreground: "#e6e1d6"',
  'details: darker',
  'terminal_colors:',
  '  normal:',
  '    black: "#1b2530"',
  '    red: "#d9534f"',
  '    green: "#7fb069"',
  '    yellow: "#e3b341"',
  '    blue: "#4f8fc9"',
  '    magenta: "#b388eb"',
  '    cyan: "#5ec4d6"',
  '    white: "#e6e1d6"',
  '  bright:',
  '    black: "#55657a"',
  '    red: "#ff7b72"',
  '    green: "#a6e3a1"',
  '    yellow: "#f9e2af"',
  '    blue: "#89b4fa"',
  '    magenta: "#cba6f7"',
  '    cyan: "#94e2d5"',
  '    white: "#ffffff"',
  '',
].join('\n')

const harbor = () => readWarpTheme(HARBOR)!

describe('colors', () => {
  test('hex in, channels out, and back', () => {
    expect(toRgb('#101820')).toEqual([16, 24, 32])
    expect(toRgb('abc')).toEqual([170, 187, 204])
    expect(toHex([16, 24, 32])).toBe('#101820')
    expect(toHex([300, -5, 12.6])).toBe('#ff000d')
  })

  test('blends, lightness and legibility', () => {
    expect(blend('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(blend('#101820', '#e6e1d6', 0)).toBe('#101820')
    expect(blend('#101820', '#e6e1d6', 1)).toBe('#e6e1d6')
    expect(Math.round(lightness('#ffffff'))).toBe(255)
    expect(lightness('#000000')).toBe(0)
    expect(isLightColor('#fdf6e3')).toBe(true)
    expect(isLightColor('#101820')).toBe(false)
    expect(legible('#101820', '#55657a')).toBe(true)
    expect(legible('#101820', '#141c24')).toBe(false)
  })
})

describe('terminal themes', () => {
  test('reads the YAML map with its nesting and quotes', () => {
    const map = readYamlMap('a: 1\n# note\nb:\n  c: "two"\n  d: \'three\'\ne: 4\n')
    expect([...map.entries()]).toEqual([
      ['a', '1'],
      ['b.c', 'two'],
      ['b.d', 'three'],
      ['e', '4'],
    ])
  })

  test('a theme file becomes a palette, or null when a color is missing', () => {
    const p = harbor()
    expect(p.name).toBe('Night Harbor')
    expect(p.background).toBe('#101820')
    expect(p.accent).toBe('#5ec4d6')
    expect(p.normal[4]).toBe('#4f8fc9')
    expect(p.bright[7]).toBe('#ffffff')
    expect(readWarpTheme('name: nothing here\n')).toBe(null)
    expect(readWarpTheme(HARBOR.replace('    blue: "#4f8fc9"\n', ''))).toBe(null)
    // A color is #rrggbb or the theme is refused: nothing a page serves can
    // smuggle a control sequence into the terminal through an OSC color.
    expect(readWarpTheme(HARBOR.replace('background: "#101820"', 'background: "#101820\u0007\u001b]52;c;aGk=\u0007"'))).toBe(null)
    expect(readWarpTheme(HARBOR.replace('background: "#101820"', 'background: "red"'))).toBe(null)
    expect(readWarpTheme(HARBOR.replace('    red: "#d9534f"', '    red: "d9534f"'))).toBe(null)
    expect(readWarpTheme(HARBOR.replace('cursor: "#f2e9d8"', 'cursor: "#f2e9d8;1"'))).toBe(null)
    expect(readWarpTheme(HARBOR.replace('background: "#101820"', 'background: "#10AB20"'))!.background).toBe('#10ab20')
    expect(readWarpTheme(HARBOR.replace('name: Night Harbor', 'name: Night\u001b[31m Harbor'))!.name).toBe('Night[31m Harbor')
    // Without an accent, the magenta stands in; without a cursor, the foreground.
    const bare = readWarpTheme(HARBOR.replace('accent: "#5ec4d6"\n', '').replace('cursor: "#f2e9d8"\n', ''))!
    expect(bare.accent).toBe('#b388eb')
    expect(bare.cursor).toBe('#e6e1d6')
  })

  test('the Claude Code theme carries every token, from the palette by role', () => {
    const theme = claudeThemeOf(harbor())
    expect(theme.name).toBe('Night Harbor')
    expect(theme).toMatchObject({ base: 'dark' })
    expect(theme.overrides).toMatchObject({ claude: '#5ec4d6', text: '#e6e1d6', inverseText: '#101820', error: '#d9534f', success: '#7fb069', warning: '#e3b341', skill: '#cba6f7', inactive: '#55657a' })
    expect(Object.keys(theme.overrides)).toHaveLength(72)
    for (const value of Object.values(theme.overrides)) expect(value).toMatch(/^#[0-9a-f]{6}$/)
    // A light background makes a light base.
    expect(claudeThemeOf(readWarpTheme(HARBOR.replace('background: "#101820"', 'background: "#fdf6e3"'))!).base).toBe('light')
  })

  test('dim text stays legible when the bright black is the background', () => {
    const flat = HARBOR.replace('background: "#101820"', 'background: "#0c1014"').replace('black: "#55657a"', 'black: "#0c1014"')
    const theme = claudeThemeOf(readWarpTheme(flat)!)
    expect(theme.overrides.inactive).not.toBe('#0c1014')
    expect(legible(theme.overrides.inactive!, '#0c1014')).toBe(true)
  })

  test('the Windows Terminal scheme names its colors its own way', () => {
    const scheme = windowsTerminalSchemeOf(harbor())
    expect(scheme).toMatchObject({ name: 'Night Harbor', purple: '#b388eb', brightPurple: '#cba6f7', cursorColor: '#f2e9d8', selectionBackground: '#55657a', brightWhite: '#ffffff' })
  })

  test('Windows Terminal settings parse with comments and trailing commas, and the profile is found or made', () => {
    const text = `{
      // a comment
      "profiles": { "defaults": {}, "list": [ { "guid": "{AbC}", "name": "pwsh", }, ] },
      /* block */ "schemes": [],
      "url": "https://example.com//kept"
    }`
    const settings = parseLooseJson(text) as WtSettings & { url: string }
    expect(settings.url).toBe('https://example.com//kept')
    expect(profileByGuid(settings, '{abc}')?.guid).toBe('{AbC}')
    profileToTheme(settings, '{ABC}').colorScheme = 'One'
    expect(JSON.stringify(settings)).toContain('"colorScheme":"One"')
    profileToTheme(settings, null).colorScheme = 'Two'
    expect((settings.profiles as { defaults: { colorScheme: string } }).defaults.colorScheme).toBe('Two')
    // A list with no defaults object gains one.
    const flat: WtSettings = { profiles: [{ guid: '{X}' }] }
    profileToTheme(flat, null).colorScheme = 'Three'
    expect(flat.profiles).toEqual({ defaults: { colorScheme: 'Three' }, list: [{ guid: '{X}' }] })
  })

  test('a profile takes the theme and gives its own scheme back; the plugin scheme stays only while used', () => {
    const mine = { guid: '{ABC}', name: 'pwsh', colorScheme: 'Campbell' }
    const other = { guid: '{DEF}', name: 'wsl' }
    const settings: WtSettings = { profiles: { defaults: { colorScheme: 'Stock' }, list: [mine, other] }, schemes: [{ name: 'Kept scheme' }] }
    const palette = harbor()
    setProfileTheme(settings, mine, palette, 'Campbell')
    expect(mine).toMatchObject({ colorScheme: WT_SCHEME })
    expect(settings.schemes).toEqual([{ name: 'Kept scheme' }, { ...windowsTerminalSchemeOf(palette), name: WT_SCHEME }])
    expect(other).toEqual({ guid: '{DEF}', name: 'wsl' })
    setProfileTheme(settings, mine, null, 'Campbell')
    expect(mine.colorScheme).toBe('Campbell')
    expect(settings.schemes).toEqual([{ name: 'Kept scheme' }])
    setProfileTheme(settings, other, palette)
    setProfileTheme(settings, other, null)
    expect(other).toEqual({ guid: '{DEF}', name: 'wsl' })
  })

  test('OSC sequences set the sixteen colors, the foreground, background and cursor, or reset them', () => {
    const seq = terminalOscFor(harbor())
    expect(seq).toContain('\u001b]4;0;#1b2530\u0007')
    expect(seq.includes('\u001b]4;15;#ffffff\u0007')).toBe(true)
    expect(seq.endsWith('\u001b]10;#e6e1d6\u0007\u001b]11;#101820\u0007\u001b]12;#f2e9d8\u0007')).toBe(true)
    expect(terminalOscFor(null)).toBe('\u001b]104\u0007\u001b]110\u0007\u001b]111\u0007\u001b]112\u0007')
  })

  test('the site reader finds theme pages and the Warp file, and names the kept file', () => {
    const html = '<a href="/themes/nord/">Nord</a><a href="/themes/nord/default/">d</a><a href="/themes/nord/aurora/">a</a><a href="/themes/nord/default/">again</a>'
    expect(variantPages(html)).toEqual(['/themes/nord/default/', '/themes/nord/aurora/'])
    expect(familyPages(html)).toEqual(['/themes/nord/'])
    expect(warpFileOn('<a href="/downloads/warp/nord-default.yml">')).toBe('/downloads/warp/nord-default.yml')
    expect(warpFileOn('<p>no file</p>')).toBe(null)
    expect(keptFileName('/downloads/warp/nord-default.yml')).toBe('nord-default.yaml')
    expect(slugOf('nord-default.yaml')).toBe('nord-default')
  })
})
