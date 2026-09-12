const WORKER_SOURCE_PLACEHOLDER = '<WORKER_SOURCE_CODE>'

function escapeWorkerSource(worker: string): string {
  return worker
    .replace(/\\/g, () => '\\\\')
    .replace(/`/g, () => '\\`')
    .replace(/\$\{/g, () => '\\${')
}

export function assembleBuildOutput(
  banner: string,
  main: string,
  worker: string,
): string {
  let occurrences = 0
  let offset = 0
  while ((offset = main.indexOf(WORKER_SOURCE_PLACEHOLDER, offset)) !== -1) {
    occurrences++
    offset += WORKER_SOURCE_PLACEHOLDER.length
  }
  if (occurrences !== 1)
    throw new Error(
      `Expected exactly one ${WORKER_SOURCE_PLACEHOLDER} placeholder, found ${occurrences}`,
    )

  const assembledMain = main
    .replaceAll('export {', '{')
    .replace(WORKER_SOURCE_PLACEHOLDER, () => escapeWorkerSource(worker))
  return banner + assembledMain
}
