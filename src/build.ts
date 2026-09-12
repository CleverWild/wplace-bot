import { readFileSync, writeFileSync } from 'node:fs'

import Bun from 'bun'

import { assembleBuildOutput } from './build-artifact'

function describeLogs(logs: readonly unknown[]): string {
  return logs
    .map((log) => (typeof log === 'string' ? log : JSON.stringify(log)))
    .join('\n')
}

function getBuildOutput(
  result: Awaited<ReturnType<typeof Bun.build>>,
  label: string,
): Blob {
  if (!result.success)
    throw new Error(`Failed to build ${label}:\n${describeLogs(result.logs)}`)
  if (result.outputs.length === 0)
    throw new Error(`Build ${label} produced no output`)
  return result.outputs[0]!
}

const mainBuild = await Bun.build({
  entrypoints: ['./src/bot.ts'],
  target: 'browser',
})
for (const log of mainBuild.logs) console.log(log)
const mainOutput = getBuildOutput(mainBuild, 'main bundle')

const workerBuild = await Bun.build({
  entrypoints: ['./src/worker.ts'],
  format: 'iife',
  target: 'browser',
})
for (const log of workerBuild.logs) console.log(log)
const workerOutput = getBuildOutput(workerBuild, 'worker bundle')

const content = assembleBuildOutput(
  readFileSync('./script.txt').toString(),
  await mainOutput.text(),
  await workerOutput.text(),
)

if (process.argv.includes('--check')) {
  const committed = readFileSync('./dist.user.js').toString()
  if (content !== committed)
    throw new Error(
      'dist.user.js is out of date; run bun run build and commit the result',
    )
} else writeFileSync('dist.user.js', content)
