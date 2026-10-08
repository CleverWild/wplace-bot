import { type ImageSettings } from './model'

export type ImageEffect = 'none' | 'recompute'
export type ImageChanges = Partial<ImageSettings>

export const SETTING_EFFECTS: Record<keyof ImageSettings, 'recompute'> = {
  strategy: 'recompute',
  drawTransparentPixels: 'recompute',
  drawColorsInOrder: 'recompute',
  colors: 'recompute',
  disabledColors: 'recompute',
  disabled: 'recompute',
  unownedColorStrategy: 'recompute',
  regionOrder: 'recompute',
  fillDirection: 'recompute',
  outlineFirst: 'recompute',
}

export function effectOf(keys: Iterable<string>): ImageEffect {
  for (const key of keys)
    if (Object.hasOwn(SETTING_EFFECTS, key)) return 'recompute'
  return 'none'
}

export type ImageControllerHost<Result> = {
  /** Starts a calculation from the settings as they are at call time */
  calculate(progress?: (p: number) => void): Promise<Result>
  apply(result: Result, progress?: (p: number) => void): void
  save(): Promise<void>
}

/** The one way image settings change, and the owner of calculation order */
export class ImageController<Result> {
  private revision = 0
  private disposed = false
  private latest: Promise<void> = Promise.resolve()

  public constructor(
    public readonly settings: ImageSettings,
    private readonly host: ImageControllerHost<Result>,
  ) {}

  /** Applies changes, does what they invalidate and saves. Returns the effect */
  public async update(
    changes: ImageChanges,
    { save = true }: { save?: boolean } = {},
  ): Promise<ImageEffect> {
    const effect = effectOf(this.assign(changes))
    if (effect === 'none') return effect
    await this.recompute()
    if (save) await this.host.save()
    return effect
  }

  public invalidate() {
    this.revision++
    this.latest = Promise.resolve()
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
      if (!Object.hasOwn(SETTING_EFFECTS, key)) continue
      const target = this.settings as Record<string, unknown>
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
