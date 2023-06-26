import z from 'zod'
import {
  ContractOptions,
  PossibleEnvsCommunication,
  PossibleEnvsCommunicationKeys,
  defaultContractOptions,
} from './consts'
import { EvoCommunicationError, EvoEnvError, EvoGlobalError } from './errors'
import { getSrc, isRcEnv, isRsEnv, isUiEnv, uuid } from './utils'
let contractsLength = 1

type ZodTypeAny = z.ZodType<any, any, any>

export type RetryOptions = {
  /**
   * The delay between each request. Default: 1000.
   */
  delay?: number
  /**
   * The maximum number of retry attempts, Max value `10`. Default: 0.
   */
  max: number
  /**
   * Whether to force the delay to be less than 500ms. Default: false.
   */
  forceDelay?: boolean
}

type ContractMethodValue = {
  /**
   * The Zod schema for method arguments. Default: undefined.
   */
  args?: ZodTypeAny
  /**
   * The Zod schema for the method return value. Default: undefined.
   */
  returns?: ZodTypeAny
  /**
   * Retry options for the method. Default: { delay: 1000, max: 0, forceDelay: false }.
   */
  retryOptions?: RetryOptions
}

export type ContractType = Record<string, ContractMethodValue>

export enum Environments {
  rs = 'rs',
  rc = 'rc',
  ui = 'ui',
}

export type Envs = keyof typeof Environments

type InferFromSchema<S extends ZodTypeAny | undefined> = S extends ZodTypeAny
  ? z.infer<S>
  : undefined

type RpcMethod<
  CE extends Envs,
  TE extends Envs,
  M extends ContractMethodValue,
  R extends M['returns'] = M['returns'],
  A extends M['args'] = M['args'],
  ReturnedArgs = R extends ZodTypeAny ? Promise<InferFromSchema<R>> : void,
> = CE extends 'rs'
  ? A extends ZodTypeAny
    ? TE extends 'rc'
      ? (args: InferFromSchema<A>, src: number) => ReturnedArgs
      : (args: InferFromSchema<A>, src: number) => ReturnedArgs
    : (src: number) => ReturnedArgs
  : A extends ZodTypeAny
  ? (args: InferFromSchema<A>) => ReturnedArgs
  : () => ReturnedArgs

export type InferRpcMethod<
  ES extends { currentEnv: Envs; targetEnv: Envs },
  M extends ContractMethodValue,
> = RpcMethod<ES['currentEnv'], ES['targetEnv'], M>

type ErrorType = { message: string; type: string }

export type RpcResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: ErrorType }

type ContractWithRpcMethods<
  C extends ContractType,
  CE extends Envs,
  TE extends Envs,
> = {
  [M in keyof C]: RpcMethod<CE, TE, C[M]>
}

type RpcCommunicationConfigurations<
  CE extends Envs,
  TE extends Envs,
> = CE extends 'rc'
  ? TE extends 'rs'
    ? {
        subscribe: (eventName: string, callback: Function) => void
        fire: (eventName: string, ...args: any[]) => void
      }
    : TE extends 'ui'
    ? { subscribe: (eventName: string, callback: Function) => void }
    : undefined
  : CE extends 'rs'
  ? TE extends 'rc'
    ? {
        subscribe: (eventName: string, callback: Function) => void
        fire: (eventName: string, ...args: any[]) => void
      }
    : undefined
  : CE extends 'ui'
  ? TE extends 'rc'
    ? { fire: (eventName: string, ...args: any[]) => Promise<RpcResponse> }
    : undefined
  : undefined

const fetchNui = async (eventName: string, req: unknown) => {
  const options = {
    method: 'post',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify(req),
  }

  const resourceName = window.GetParentResourceName
    ? window.GetParentResourceName()
    : 'evo'

  const resp = await fetch(`https://${resourceName}/${eventName}`, options)

  if (!resp.ok) {
    return {
      ok: false,
      error: { message: resp.statusText, type: 'EvoFetchError' },
    }
  }

  const responseObj = await resp.json()
  return responseObj
}

const getCurrentEnv = (): Envs | undefined =>
  isRcEnv() ? 'rc' : isRsEnv() ? 'rs' : isUiEnv() ? 'ui' : undefined

const getParsedArgs = async ({
  args,
  schema,
}: {
  args: unknown
  schema: z.Schema
}) => schema.parse(args)

const registerNuiCallback = (
  eventName: string,
  callback: (data: unknown, cb: (res: unknown) => unknown) => unknown,
): void => {
  RegisterNuiCallbackType(eventName)
  on(`__cfx_nui:${eventName}`, callback)
}

/**
 * Create a new contract
 * @template C - The type of the contract.
 */
export class Contract<C extends ContractType> {
  private _options: ContractOptions
  private _contract: C
  private _builded = false
  private _contractUuid = contractsLength++
  constructor(contract: C, options?: ContractOptions) {
    this._contract = contract
    this._options = options ?? defaultContractOptions
  }

  public build() {
    const mergedOptions = { ...defaultContractOptions, ...this._options }

    this._options = mergedOptions
    this._builded = true
    return this
  }

  public isBuilded() {
    return this._builded
  }

  private getRpcMethodsForEnvs<CE extends Envs, TE extends Envs>(
    currentEnv: CE,
    targetEnv: TE,
  ): RpcCommunicationConfigurations<CE, TE> {
    switch (currentEnv) {
      case 'rc':
        switch (targetEnv) {
          case 'rs':
            return {
              subscribe: onNet,
              fire: emitNet,
            } as RpcCommunicationConfigurations<CE, TE>
          case 'ui':
            return {
              subscribe: registerNuiCallback,
            } as RpcCommunicationConfigurations<CE, TE>
        }
        break
      case 'rs':
        switch (targetEnv) {
          case 'rc':
            return {
              subscribe: onNet,
              fire: emitNet,
            } as RpcCommunicationConfigurations<CE, TE>
        }
        break
      case 'ui':
        switch (targetEnv) {
          case 'rc':
            return {
              fire: fetchNui,
            } as RpcCommunicationConfigurations<CE, TE>
        }
        break
    }
    return undefined as RpcCommunicationConfigurations<CE, TE>
  }

  /**
   * Creates the listener for communication between environments.
   * @param currentEnv - The current environment.
   * @param targetEnv - The target environment.
   * @param listeners - The contract with RPC methods.
   * @returns  The contract and environments.
   */
  public createListener<CE extends Envs, TE extends Envs>(
    currentEnv: CE,
    targetEnv: TE,
    listeners: ContractWithRpcMethods<C, CE, TE>,
  ) {
    if (!this.isBuilded()) {
      throw new EvoGlobalError(
        'You need to build the contract using [.build()] at the end.',
      )
    }

    const canCommunicate = this.canEnvsCommunicate({
      current: currentEnv,
      target: targetEnv,
      type: 'listener',
    })

    if (!canCommunicate) {
      throw new EvoCommunicationError('Invalid communication environments')
    }

    const realEnv = getCurrentEnv()

    if (realEnv !== currentEnv) {
      throw new EvoEnvError(
        'The specified environment does not match your real environment.',
      )
    }

    for (const [rpcName, rpcMethod] of Object.entries(listeners)) {
      const { args: argsSchema, returns: returnsSchema } =
        this._contract[rpcName]

      // example rs - rc
      const rpcEventName = `${currentEnv}::${rpcName}::${targetEnv}::${this._contractUuid}`

      const callback = async (
        args: InferFromSchema<typeof argsSchema>,
        responseEvent: string,
      ): Promise<InferFromSchema<typeof returnsSchema>> => {
        const src = getSrc()
        try {
          const parsedArgs = argsSchema
            ? await getParsedArgs({ args: args, schema: argsSchema })
            : undefined

          const res = await (currentEnv === 'rs'
            ? parsedArgs !== undefined
              ? rpcMethod(parsedArgs, src)
              : rpcMethod(src)
            : rpcMethod(parsedArgs))

          if (currentEnv === 'rs' && targetEnv === 'rc') {
            const { fire } = this.getRpcMethodsForEnvs('rs', 'rc')

            fire(responseEvent, src, { ok: true, data: res })
          }

          if (currentEnv === 'rc' && targetEnv === 'rs') {
            const { fire } = this.getRpcMethodsForEnvs('rc', 'rs')

            fire(responseEvent, { ok: true, data: res })
          }
        } catch (error) {
          const errorPayload = {
            ok: false,
            error: {
              message: (error as ErrorType).message,
              type: (error as ErrorConstructor).constructor.name,
            },
          }

          if (currentEnv === 'rs' && targetEnv === 'rc') {
            const { fire } = this.getRpcMethodsForEnvs('rs', 'rc')

            fire(responseEvent, src, errorPayload)
          }

          if (currentEnv === 'rc' && targetEnv === 'rs') {
            const { fire } = this.getRpcMethodsForEnvs('rc', 'rs')

            fire(responseEvent, errorPayload)
          }
        }
      }

      const nuiCallback = async (
        args: InferFromSchema<typeof argsSchema>,
        cb: Function,
      ) => {
        try {
          const res = await rpcMethod(args)

          cb({ ok: true, data: res })
        } catch (error) {
          cb({
            ok: false,
            error: {
              message: (error as ErrorType).message,
              type: (error as ErrorConstructor).constructor.name,
            },
          })
        }
      }

      if (currentEnv === 'rc' && targetEnv === 'ui') {
        const { subscribe } = this.getRpcMethodsForEnvs('rc', 'ui')
        subscribe(rpcEventName, nuiCallback)
      }

      if (currentEnv === 'rs' && targetEnv === 'rc') {
        const { subscribe } = this.getRpcMethodsForEnvs('rs', 'rc')

        subscribe(rpcEventName, callback)
      }

      if (currentEnv === 'rc' && targetEnv === 'rs') {
        const { subscribe } = this.getRpcMethodsForEnvs('rc', 'rs')
        subscribe(rpcEventName, callback)
      }
    }

    return { contract: this['_contract'], envs: { currentEnv, targetEnv } }
  }

  private canEnvsCommunicate({
    current,
    target,
    type,
  }: {
    current: Envs
    target: Envs
    type: PossibleEnvsCommunicationKeys
  }): boolean {
    const targetMethod = PossibleEnvsCommunication[type]
    return targetMethod.some(
      ({ current: _current, target: _target }) =>
        _current === current && _target === target,
    )
  }

  /**
   * Creates the API for communication between environments.
   * @param currentEnv - The current environment.
   * @param targetEnv - The target environment.
   * @returns The contract with RPC methods.
   */
  public createApi<CE extends Envs, TE extends Envs>(
    currentEnv: CE,
    targetEnv: TE,
  ) {
    const methods = {} as ContractWithRpcMethods<C, CE, TE>

    if (!this.isBuilded()) {
      throw new EvoGlobalError(
        'You need to build the contract using [.build()] at the end.',
      )
    }
    const realEnv = getCurrentEnv()

    if (realEnv !== currentEnv) {
      throw new EvoEnvError(
        'The specified environment does not match your real environment.',
      )
    }

    const canCommunicate = this.canEnvsCommunicate({
      current: currentEnv,
      target: targetEnv,
      type: 'api',
    })

    if (!canCommunicate) {
      throw new EvoCommunicationError('Invalid communication environments')
    }

    for (const [rpcName, rpcMethod] of Object.entries(this._contract)) {
      const {
        args: argsSchema,
        returns: returnsSchema,
        retryOptions = { max: 0, delay: 1000, forceDelay: false },
      } = rpcMethod
      const rpcEventName = `${targetEnv}::${rpcName}::${currentEnv}::${this._contractUuid}`

      if (retryOptions.delay! < 500 && !retryOptions.forceDelay) {
        console.warn(
          `The delay has been set back to 500ms. If you want to use [${retryOptions.delay}], please set 'forceDelay' to 'true'.`,
        )
        retryOptions.delay = 500
      }

      if (retryOptions.max > 10) {
        console.warn(
          `The maximum retry limit has been set back to '10'. [${rpcName}]`,
        )
        retryOptions.max = 10
      }
      // @ts-expect-error
      methods[rpcName as keyof C] = (
        ...args: InferFromSchema<typeof argsSchema>
      ): InferFromSchema<typeof returnsSchema> => {
        return new Promise(async (resolve, reject) => {
          const responseEvent = `${rpcName}::${uuid()}`
          const realArgs = args[0]
          const src = args?.[1]
          let retrysCount = 0
          let didTimedOut = false
          const _timeout = setTimeout(() => {
            didTimedOut = true
            removeEventListener(responseEvent, responseEventHandler)
            reject({
              message: `${rpcName} has timed out !`,
              type: 'EvoTimeoutError',
            })
          }, this._options.timeout)

          const parsedArgs = argsSchema
            ? await getParsedArgs({
                args: realArgs,
                schema: argsSchema,
              })
            : undefined

          const responseEventHandler = (
            res: RpcResponse<InferFromSchema<typeof returnsSchema>>,
          ) => {
            if (didTimedOut) return

            if (res.ok) {
              clearTimeout(_timeout)
              resolve(res.data)
              removeEventListener(responseEvent, responseEventHandler)
              return
            }

            if (retryOptions.max > 0 && retrysCount < retryOptions.max) {
              retrysCount++
              if (currentEnv === 'rs' && targetEnv === 'rc') {
                return emitNet(rpcEventName, src, parsedArgs, responseEvent)
              }

              return emitNet(rpcEventName, parsedArgs, responseEvent)
            }

            return reject(res.error)
          }

          if (currentEnv === 'rs' && targetEnv === 'rc') {
            const { subscribe, fire } = this.getRpcMethodsForEnvs('rs', 'rc')

            subscribe(responseEvent, responseEventHandler)
            fire(rpcEventName, src, parsedArgs, responseEvent)
          }

          if (currentEnv === 'rc' && targetEnv === 'rs') {
            const { subscribe, fire } = this.getRpcMethodsForEnvs('rc', 'rs')

            subscribe(responseEvent, responseEventHandler)
            fire(rpcEventName, parsedArgs, responseEvent)
          }

          if (currentEnv === 'ui' && targetEnv === 'rc') {
            const { fire } = this.getRpcMethodsForEnvs('ui', 'rc')
            const res = await fire(rpcEventName, parsedArgs)
            if (didTimedOut) return

            if (res.ok) {
              clearTimeout(_timeout)
              return resolve(res)
            }

            if (retryOptions.max <= 0) {
              return reject(res.error)
            }

            while (retrysCount < retryOptions.max) {
              retrysCount++
              const retryRes = await fire(rpcEventName, parsedArgs)

              if (retryRes.ok) {
                return resolve(retryRes.data)
              }

              if (!retryRes.ok && retrysCount === retryOptions.max) {
                return reject(retryRes.error)
              }
            }
          }
        })
      }
    }

    return methods
  }
}
