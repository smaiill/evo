export const defaultContractOptions = {
  timeout: 7500,
}

export type ContractOptions = {
  [K in keyof typeof defaultContractOptions]: (typeof defaultContractOptions)[K]
}
declare global {
  interface Window {
    GetParentResourceName(): string
  }
}

const PossibleApiCommunication = [
  { current: 'rs', target: 'rc' },
  { current: 'rc', target: 'rs' },
  { current: 'ui', target: 'rc' },
] as const

const PossibleListenersCommunication = [
  { current: 'rs', target: 'rc' },
  { current: 'rc', target: 'rs' },
  { current: 'rc', target: 'ui' },
] as const

export const PossibleEnvsCommunication = {
  api: PossibleApiCommunication,
  listener: PossibleListenersCommunication,
} as const

export type PossibleEnvsCommunicationKeys =
  keyof typeof PossibleEnvsCommunication
