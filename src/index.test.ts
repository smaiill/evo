import { COLORS, _customLog } from './utils'
import { EventEmitter } from 'stream'
const USER_SOURCE = 99999
import { describe, expect, test } from 'vitest'

export class _Ev extends EventEmitter {
  activeEvents: Set<string>
  constructor() {
    super()
    this.activeEvents = new Set()
  }

  public _on(eventName: string | symbol, listener: (...args: any[]) => void) {
    this.activeEvents.add(eventName as string)
    return super.on(eventName, listener)
  }

  public _removeAllListners(events: string | string[]) {
    for (const event of events) {
      super.removeAllListeners(event)
      if (this.listenerCount(event) === 0) {
        this.activeEvents.delete(event)
      }
    }
  }

  getActiveEvents() {
    return Array.from(this.activeEvents)
  }
}

const ev = new _Ev()

const onNet = (eventName: string, _fn: Function) => {
  _customLog(
    COLORS.CYAN,
    `Creating event listener for ${COLORS.MAGENTA}[${eventName}]`,
  )
  return ev._on(eventName, (...args: any[]) => {
    if (args.length > 0 && args[0] === USER_SOURCE) {
      _fn(args[1])
    } else {
      _fn(...args)
    }
    _customLog(
      COLORS.YELLOW,
      `Event ${COLORS.MAGENTA}[${eventName}]${COLORS.YELLOW} has been called !`,
    )
  })
}

const emitNet = (eventName: string, ...args: any[]) => {
  _customLog(
    COLORS.GREEN,
    `Calling event: ${COLORS.MAGENTA}[${eventName}]${COLORS.GREEN} with args: ${
      COLORS.MAGENTA
    }${JSON.stringify(args)}`,
  )

  ev.emit(eventName, ...args)
}

const removeEventListener = (eventName: string, callback: Function) => {
  _customLog(
    COLORS.CYAN,
    `Removing event listener for ${eventName}, ${callback}`,
  )
}

// @ts-ignore
globalThis.removeEventListener = removeEventListener
globalThis.onNet = onNet
globalThis.emitNet = emitNet
globalThis.source = USER_SOURCE

// Rewrite all tests...
describe('flemme', () => {
  test('1 + 1 = 2', () => {
    expect(1 + 1).toBe(2)
  })
})
