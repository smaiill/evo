import z from 'zod'
import { COLORS, _customLog, getSrc, uuid } from './utils'
import { ContractOptions, Errors, defaultContractOptions } from './consts'
import { EvoOnceError, EvoTimeoutError } from './errors'

type ZodTypeAny = z.ZodType<any, any, any>

export type RetryOptions = {
  /**
   * The delay between each request. Default: 1000.
   */
  delay: number
  /**
   * The maximum number of retry attempts. Default: 0.
   */
  max: number
}

export type ContractMethodValue = {
  /**
   * The Zod schema for method arguments. Default: {}
   */
  args?: ZodTypeAny
  /**
   * The Zod schema for the method return value. Default: {}
   */
  returns?: ZodTypeAny
  /**
   * Retry options for the method. Default: { delay: 1000, max: 0 }
   */
  retryOptions?: RetryOptions
  /**
   * Indicates if the method should be executed only once. Default false
   */
  once?: boolean
}

export type Contract = Record<string, ContractMethodValue>

type InferFromSchema<S extends ZodTypeAny | undefined> = S extends ZodTypeAny
  ? z.infer<S>
  : undefined

export type RpcMethod<
  M extends ContractMethodValue,
  Args extends M['args'] = M['args'],
  Returns extends M['returns'] = M['returns'],
  ReturnedArgs = Args extends undefined
    ? Promise<void>
    : Promise<InferFromSchema<Returns>>,
> = Args extends ZodTypeAny
  ? (args: InferFromSchema<Args>, src: number) => ReturnedArgs
  : (src: number) => ReturnedArgs

type ContractWithRpcMethods<C extends Contract> = {
  [M in keyof C]: RpcMethod<C[M]>
}

type RemoveSrc<T extends (...args: any[]) => any> = T extends (
  args: infer U,
  src: infer S,
) => any
  ? S extends number
    ? (args: U) => ReturnType<T>
    : U extends number
    ? () => ReturnType<T>
    : never
  : never

type ContractWithRpcMethodsClient<C extends Contract> = {
  [M in keyof C]: RemoveSrc<RpcMethod<C[M]>>
}

export type ErrorType = {
  message: string
  type: string
}

type ResponseEvent = `${string}::${string}`

type RpcClientResponse<T = unknown> = {
  ok: boolean
  data?: T
  eventName: ResponseEvent
  error?: ErrorType
  src?: number
}

type ServerResponse<T = unknown> =
  | { ok: false; error: string }
  | { ok: true; data: T }

type ServerLogger = {
  /**
   * If the logger should be active or not. Default: `false`
   */
  active: boolean
  /**
   * The logging format. Default: Request from [`src`] : `args`
   */
  logFormat?: (src: number, args: unknown) => void
}

type ServerOptions = {
  /**
   * The logger options. See `ServerLogger`
   */
  logger: ServerLogger
}

export type MergedContract<C1 extends Contract, C2 extends Contract> = C1 & C2

const emitClientRpcResponse = ({
  ok,
  data,
  eventName,
  error,
  src,
}: RpcClientResponse) => {
  emitNet(eventName, src, {
    ok,
    data,
    error,
  })
}

const emitClientRpcError = (
  eventName: ResponseEvent,
  error: ErrorType,
  src: number,
) => {
  emitClientRpcResponse({
    ok: false,
    eventName,
    error,
    src,
  })
}

const emitClientRpcSuccess = (
  eventName: ResponseEvent,
  data: unknown,
  src: number,
) => {
  emitClientRpcResponse({
    ok: true,
    data,
    eventName,
    src,
  })
}

const getParsedArgs = async ({
  args,
  schema,
}: {
  args: unknown
  schema: z.Schema
}) => schema.parse(args)

/**
 * Creates a contract with options.
 *
 * @template {Contract} C - The contract type.
 * @param {C} contract - The contract object.
 * @param {ContractOptions} [options] - The contract options.
 * @returns {{ contract: C; options: ContractOptions }} - The created contract and options object.
 */
export const createContract = <C extends Contract>(
  contract: C,
  options?: ContractOptions,
): { contract: C; options: ContractOptions } => {
  const mergedOptions = { ...defaultContractOptions, ...options }

  return { contract, options: mergedOptions }
}

/**
 * Creates a server with RPC methods based on the given contract.
 *
 * @template {Contract} C - The contract type.
 * @param {C} contract - The contract object.
 * @param {ContractWithRpcMethods<C>} opts - The RPC methods object.
 * @returns {void}
 */
export const createServer = <C extends Contract>(
  contract: C,
  opts: ContractWithRpcMethods<C>,
  serverOptions?: ServerOptions,
): void => {
  const onceRequests = new Set<string>()

  const { logger = { active: false } } = serverOptions || {}

  const defauttLogFormat = (src: number, args: unknown) => {
    _customLog(
      COLORS.GREEN,
      `Request from ${COLORS.MAGENTA}[${src}]${COLORS.GREEN} : ${
        COLORS.MAGENTA
      }${JSON.stringify(args)}`,
    )
  }

  for (const [rpcName, rpcMethod] of Object.entries(opts)) {
    const { args: argsSchema, once = false } = contract[rpcName]

    const callback = async (args: unknown, responseEvent: ResponseEvent) => {
      const src = getSrc()

      if (onceRequests.has(rpcName)) {
        const errorMessage = `This event [${rpcName}] is \`once\` and has already been executed.`
        return emitClientRpcError(
          responseEvent,
          { type: Errors.EvoOnceError, message: errorMessage },
          src,
        )
      }

      try {
        const parsedArgs = argsSchema
          ? await getParsedArgs({ args, schema: argsSchema })
          : undefined

        const res = await (parsedArgs !== undefined
          ? rpcMethod(parsedArgs, src)
          : rpcMethod(src))

        emitClientRpcSuccess(responseEvent, res, src)

        if (logger.active) {
          const logMessage =
            serverOptions?.logger?.logFormat || defauttLogFormat
          logMessage(src, args)
        }
      } catch (error) {
        const { message, type } = error as ErrorType
        emitClientRpcError(responseEvent, { message, type }, src)
      } finally {
        once &&
          (onceRequests.add(rpcName), removeEventListener(rpcName, callback))
      }
    }

    onNet(rpcName, callback)
  }
}

/**
 * Creates a client API with RPC methods based on the given contract.
 *
 * @template {Contract} C - The contract type.
 * @param {C} API - The contract and options object.
 * @returns {ContractWithRpcMethodsClient<C['contract']>} - The client API object.
 */
export const createClientAPI = <
  C extends { contract: Contract; options: ContractOptions },
>(
  API: C,
): ContractWithRpcMethodsClient<C['contract']> => {
  const { contract, options } = API
  const clientAPI = {} as ContractWithRpcMethodsClient<C['contract']>

  const onceRequests = new Set<string>()

  for (const [methodName, methodValue] of Object.entries(contract)) {
    const {
      args: argsSchema,
      returns: returnsSchema,
      retryOptions = { max: 0, delay: 1000 },
      once = false,
    } = methodValue

    // @ts-ignore
    clientAPI[methodName as keyof C['contract']] = (
      args: InferFromSchema<typeof argsSchema>,
    ) => {
      return new Promise(async (resolve, reject) => {
        if (onceRequests.has(methodName)) {
          reject(
            new EvoOnceError(
              `Trying to call an event that is once and already executed ${methodName}`,
            ),
          )
        }

        let didTimedOut = false
        let retrysCount = 0

        try {
          const parsedArgs = argsSchema
            ? await getParsedArgs({ args, schema: argsSchema })
            : undefined

          const responseEvent = `${methodName}::${uuid()}`
          const _timeout = setTimeout(() => {
            didTimedOut = true
            removeEventListener(responseEvent, responseEventHandler)
            reject(new EvoTimeoutError(`${methodName} has timed out !`))
          }, options.timeout)

          const responseEventHandler = (
            res: ServerResponse<InferFromSchema<typeof returnsSchema>>,
          ) => {
            if (didTimedOut) return

            if (!res.ok) {
              if (retryOptions.max > 0 && retrysCount < retryOptions.max) {
                retrysCount++
                return emitNet(methodName, parsedArgs, responseEvent)
              }

              return reject(res.error)
            }

            once && onceRequests.add(methodName)

            resolve(res.data)
            removeEventListener(responseEvent, responseEventHandler)
            clearTimeout(_timeout)
          }

          onNet(responseEvent, responseEventHandler)
          emitNet(methodName, parsedArgs, responseEvent)
        } catch (error) {
          reject(error)
        }
      })
    }
  }

  return clientAPI
}

/**
 * Merges two contracts into a single contract.
 *
 * @template {Contract} C1 - The first contract type.
 * @template {Contract} C2 - The second contract type.
 * @param {C1} contract1 - The first contract object.
 * @param {C2} contract2 - The second contract object.
 * @returns {MergedContract<C1, C2>} - The merged contract object.
 */
export const mergeContracts = <C1 extends Contract, C2 extends Contract>(
  contract1: C1,
  contract2: C2,
): MergedContract<C1, C2> => ({ ...contract1, ...contract2 })
