import { COLORS, _customLog } from './utils'
import { createClientAPI, createContract, createServer } from '.'
import { EventEmitter } from 'stream'
import {
  test,
  expect,
  vi,
  describe,
  beforeAll,
  afterEach,
  beforeEach,
  afterAll,
} from 'vitest'
import { ZodError, ZodNumber, z } from 'zod'
import { EvoTimeoutError } from './errors'

const USER_SOURCE = 99999

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

const contractOptions = {
  getUserDetails: {
    args: z.object({
      id: z.number(),
    }),
    returns: z.number(),
  },

  getNone: {},
}

const { contract: c, options } = createContract(contractOptions, {
  timeout: 5000,
})

describe('createContract', () => {
  test('should create a contract and return it', () => {
    expect(c).toStrictEqual(contractOptions)
  })

  test('should return the correct types', () => {
    expect(c.getUserDetails.args._def.typeName).toStrictEqual('ZodObject')
    expect(c.getUserDetails.returns._def.typeName).toStrictEqual('ZodNumber')
  })
})

describe('createServer', () => {
  afterAll(() => {
    ev._removeAllListners(['getUserDetails'])
  })
  test('It sould create an event listener for getUserDetails', () => {
    createServer(
      {
        getUserDetails: {
          args: z.object({
            id: z.number(),
          }),
          returns: z.number(),
        },
        getNone: {},
      },
      {
        getUserDetails: async ({ id }) => {
          return 10
        },

        getNone: async () => {
          console.log('Called none !')
        },
      },
    )

    expect(ev.getActiveEvents()).toContain('getUserDetails')
  })
})

function delay(ms: number): Promise<string> {
  return new Promise<string>((resolve) => {
    setTimeout(() => {
      resolve(`After ${ms}`)
    }, ms)
  })
}

describe('createClientAPI', async () => {
  beforeAll(() => {
    createServer(
      {
        getUserDetails: {
          args: z.object({
            id: z.number(),
          }),
          returns: z.number(),
        },
        getNone: {},

        timeoutFunction: {
          returns: z.string(),
        },
      },
      {
        getUserDetails: async ({ id }) => {
          return 10
        },

        getNone: async () => {
          console.log('Called none !')
        },

        // @ts-ignore
        timeoutFunction: async () => {
          setTimeout(() => {
            return 'Hello world !'
          }, 7000)
        },
      },
    )
  })

  afterAll(() => {
    ev._removeAllListners(['getUserDetails'])
  })
  test('It should create a client API and return the functions.', async () => {
    const api = createClientAPI({ contract: c, options })

    expect(api.getUserDetails).toBeTypeOf('function')
    // @ts-ignore
    expect(api.invalidFunction).toBeUndefined()
  })
  test('It should call methods and success', async () => {
    const api = createClientAPI({ contract: c, options })

    await expect(api.getUserDetails({ id: 1 })).resolves.toEqual(10)
  })

  test('It should call methods and throw', async () => {
    const api = createClientAPI({ contract: c, options })
    try {
      //@ts-ignore
      await api.getUserDetails({ id: '10' })
    } catch (error) {
      expect(
        (error as { errors: [{ code: string }] }).errors[0].code,
      ).toStrictEqual('invalid_type')
    }
  })
})

describe('RPC method invocation timeout', () => {
  const { contract, options } = createContract(
    {
      getUserName: {
        args: z.string(),
        returns: z.string(),
      },
    },
    { timeout: 3000 },
  )

  createServer(contract, {
    getUserName: async (args: string) => {
      // Simulate a long-running process that exceeds the timeout
      await new Promise((resolve) => setTimeout(resolve, 5000))
      return `User: ${args}`
    },
  })

  const client = createClientAPI({ contract, options })

  test('should throw EvoTimeoutError when the method invocation exceeds the timeout', async () => {
    expect.assertions(1)

    try {
      await client.getUserName('John')
    } catch (error) {
      expect(error).toBeInstanceOf(EvoTimeoutError)
    }
  })
})
