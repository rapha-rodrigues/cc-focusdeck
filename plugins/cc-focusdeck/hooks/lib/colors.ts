// Color arithmetic on `#rrggbb` strings: what the themes and the Focus band
// need to mix, lighten and compare colors. Pure.

export type Rgb = readonly [number, number, number]

const clamp255 = (v: number) => Math.round(Math.max(0, Math.min(255, v)))

// `#abc` or `#aabbcc` (the hash optional) to its channels.
export const toRgb = (color: string): Rgb => {
  const digits = color.startsWith('#') ? color.slice(1) : color
  const six = digits.length === 3 ? digits.replace(/(.)/g, '$1$1') : digits.slice(0, 6)
  const value = Number.parseInt(six, 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
}

export const toHex = (rgb: Rgb): string => `#${rgb.map(v => clamp255(v).toString(16).padStart(2, '0')).join('')}`

// The color `share` of the way from `from` to `to` (0 is `from`, 1 is `to`).
export const blend = (from: string, to: string, share: number): string => {
  const a = toRgb(from)
  const b = toRgb(to)
  return toHex([a[0] + (b[0] - a[0]) * share, a[1] + (b[1] - a[1]) * share, a[2] + (b[2] - a[2]) * share])
}

// Perceived lightness, 0 (black) to 255 (white), by the Rec. 709 weights.
export const lightness = (color: string): number => {
  const [r, g, b] = toRgb(color)
  return r * 0.2126 + g * 0.7152 + b * 0.0722
}

export const isLightColor = (color: string): boolean => lightness(color) > 140

// Whether two colors can be told apart on screen: a lightness gap of 30 or more.
export const legible = (a: string, b: string): boolean => Math.abs(lightness(a) - lightness(b)) >= 30
