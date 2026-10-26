// terminalcolors.com as the plugin reads it: the links on its pages, and the
// file name a theme is kept under. Pure; the fetching is in ../pages/themes.tsx.

import { captures } from './terminal-themes'

export const THEME_SITE = 'https://terminalcolors.com'

const VARIANT_LINK = /href="(\/themes\/[\w-]+\/[\w-]+\/)"/g
const FAMILY_LINK = /href="(\/themes\/[\w-]+\/)"/g
const WARP_FILE_LINK = /href="(\/downloads\/warp\/[^"]+\.ya?ml)"/g

// `/themes/<family>/<variant>/` links on a page, without repeats.
export const variantPages = (html: string): string[] => [...new Set(captures(html, VARIANT_LINK))]

// `/themes/<family>/` links on a page, without repeats.
export const familyPages = (html: string): string[] => [...new Set(captures(html, FAMILY_LINK))]

// The Warp theme file a variant page offers, if any.
export const warpFileOn = (html: string): string | null => captures(html, WARP_FILE_LINK)[0] ?? null

// The name a downloaded theme is kept under: its file name, always `.yaml`.
export const keptFileName = (sitePath: string): string => (sitePath.split('/').pop() ?? 'theme.yaml').replace(/\.yml$/, '.yaml')

export const slugOf = (fileName: string): string => fileName.replace(/\.yaml$/, '')
