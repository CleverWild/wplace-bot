import { expect, test } from 'bun:test'

import { assembleBuildOutput } from './build-artifact'

test('assembles the banner and rewrites the main bundle export', () => {
  const main =
    'const worker = ' + '`<WORKER_SOURCE_CODE>`' + '\nexport { value }'
  const source = assembleBuildOutput('// banner\n', main, 'const value = 1')
  expect(source).toBe('// banner\nconst worker = `const value = 1`\n{ value }')
  expect(source).not.toContain('<WORKER_SOURCE_CODE>')
})

test('escapes worker template syntax and preserves dollar sequences', () => {
  const source = assembleBuildOutput(
    '',
    'new Blob([`<WORKER_SOURCE_CODE>`])',
    'const text = `tick` + ${value} + $& + $1',
  )
  expect(source).toContain('\\`')
  expect(source).toContain('\\${value}')
  expect(source).toContain('$& + $1')
})

test('preserves worker backslashes when the assembled template is evaluated', () => {
  const worker = [
    "const path = '\\n'",
    'const regex = /\\d+/',
    'const tick = `tick`',
    'const interpolation = ${value}',
    'const replacement = $& + $1',
  ].join('; ')
  const source = assembleBuildOutput(
    '',
    'return `<WORKER_SOURCE_CODE>`',
    worker,
  )
  // Evaluate the generated template so this test checks the source recovered by the browser.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const recover = new Function(source) as () => string
  expect(recover()).toBe(worker)
})

test('requires exactly one worker placeholder', () => {
  expect(() => assembleBuildOutput('', 'no placeholder', '')).toThrow(
    /exactly one/,
  )
  expect(() =>
    assembleBuildOutput('', '<WORKER_SOURCE_CODE> <WORKER_SOURCE_CODE>', ''),
  ).toThrow(/exactly one/)
})

test('returns JavaScript that parses after assembly', () => {
  const source = assembleBuildOutput(
    '',
    'const worker = `<WORKER_SOURCE_CODE>`',
    'const text = `tick` + ${value}',
  )
  const transpiler = new Bun.Transpiler({ loader: 'js' })
  expect(() => transpiler.transformSync(source)).not.toThrow()
})
