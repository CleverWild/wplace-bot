import { expect, test } from 'bun:test'

import { effectOf, ImageController } from './controller'
import { createImageSettings } from './model'

type Calculation = {
  width: number
  resolve: () => void
  reject: (error: Error) => void
}

function setup() {
  const calculations: Calculation[] = []
  const applied: number[] = []
  const rendered: string[] = []
  let saves = 0
  const controller = new ImageController<number>(
    createImageSettings({ width: 10 }),
    { globalX: 0, globalY: 0 },
    {
      calculate: () =>
        new Promise<number>((resolve, reject) => {
          const width = controller.settings.width
          calculations.push({
            width,
            resolve: () => {
              resolve(width)
            },
            reject,
          })
        }),
      apply: (width) => applied.push(width),
      render: () => rendered.push('render'),
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
    rendered,
    saves: () => saves,
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

test('opacity, lock and name only render', () => {
  expect(effectOf(['opacity', 'lock', 'name'])).toBe('render')
  expect(effectOf(['unownedColorStrategy', 'opacity'])).toBe('recompute')
  expect(effectOf(['opacity', 'globalX'])).toBe('recompute')
  expect(effectOf([])).toBe('none')
})

test('a render-only change never calculates', async () => {
  const { controller, calculations, rendered, saves } = setup()
  expect(await controller.update({ opacity: 20, name: 'x' })).toBe('render')
  expect(calculations).toHaveLength(0)
  expect(rendered).toEqual(['render'])
  expect(saves()).toBe(1)
})

test('an unchanged value does nothing', async () => {
  const { controller, rendered, saves } = setup()
  expect(await controller.update({ opacity: 50 })).toBe('none')
  expect(rendered).toEqual([])
  expect(saves()).toBe(0)
})

test('a new position is compared against the map again', async () => {
  const { controller, calculations, applied } = setup()
  const done = controller.update({ globalX: 5 })
  expect(controller.placement.globalX).toBe(5)
  calculations[0]!.resolve()
  await done
  expect(applied).toEqual([10])
})

test('an older result arriving last cannot overwrite a newer one', async () => {
  const { controller, calculations, applied } = setup()
  const first = controller.update({ width: 20 })
  const second = controller.update({ width: 30 })
  calculations[1]!.resolve()
  await second
  calculations[0]!.resolve()
  await first
  expect(applied).toEqual([30])
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
  expect(applied).toEqual([10])
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

test('preview renders and saves without calculating', async () => {
  const { controller, calculations, rendered, saves } = setup()
  await controller.preview({ globalX: 3, width: 40 })
  expect(calculations).toHaveLength(0)
  expect(rendered).toEqual(['render'])
  expect(saves()).toBe(1)
  expect(controller.settings.width).toBe(40)
})
