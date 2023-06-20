import { context } from 'esbuild'

const __exampleServer = {
  name: 'nx__watch__server',
  setup(build) {
    build.onEnd((res) => {
      if (res.errors.length > 0) {
        console.log('\x1b[31m%s\x1b[0m', 'Error while compiling [-SERVER-]')
      } else {
        console.log(
          '\x1b[36m%s\x1b[0m',
          `Build with success \x1b[32m[SERVER]\x1b[0m : ${new Date().toLocaleString()}`,
        )
      }
    })
  },
}

const __exampleClient = {
  name: 'nx__watch__client',
  setup(build) {
    build.onEnd((res) => {
      if (res.errors.length > 0) {
        console.log('\x1b[31m%s\x1b[0m', 'Error while compiling [-CLIENT-]')
      } else {
        console.log(
          '\x1b[36m%s\x1b[0m',
          `Build with success \x1b[32m[CLIENT]\x1b[0m : ${new Date().toLocaleString()}`,
        )
      }
    })
  },
}

const server = await context({
  bundle: true,
  entryPoints: ['./example/server.ts'],
  outfile: 'example/dist/server.js',
  sourcemap: 'external',
  platform: 'node',
  plugins: [__exampleServer],
  loader: {
    '.ts': 'ts',
    '.js': 'js',
  },
})

const client = await context({
  bundle: true,
  entryPoints: ['./example/client.ts'],
  outfile: 'example/dist/client.js',
  sourcemap: 'external',
  platform: 'node',
  plugins: [__exampleClient],
  loader: {
    '.ts': 'ts',
    '.js': 'js',
  },
})

await client.watch()
await server.watch()
