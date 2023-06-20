export const COLORS = {
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  MAGENTA: '\x1b[35m',
  CYAN: '\x1b[36m',
  WHITE: '\x1b[37m',
  GRAY: '\x1b[90m',
  RESET: '\x1b[0m',
} as const

type ColorKey = keyof typeof COLORS
type ColorValue = (typeof COLORS)[ColorKey]

export const uuid = () => {
  const dt = new Date().getTime()
  const _uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(
    /[xy]/g,
    (value) => {
      const rtx = (dt + Math.random() * 16) % 16 | 0
      return (value === 'x' ? rtx : (rtx & 0x3) | 0x8).toString(16)
    },
  )

  return _uuid
}

export const _customLog = (color: ColorValue, content: unknown) =>
  console.log(color, content, COLORS.RESET)

export const isFiveMEnv = () => typeof GetCurrentResourceName !== 'undefined'

export const getSrc = () => Number(globalThis.source)
