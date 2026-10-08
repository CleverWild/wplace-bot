import { removeFromArray } from '@softsky/utils'

import { Base } from './base'
import { WPlaceBot } from './bot'
import { COLORS, COLORS_RGB, colorToCSS } from './colors'
import { ImageController } from './image/controller'
import {
  createImageSettings,
  type ImageSettings,
  type PixelColorStat,
  UnownedColorStrategy,
} from './image/model'
// @ts-ignore
import html from './image.html' with { type: 'text' }
import { addClass, obfucsateHTML, removeClass, toggleClass } from './obfuscator'
import {
  type FillDirection,
  type ImageStrategy,
  RegionOrder,
  sortColorsByAmount,
} from './ordering'
import { type SavedImage } from './persistence/schema'
import { type WorkerPixelsResponse } from './processing/protocol'
import { save } from './save'
import { type SiteTemplate } from './site/template-data'
import { estimateEtaMinutes, formatEta, formatPercent } from './utils'
import { workerPixels } from './worker-client'
import { WorldPosition } from './world-position'

/** A worker result with the template it was calculated for */
type Calculation = {
  result: WorkerPixelsResponse
  template: SiteTemplate
}

/**
 * Time left to paint `remaining` pixels, counting stored and regenerated
 * charges, the ones droplets pay for when the bot is set to buy them, and
 * what bought flags refund on `cashbackPixels` of them
 */
export function etaText(
  bot: WPlaceBot,
  remaining: number,
  cashbackPixels: number,
): string {
  const cooldownMs = bot.me?.charges.cooldownMs ?? 30000
  const minutes = estimateEtaMinutes(
    remaining,
    bot.me?.charges.count ?? 0,
    bot.me?.charges.max ?? 0,
    cooldownMs,
    bot.lastMeAt === undefined ? 0 : Date.now() - bot.lastMeAt,
    bot.spendsOnCharges ? (bot.me?.droplets ?? 0) : undefined,
    bot.colorsToBuy().length,
    cashbackPixels,
  )
  return formatEta(minutes)
}

/**
 * A template placed in wplace's own manager, plus how the bot draws it.
 * The site owns the picture, name, position and size; the bot owns the
 * drawing settings and the task queue.
 */
export class BotImage extends Base {
  public pixels = new Uint8Array(0)
  public colorsStat = new Map<number, PixelColorStat>()

  /** Why the template cannot be drawn, when wplace's side could not be read */
  public error?: string

  /** Pixels to draw */
  public tasks = new Uint32Array(0)

  /** The picture at its placed size, for the list */
  public readonly thumbnail = document.createElement('canvas')

  /** Top-left corner of the template */
  public position: WorldPosition

  /** Settings are read through the controller and changed with `update()` */
  protected readonly controller: ImageController<Calculation>

  public readonly element = document.createElement('div')
  protected readonly context
  protected readonly $colors!: HTMLDivElement
  protected readonly $drawColorsInOrder!: HTMLInputElement
  protected readonly $drawTransparent!: HTMLInputElement
  protected readonly $progressLine!: HTMLDivElement
  protected readonly $progressText!: HTMLSpanElement
  protected readonly $strategy!: HTMLSelectElement
  protected readonly $name!: HTMLDivElement
  protected readonly $unownedColorStrategyLabel!: HTMLLabelElement
  protected readonly $unownedColorStrategy!: HTMLSelectElement
  protected readonly $outlineFirst!: HTMLInputElement
  protected readonly $regionOrderLabel!: HTMLLabelElement
  protected readonly $regionOrder!: HTMLSelectElement
  protected readonly $fillDirectionLabel!: HTMLLabelElement
  protected readonly $fillDirection!: HTMLSelectElement
  protected readonly $sortColorsDesc!: HTMLButtonElement
  protected readonly $sortColorsAsc!: HTMLButtonElement
  protected readonly $dialog!: HTMLDialogElement

  public constructor(
    protected bot: WPlaceBot,
    public template: SiteTemplate,
    overrides: Partial<ImageSettings> = {},
  ) {
    super()
    this.position = new WorldPosition(bot, ...template.position)
    this.controller = new ImageController(createImageSettings(overrides), {
      calculate: (progress) => this.calculate(progress),
      apply: (calculation, progress) => {
        this.applyCalculation(calculation, progress)
      },
      save: () => save(this.bot),
    })

    this.element.innerHTML = obfucsateHTML(html)
    addClass(this.element, 'image')
    document.body.append(this.element)

    this.populateElementsWithSelector(this.element, {
      $colors: '.colors',
      $drawColorsInOrder: '.draw-colors-in-order',
      $drawTransparent: '.draw-transparent',
      $progressLine: '.progress div',
      $progressText: '.progress span',
      $strategy: '.strategy',
      $name: '.name',
      $unownedColorStrategyLabel: '.unowned-color-strategy',
      $outlineFirst: '.outline-first',
      $regionOrderLabel: '.region-order',
      $fillDirectionLabel: '.fill-direction',
      $sortColorsDesc: '.sort-colors-desc',
      $sortColorsAsc: '.sort-colors-asc',
      $dialog: 'dialog',
    })
    this.context = this.thumbnail.getContext('2d')!
    this.$unownedColorStrategy =
      this.$unownedColorStrategyLabel.querySelector<HTMLSelectElement>(
        'select',
      )!
    this.$regionOrder =
      this.$regionOrderLabel.querySelector<HTMLSelectElement>('select')!
    this.$fillDirection =
      this.$fillDirectionLabel.querySelector<HTMLSelectElement>('select')!

    // Close on backdrop click
    this.$dialog.addEventListener('click', (event) => {
      if (event.target === this.$dialog) this.$dialog.close()
    })
    this.$unownedColorStrategy.addEventListener('change', () => {
      void this.update({
        unownedColorStrategy: this.$unownedColorStrategy
          .value as UnownedColorStrategy,
      })
    })
    this.$strategy.addEventListener('change', () => {
      void this.update({ strategy: this.$strategy.value as ImageStrategy })
    })
    this.$regionOrder.addEventListener('change', () => {
      void this.update({
        regionOrder: this.$regionOrder.value as RegionOrder,
      })
    })
    this.$fillDirection.addEventListener('change', () => {
      void this.update({
        fillDirection: this.$fillDirection.value as FillDirection,
      })
    })
    this.$outlineFirst.addEventListener('click', () => {
      void this.update({ outlineFirst: this.$outlineFirst.checked })
    })

    // Color order shortcuts
    const sortColors = (ascending: boolean) => {
      const amounts = new Map<number, number>()
      for (const stat of this.colorsStat.values())
        amounts.set(stat.realColor, stat.amount)
      return this.update({
        colors: sortColorsByAmount(this.colors, amounts, ascending),
      })
    }
    this.$sortColorsDesc.addEventListener('click', () => void sortColors(false))
    this.$sortColorsAsc.addEventListener('click', () => void sortColors(true))

    this.$drawTransparent.addEventListener('click', () => {
      void this.update({
        drawTransparentPixels: this.$drawTransparent.checked,
      })
    })
    this.$drawColorsInOrder.addEventListener('click', () => {
      void this.update({ drawColorsInOrder: this.$drawColorsInOrder.checked })
    })
    this.updateUI()
  }

  public get wplaceId() {
    return this.template.id
  }
  public get name() {
    return this.template.name
  }
  public get width() {
    return this.template.width
  }
  public get height() {
    return this.template.height
  }

  /** Both switches have to be on: ours and the site's. An unreadable template never is */
  public get visible() {
    return !this.disabled && this.template.visible && !this.error
  }

  // Read-only on purpose: every change goes through `update()` and its effects
  public get strategy() {
    return this.controller.settings.strategy
  }
  public get drawTransparentPixels() {
    return this.controller.settings.drawTransparentPixels
  }
  public get drawColorsInOrder() {
    return this.controller.settings.drawColorsInOrder
  }
  public get colors() {
    return this.controller.settings.colors
  }
  public get disabledColors() {
    return this.controller.settings.disabledColors
  }
  public get disabled() {
    return this.controller.settings.disabled
  }
  public get unownedColorStrategy() {
    return this.controller.settings.unownedColorStrategy
  }
  public get regionOrder() {
    return this.controller.settings.regionOrder
  }
  public get fillDirection() {
    return this.controller.settings.fillDirection
  }
  public get outlineFirst() {
    return this.controller.settings.outlineFirst
  }

  public openSettings() {
    this.updateUI()
    this.$dialog.showModal()
  }

  /** Change settings. Recalculates and saves only what they need */
  public async update(changes: Partial<ImageSettings>) {
    await this.guarded(() => this.controller.update(changes))
    this.bot.widget.update()
  }

  public toJSON(): SavedImage {
    return {
      wplaceId: this.wplaceId,
      strategy: this.strategy,
      drawTransparentPixels: this.drawTransparentPixels,
      drawColorsInOrder: this.drawColorsInOrder,
      colors: this.colors,
      disabledColors: Array.from(this.disabledColors),
      disabled: this.disabled,
      unownedColorStrategy: this.unownedColorStrategy,
      regionOrder: this.regionOrder,
      fillDirection: this.fillDirection,
      outlineFirst: this.outlineFirst,
    }
  }

  /**
   * Take wplace's current version of the template.
   * Returns whether anything changed.
   */
  public async applyTemplate(template: SiteTemplate) {
    const previous = this.template
    this.template = template
    if (template.contentKey === previous.contentKey) {
      if (template.name !== previous.name) this.updateUI()
      return template.revision !== previous.revision
    }
    this.position = new WorldPosition(this.bot, ...template.position)
    await this.updatePixels()
    return true
  }

  /** Calculates everything we need to do. Very expensive task! */
  public updatePixels(progress?: (p: number) => void) {
    return this.guarded(() => this.controller.recompute(progress))
  }

  /** A template that cannot be read is blocked, not removed */
  protected async guarded(run: () => Promise<unknown>) {
    try {
      await run()
      this.error = undefined
    } catch (error) {
      console.error(error)
      this.error = error instanceof Error ? error.message : String(error)
      this.tasks = new Uint32Array(0)
    }
    this.updateUI()
  }

  protected async calculate(progress?: (p: number) => void) {
    const { template } = this
    const templates = this.bot.templates
    if (!templates) throw new Error('Wplace templates are unavailable')
    const pixels = await templates.pixels(template, this.bot.unavailableColors)
    const result = await workerPixels(
      {
        pixels,
        width: template.width,
        height: template.height,
        colorMetric: template.colorMetric,
        colors: this.colors,
        disabledColors: this.disabledColors,
        drawColorsInOrder: this.drawColorsInOrder,
        drawTransparentPixels: this.drawTransparentPixels,
        globalX: template.position[0],
        globalY: template.position[1],
        strategy: this.strategy,
        regionOrder: this.regionOrder,
        fillDirection: this.fillDirection,
        outlineFirst: this.outlineFirst,
        unavailableColors: this.bot.unavailableColors,
        unownedColorStrategy: this.unownedColorStrategy,
      },
      progress ??
        ((p: number) => {
          this.bot.widget.status = `⌛ Loading ${formatPercent(p)}`
        }),
    )
    return { result, template }
  }

  protected applyCalculation(
    { result, template }: Calculation,
    progress?: (p: number) => void,
  ) {
    const { width, height } = template
    this.colorsStat = result.colorStat
    this.tasks = this.visible ? result.taskPositions : new Uint32Array(0)
    // The ETA counts flag cashback per tile, so learn the tiles a moved image
    // landed on. Known tiles cost nothing
    void this.bot.fetchTileCountries([this]).then((learned) => {
      if (learned) this.bot.widget.updateProgress()
    })
    this.pixels = result.pixels
    this.thumbnail.width = width
    this.thumbnail.height = height
    this.context.clearRect(0, 0, width, height)
    const rgbPixels = new Uint8ClampedArray(this.pixels.length * 4)
    for (let index = 0; index < this.pixels.length; index++) {
      const pixel = this.pixels[index]!
      if (pixel === 0) continue
      const qIndex = index * 4
      const color = COLORS_RGB[pixel]!
      rgbPixels[qIndex] = color >> 16
      rgbPixels[qIndex + 1] = (color >> 8) & 0xff
      rgbPixels[qIndex + 2] = color & 0xff
      rgbPixels[qIndex + 3] = 255
    }
    this.context.putImageData(new ImageData(rgbPixels, width, height), 0, 0)
    this.updateUI()
    this.updateColors()
    if (!progress) this.bot.widget.status = ''
    this.bot.widget.update()
  }

  /** Update the settings dialog */
  public updateUI() {
    this.$name.textContent = this.name
    this.$strategy.value = this.strategy
    this.$unownedColorStrategy.value = this.unownedColorStrategy
    this.$drawTransparent.checked = this.drawTransparentPixels
    this.$drawColorsInOrder.checked = this.drawColorsInOrder
    this.$outlineFirst.checked = this.outlineFirst
    this.$regionOrder.value = this.regionOrder
    this.$fillDirection.value = this.fillDirection
    // How a blob is filled means nothing while blobs are not a thing
    if (this.regionOrder === RegionOrder.OFF)
      addClass(this.$fillDirectionLabel, 'hidden')
    else removeClass(this.$fillDirectionLabel, 'hidden')
    this.updateProgress()
  }

  /**
   * Pixels the progress counts. Transparent ones never become tasks unless
   * they are asked for, so counting them would score them as already done and
   * open the bar at whatever share of the rectangle the image leaves empty
   */
  public get countedPixels() {
    const total = this.width * this.height
    if (this.drawTransparentPixels) return total
    return total - (this.colorsStat.get(0)?.amount ?? 0)
  }

  public get progress() {
    const total = this.countedPixels
    const done = total - this.tasks.length / 2
    return { done, total, percent: total ? done / total : 0 }
  }

  public updateProgress() {
    const { done, total, percent } = this.progress
    this.$progressText.textContent = this.error
      ? `❌ ${this.error}`
      : `${done}/${total} ${formatPercent(percent)} ETA: ${etaText(this.bot, this.tasks.length / 2, this.bot.cashbackTasks(this))}`
    this.$progressLine.style.transform = `scaleX(${this.error ? 0 : percent})`
  }

  /** Drops the bot's side of the template; the site's copy is untouched */
  public override destroy() {
    this.controller.dispose()
    super.destroy()
    this.element.remove()
    removeFromArray(this.bot.images, this)
  }

  /** Update colors array */
  public updateColors() {
    const LINE_HEIGHT = 20
    if (this.bot.unavailableColors.size === 0)
      addClass(this.$unownedColorStrategyLabel, 'hidden')
    this.$colors.innerHTML = ''
    // Only the colors we show, so the percents add up to 100%
    let pixelsSum = 0
    for (const stat of this.colorsStat.values())
      if (this.drawTransparentPixels || stat.realColor !== 0)
        pixelsSum += stat.amount

    // If not the synced with colors then rebuild order. It follows the result
    // that was just applied, so it must not start another calculation
    if (
      this.colors.length !== this.colorsStat.size ||
      this.colors.some((x) => !this.colorsStat.has(x))
    ) {
      this.controller.settings.colors = this.colorsStat
        .values()
        .toArray()
        .sort((a, b) => b.amount - a.amount)
        .map((color) => color.realColor)
      void save(this.bot)
    }

    this.$colors.style.height = `${LINE_HEIGHT * this.colors.length}px`

    for (let index = 0; index < this.colors.length; index++) {
      const drawColor = this.colors[index]!
      if (!this.drawTransparentPixels && drawColor === 0) continue
      const css = (color: number) =>
        color === 0
          ? `repeating-linear-gradient(32deg, #ccc 0 8px, transparent 8px 16px)`
          : colorToCSS(color)
      const colorStat = this.colorsStat.get(drawColor)!
      const $button = document.createElement('button')
      // If dark make text white
      // L* runs 0..100
      if (COLORS[drawColor]![0] < 60) addClass($button, 'dark')
      $button.title = 'Drag to reorder. Click to disable.'
      $button.style.top = `${index * LINE_HEIGHT}px`
      if (this.disabledColors.has(drawColor)) {
        const $warning = document.createElement('div')
        $warning.innerText = '❌'
        $warning.title = 'Disabled and will be skipped.'
        $button.appendChild($warning)
      }
      switch (this.unownedColorStrategy) {
        case UnownedColorStrategy.SUBSTITUTE:
          $button.style.background = css(colorStat.color)
          if (colorStat.color !== colorStat.realColor) {
            const $warning = document.createElement('button')
            $warning.style.backgroundColor = css(colorStat.realColor)
            $warning.title = 'This is the best color. Click to buy.'
            $warning.addEventListener('click', async () => {
              await this.bot.updateColorsData() // Will open colors to click
              document.getElementById('color-' + colorStat.realColor)?.click()
            })
            $button.appendChild($warning)
          }
          break
        case UnownedColorStrategy.BUY:
          $button.style.background = css(colorStat.realColor)
          if (this.bot.unavailableColors.has(colorStat.realColor)) {
            const $warning = document.createElement('div')
            $warning.innerText = '⌛'
            $warning.title = 'This color be automatically bought.'
            $button.appendChild($warning)
          }
          break
        case UnownedColorStrategy.SKIP:
          $button.style.background = css(colorStat.realColor)
          if (this.bot.unavailableColors.has(colorStat.realColor)) {
            const $warning = document.createElement('div')
            $warning.innerText = '⏩'
            $warning.title = 'Unowned colors will be skipped.'
            $button.appendChild($warning)
          }
          break
      }
      const $percent = document.createElement('span')
      addClass($percent, 'percent')
      const donePixels = colorStat.amount - colorStat.left
      const donePercent = donePixels / colorStat.amount
      const share = colorStat.amount / pixelsSum
      $percent.innerText = `${donePixels}/${colorStat.amount}px ${formatPercent(donePercent)} (${formatPercent(share)})`
      $percent.title = 'Pixels drawn / total, drawn % (% of the image)'
      $button.appendChild($percent)
      this.$colors.append($button)

      let dragging = false

      // Dragging. Both document listeners live only for one gesture
      const startDrag = (startEvent: MouseEvent) => {
        addClass($button, 'dragging')
        // A gesture that ends where it started is a click, not a leftover drag
        dragging = false
        let newIndex = index
        const mouseMoveHandler = (event: MouseEvent) => {
          newIndex = Math.min(
            this.colors.length - 1,
            Math.max(
              0,
              Math.round(
                index + (event.clientY - startEvent.clientY) / LINE_HEIGHT,
              ),
            ),
          )
          if (newIndex !== index) dragging = true
          let childIndex = 0
          for (const $child of this.$colors.children as Iterable<HTMLElement>) {
            if ($child === $button) continue
            if (childIndex === newIndex) childIndex++
            $child.style.top = `${LINE_HEIGHT * childIndex}px`
            childIndex++
          }
          $button.style.top = `${LINE_HEIGHT * newIndex}px`
        }
        document.addEventListener('mousemove', mouseMoveHandler, {
          passive: true,
        })
        document.addEventListener(
          'mouseup',
          () => {
            removeClass($button, 'dragging')
            document.removeEventListener('mousemove', mouseMoveHandler)
            if (newIndex === index) return
            const colors = [...this.colors]
            colors.splice(newIndex, 0, ...colors.splice(index, 1))
            setTimeout(() => {
              void this.update({ colors })
            }, 200)
          },
          { once: true, passive: true },
        )
      }
      $button.addEventListener('mousedown', startDrag)
      $button.addEventListener('click', (event) => {
        event.stopPropagation()
        if (dragging) return
        const disabledColors = new Set(this.disabledColors)
        if (disabledColors.has(drawColor)) disabledColors.delete(drawColor)
        else disabledColors.add(drawColor)
        toggleClass($button, 'color-disabled')
        void this.update({ disabledColors })
      })
    }
  }
}
