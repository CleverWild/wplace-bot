import { expect, test } from 'bun:test'

import { ImageStrategy } from '../ordering'

import { effectOf, ImageController } from './controller'
import { createImageSettings } from './model'

type Calculation = {
  strategy: ImageStrategy
  resolve: () => void
  reject: (error: Error) => void
}

function setup() {
  const calculations: Calculation[] = []
  const applied: ImageStrategy[] = []
  let saves = 0
  const controller = new ImageController<ImageStrategy>(
    createImageSettings({ strategy: ImageStrategy.DOWN }),
    {
      calculate: () =>
        new Promise<ImageStrategy>((resolve, reject) => {
          const strategy = controller.settings.strategy
          calculations.push({
            strategy,
            resolve: () => {
              resolve(strategy)
            },
            reject,
          })
        }),
      apply: (strategy) => applied.push(strategy),
      save: () => {
        saves++
        return Promise.resolve()
      },
    },
  )
  return {
    controller,
    calculations,
    applied,
    saves: () => saves,
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

test('every drawing setting recomputes and anything else does nothing', () => {
  expect(effectOf(['unownedColorStrategy', 'disabled'])).toBe('recompute')
  expect(effectOf(['width', 'opacity'])).toBe('none')
  expect(effectOf([])).toBe('none')
})

test('an unchanged value does nothing', async () => {
  const { controller, calculations, saves } = setup()
  expect(await controller.update({ strategy: ImageStrategy.DOWN })).toBe('none')
  expect(calculations).toHaveLength(0)
  expect(saves()).toBe(0)
})

test('a change calculates, applies and saves', async () => {
  const { controller, calculations, applied, saves } = setup()
  const done = controller.update({ strategy: ImageStrategy.UP })
  calculations[0]!.resolve()
  expect(await done).toBe('recompute')
  expect(applied).toEqual([ImageStrategy.UP])
  expect(saves()).toBe(1)
})

test('an older result arriving last cannot overwrite a newer one', async () => {
  const { controller, calculations, applied } = setup()
  const first = controller.update({ strategy: ImageStrategy.UP })
  const second = controller.update({ strategy: ImageStrategy.LEFT })
  calculations[1]!.resolve()
  await second
  calculations[0]!.resolve()
  await first
  expect(applied).toEqual([ImageStrategy.LEFT])
})

test('an earlier caller waits for the newest result', async () => {
  const { controller, calculations, applied } = setup()
  let firstDone = false
  const first = controller.recompute().then(() => (firstDone = true))
  const second = controller.recompute()
  calculations[0]!.resolve()
  await settle()
  expect(firstDone).toBe(false)
  calculations[1]!.resolve()
  await Promise.all([first, second])
  expect(applied).toEqual([ImageStrategy.DOWN])
})

test('a disposed image ignores pending results and failures', async () => {
  const { controller, calculations, applied } = setup()
  const pending = controller.recompute()
  const failing = controller.recompute()
  controller.dispose()
  calculations[0]!.resolve()
  calculations[1]!.reject(new Error('gone'))
  await Promise.all([pending, failing])
  expect(applied).toEqual([])
})

test('only a failure of the newest calculation reaches the caller', async () => {
  const { controller, calculations, applied } = setup()
  const first = controller.recompute()
  const second = controller.recompute()
  calculations[0]!.reject(new Error('obsolete'))
  calculations[1]!.reject(new Error('current'))
  const results = await Promise.allSettled([first, second])
  expect(results.map((result) => result.status)).toEqual([
    'rejected',
    'rejected',
  ])
  expect(applied).toEqual([])
})
