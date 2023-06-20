export const defaultContractOptions = {
  timeout: 7500,
}

export const Errors = {
  EvoTimeoutError: 'EvoTimeoutError',
  EvoOnceError: 'EvoOnceError',
} as const

export type ContractOptions = {
  [K in keyof typeof defaultContractOptions]: (typeof defaultContractOptions)[K]
}
