import { expect, test } from 'bun:test'

import { SaveQueue } from './save-queue'

test('writes a scheduled save without an explicit flush', async () => {
  const written: number[] = []
  const queue = new SaveQueue<number>((value) => {
    written.push(value)
    return Promise.resolve()
  }, 1)
  await queue.save(() => Promise.resolve(4))
  expect(written).toEqual([4])
})

test('flush reports an already running write failure', async () => {
  const queue = new SaveQueue<number>(() => Promise.reject(new Error('failed')))
  const saved = queue.save(() => Promise.resolve(1), true)
  const results = await Promise.allSettled([saved, queue.flush()])
  expect(results.map((result) => result.status)).toEqual([
    'rejected',
    'rejected',
  ])
})

test('coalesces saves and settles every caller after writing the latest snapshot', async () => {
  const written: number[] = []
  const queue = new SaveQueue<number>((value) => {
    written.push(value)
    return Promise.resolve()
  })
  const first = queue.save(() => Promise.resolve(1))
  const second = queue.save(() => Promise.resolve(2))
  await queue.flush()
  await Promise.all([first, second])
  expect(written).toEqual([2])
})

test('serializes writes so a slow older snapshot cannot overwrite a newer save', async () => {
  const written: number[] = []
  let release!: () => void
  const blocked = new Promise<void>((resolve) => {
    release = resolve
  })
  const queue = new SaveQueue<number>((value) => {
    written.push(value)
    return Promise.resolve()
  })
  const first = queue.save(async () => {
    await blocked
    return 1
  }, true)
  const second = queue.save(() => Promise.resolve(2), true)
  await Promise.resolve()
  expect(written).toEqual([])
  release()
  await Promise.all([first, second])
  expect(written).toEqual([1, 2])
})

test('rejects all callers on storage failure and accepts a later save', async () => {
  const written: number[] = []
  let fail = true
  const queue = new SaveQueue<number>((value) => {
    if (fail) return Promise.reject(new Error('storage unavailable'))
    written.push(value)
    return Promise.resolve()
  })
  const first = queue.save(() => Promise.resolve(1))
  const second = queue.save(() => Promise.resolve(2))
  const results = Promise.allSettled([first, second])
  const [flush] = await Promise.allSettled([queue.flush()])
  expect(flush.status).toBe('rejected')
  expect((await results).map((result) => result.status)).toEqual([
    'rejected',
    'rejected',
  ])
  fail = false
  await queue.save(() => Promise.resolve(3), true)
  expect(written).toEqual([3])
})
