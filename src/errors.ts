import { Errors } from './consts'

export class EvoTimeoutError extends Error {
  type = Errors.EvoTimeoutError
  constructor(message: string) {
    super(message)
  }
}

export class EvoOnceError extends Error {
  type = Errors.EvoOnceError
  constructor(message: string) {
    super(message)
  }
}
