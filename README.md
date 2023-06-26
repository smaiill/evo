# evo

> ⚠️ This README and the library are still a work in progress (WIP).

`evo` is a powerful package designed to enhance your FiveM projects. It offers numerous benefits, including type safety and data validation through the use of Zod. Many more features are currently in development and will be added soon.

## Features

- **Typesafe Contracts:** The system allows you to define contracts using TypeScript types, ensuring type safety for method arguments and returned values.

- **Flexible Communication:** The system supports communication between three environments: RC (Client Side), RS (Server Side), and UI (User Interface Side). You can define RPC methods that can be called between any combination of these environments see [Environnemnts](#envs).

- **Runtime Data Validation:** The system includes built-in runtime data validation for method arguments. Using [Zod](https://zod.dev/).

- **Retry Mechanism:** RPC methods can have retry options, including delay between requests and maximum number of retry attempts. This allows for resilient communication in case of network failures or temporary unavailability.

- **Timeout Handling:** RPC method calls can have a timeout duration. If a method call exceeds the specified timeout, an error will be thrown.

- **Error Handling:** The system provides structured error handling, allowing you to handle and propagate errors between environments.

## 📖 Getting started

### Installation

- npm

```sh
npm install @smaiill/evo
```

- pnpm

```sh
npm install @smaiill/evo
```

## 📋 API definitions

### `Contract`

The Contract class represents a contract with RPC methods. It provides methods for creating listeners and APIs for communication between different environments.

```ts
import { Contract } from '@smaiill/evo'

const contract = new Contract({
  getUserById: {
    args: z.object({
      id: z.number(),
    }),
    returns: z.object({
      name: z.string(),
      id: z.number(),
    }),
  },
})
```

#### Contract Methods

Methods Arguments

```ts
type RetryOptions = {
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

getUserById: {
  args: z.object({
    id: z.number(),
  }),
  returns: z.object({
    name: z.string(),
    id: z.number(),
  }),
  retryOptions: {
    delay: 750,
    max: 3
  }
}
```

- createListener

`createListener` allows you to create a listener between your current environment and the target environment. [Environnemnts](#envs)

```ts
createListener<CE extends Envs, TE extends Envs>(currentEnv: CE, targetEnv: TE, listeners: ContractWithRpcMethods<C, CE, TE>): {
 contract: C;
 envs: {
   currentEnv: CE;
   targetEnv: TE;
 };
}

// This will create a listener on the server side for the client side
const server = <contract>.createListener('rs', 'rc', {
  getUserById: async ({ id }) => {
    return {
      name: userData.name,
      id,
    }
  },
})
```

- createApi

`createApi` allows you to create an API between your current environment and the target environment. [Environnemnts](#envs)

```ts
createApi<CE extends Envs, TE extends Envs>(currentEnv: CE, targetEnv: TE): ContractWithRpcMethods<C, CE, TE>;


// This will open a communication between the client side and the server side
const clientApi = <contract>.createApi('rc', 'rs')

const userData = await clientApi.getUserById({ id: 10 })
```

#### Contract Configuration

- timeout

The timeout allows you to define, in milliseconds, the time until your API call will fail if not resolved after the timeout. In this case, the timeout is set to `5000ms`.

```ts
const contract = new Contract(
  {
    getUserById: {
      args: z.object({
        id: z.number(),
      }),
      returns: z.object({
        name: z.string(),
        id: z.number(),
      }),
    },
  },
  {
    timeout: 5000,
  },
)
```

## Environnements

<a id="envs"></a>

```ts
export enum Environments {
  rs = 'rs', // Server side
  rc = 'rc', // Client side
  ui = 'ui', // User interface side
}
```

The `PossibleApiCommunication` is the possible environnements for `createApi`.

```ts
const PossibleApiCommunication = [
  { current: 'rs', target: 'rc' },
  { current: 'rc', target: 'rs' },
  { current: 'ui', target: 'rc' },
] as const
```

The `PossibleListenersCommunication` is the possible environnements for `createListener`.

```ts
const PossibleListenersCommunication = [
  { current: 'rs', target: 'rc' },
  { current: 'rc', target: 'rs' },
  { current: 'rc', target: 'ui' },
] as const
```
