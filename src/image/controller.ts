import { type ImageSettings } from './model'

/** Cheapest first: each effect includes what the ones before it do */
export type ImageEffect = 'none' | 'render' | 'recompute'

export type ImagePlacement = { globalX: number; globalY: number }

export type ImageChanges = Partial<ImageSettings & ImagePlacement>

const RANK: Record<ImageEffect, number> = {
  none: 0,
  render: 1,
  recompute: 2,
}

/**
 * What a changed field invalidates. Opacity, lock and name only change how the
 * overlay looks; anything the worker reads needs a new calculation, and so
 * does placement, because tiles under a new position must be compared again.
 */
export const SETTING_EFFECTS: Record<
  keyof ImageSettings,
  Exclude<ImageEffect, 'none'>
> = {
  width: 'recompute',
  height: 'recompute',
  brightness: 'recompute',
  colorMetric: 'recompute',
  strategy: 'recompute',
  opacity: 'render',
  drawTransparentPixels: 'recompute',
  drawColorsInOrder: 'recompute',
  colors: 'recompute',
  disabledColors: 'recompute',
  lock: 'render',
  // Tasks of a hidden image are dropped, and showing it needs fresh ones
  disabled: 'recompute',
  name: 'render',
  // Substitution changes which colors the pixels get
  unownedColorStrategy: 'recompute',
  wplaceId: 'render',
  siteDisabled: 'recompute',
  regionOrder: 'recompute',
  fillDirection: 'recompute',
  outlineFirst: 'recompute',
}

const PLACEMENT_EFFECTS: Record<keyof ImagePlacement, 'recompute'> = {
  globalX: 'recompute',
  globalY: 'recompute',
}

const EFFECTS: Partial<Record<string, ImageEffect>> = {
  ...SETTING_EFFECTS,
  ...PLACEMENT_EFFECTS,
}

export function effectOf(keys: Iterable<string>): ImageEffect {
  let effect: ImageEffect = 'none'
  for (const key of keys) {
    const next = EFFECTS[key]
    if (next && RANK[next] > RANK[effect]) effect = next
  }
  return effect
}

export type ImageControllerHost<Result> = {
  /** Starts a calculation from the settings as they are at call time */
  calculate(progress?: (p: number) => void): Promise<Result>
  apply(result: Result, progress?: (p: number) => void): void
  render(): void
  save(): Promise<void>
}

/** The one way image settings change, and the owner of calculation order */
export class ImageController<Result> {
  private revision = 0
  private disposed = false
  private latest: Promise<void> = Promise.resolve()

  public constructor(
    public readonly settings: ImageSettings,
    public readonly placement: ImagePlacement,
    private readonly host: ImageControllerHost<Result>,
  ) {}

  /** Applies changes, does what they invalidate and saves. Returns the effect */
  public async update(
    changes: ImageChanges,
    { save = true }: { save?: boolean } = {},
  ): Promise<ImageEffect> {
    const effect = effectOf(this.assign(changes))
    if (effect === 'none') return effect
    if (effect === 'recompute') await this.recompute()
    else this.host.render()
    if (save) await this.host.save()
    return effect
  }

  /**
   * Live feedback while dragging: renders and saves, but leaves the
   * calculation to `recompute()` once the gesture ends.
   */
  public preview(changes: ImageChanges): Promise<void> {
    if (this.assign(changes).length === 0) return Promise.resolve()
    this.host.render()
    return this.host.save()
  }

  /**
   * Resolves once the newest calculation is applied. Results of older
   * calculations are dropped, so they can never overwrite newer settings.
   */
  public recompute(progress?: (p: number) => void): Promise<void> {
    const run = this.run(++this.revision, progress)
    this.latest = run
    return run
  }

  /** Pending results are dropped from now on */
  public dispose() {
    this.disposed = true
    this.revision++
  }

  private assign(changes: ImageChanges): string[] {
    const changed: string[] = []
    for (const [key, value] of Object.entries(changes)) {
      const target = (
        key in PLACEMENT_EFFECTS ? this.placement : this.settings
      ) as Record<string, unknown>
      if (Object.is(target[key], value)) continue
      target[key] = value
      changed.push(key)
    }
    return changed
  }

  private async run(revision: number, progress?: (p: number) => void) {
    let result: Result
    try {
      result = await this.host.calculate(progress)
    } catch (error) {
      if (this.disposed) return
      if (revision !== this.revision) return this.latest
      throw error
    }
    if (this.disposed) return
    if (revision !== this.revision) return this.latest
    this.host.apply(result, progress)
  }
}
