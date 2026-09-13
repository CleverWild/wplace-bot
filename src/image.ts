import { promisifyEventSource, removeFromArray } from '@softsky/utils'

import { Base } from './base'
import { WPlaceBot } from './bot'
import { type ColorMetric, COLORS, COLORS_RGB, colorToCSS } from './colors'
import { type ImageChanges, ImageController } from './image/controller'
import {
  createImageSettings,
  type ImageSettings,
  type PixelColorStat,
  UnownedColorStrategy,
} from './image/model'
// @ts-ignore
import html from './image.html' with { type: 'text' }
import {
  addClass,
  containsClass,
  obfucsateHTML,
  querySelector,
  querySelectorAll,
  removeClass,
  toggleClass,
} from './obfuscator'
import {
  type FillDirection,
  type ImageStrategy,
  RegionOrder,
  sortColorsByAmount,
} from './ordering'
import {
  type LoadedImage,
  SAVE_VERSION,
  type SavedImage,
} from './persistence/schema'
import { type WorkerPixelsResponse } from './processing/protocol'
import { save } from './save'
import { estimateEtaMinutes, formatEta, formatPercent } from './utils'
import { workerPixels } from './worker-client'
import { WorldPosition } from './world-position'
import { type SiteTemplateData, toWplaceFile } from './wplace-file'

export type DrawTask = {
  position: WorldPosition
  color: number
}

export type ImageColorSetting = {
  color: number
  disabled?: boolean
}

/** A worker result with the size it was calculated for */
type Calculation = {
  result: WorkerPixelsResponse
  width: number
  height: number
}

/**
 * Time left to paint `remaining` pixels, counting stored and regenerated
 * charges, and the ones droplets pay for when the bot is set to buy them
 */
export function etaText(bot: WPlaceBot, remaining: number): string {
  const cooldownMs = bot.me?.charges.cooldownMs ?? 30000
  const minutes = estimateEtaMinutes(
    remaining,
    bot.me?.charges.count ?? 0,
    bot.me?.charges.max ?? 0,
    cooldownMs,
    bot.lastMeAt === undefined ? 0 : Date.now() - bot.lastMeAt,
    bot.spendsOnCharges ? (bot.me?.droplets ?? 0) : undefined,
    bot.colorsToBuy().length,
  )
  return formatEta(minutes)
}

function encodeDataUrl(canvas: OffscreenCanvas) {
  return canvas.convertToBlob({ type: 'image/webp', quality: 1 }).then(
    (blob) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          resolve(reader.result as string)
        }
        reader.onerror = reject
        reader.readAsDataURL(blob)
      }),
  )
}

export class BotImage extends Base {
  public static async fromJSON(
    bot: WPlaceBot,
    data: LoadedImage,
    progress?: (p: number) => void,
  ) {
    const image = new Image()
    const objectUrl = data.url.startsWith('http')
      ? URL.createObjectURL(
          await fetch(data.url, { cache: 'no-store' }).then((x) => x.blob()),
        )
      : undefined
    const canvas = await (async () => {
      try {
        image.src = objectUrl ?? data.url
        await promisifyEventSource(image, ['load'], ['error'])
        const canvas = new OffscreenCanvas(
          image.naturalWidth,
          image.naturalHeight,
        )
        const ctx = canvas.getContext('2d')!
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(image, 0, 0)
        return canvas
      } finally {
        if (objectUrl) URL.revokeObjectURL(objectUrl)
      }
    })()
    const botImage = new BotImage(bot, canvas, {
      ...data,
      disabledColors: data.disabledColors && new Set(data.disabledColors),
      position: data.position && WorldPosition.fromJSON(bot, data.position),
    })
    await botImage.updatePixels(progress)
    return botImage
  }

  public pixels = new Uint8Array(0)
  public readonly resolution: number
  public colorsStat = new Map<number, PixelColorStat>()

  /** Top-left corner of image */
  public readonly position: WorldPosition

  /** Settings are read through the controller and changed with `update()` */
  protected readonly controller: ImageController<Calculation>

  /**
   * Drawn height. An unset height setting means "follow the source aspect
   * ratio", so an image that was never stretched behaves exactly as before.
   */
  public get height() {
    return this.controller.settings.height ?? (this.width / this.resolution) | 0
  }

  /** Both switches have to be on: ours and, for site templates, the site's */
  public get visible() {
    return !this.disabled && !this.siteDisabled
  }

  // Read-only on purpose: every change goes through `update()` and its effects
  public get width() {
    return this.controller.settings.width
  }
  public get brightness() {
    return this.controller.settings.brightness
  }
  public get colorMetric() {
    return this.controller.settings.colorMetric
  }
  public get strategy() {
    return this.controller.settings.strategy
  }
  public get opacity() {
    return this.controller.settings.opacity
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
  public get lock() {
    return this.controller.settings.lock
  }
  public get disabled() {
    return this.controller.settings.disabled
  }
  public get name() {
    return this.controller.settings.name
  }
  public get unownedColorStrategy() {
    return this.controller.settings.unownedColorStrategy
  }
  public get wplaceId() {
    return this.controller.settings.wplaceId
  }
  public get siteDisabled() {
    return this.controller.settings.siteDisabled
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

  /** Pixels to draw */
  public tasks = new Uint32Array(0)

  /** Moving/resizing image */
  protected moveInfo?: {
    globalX?: number
    globalY?: number
    width?: number
    height?: number
    clientX: number
    clientY: number
  }

  protected imageData: Uint8ClampedArray

  /** The source never changes, so it is encoded once instead of on every save */
  protected encodedSource?: Promise<string>

  public readonly element = document.createElement('div')
  public readonly $canvas!: HTMLCanvasElement
  protected readonly context
  protected readonly $brightness!: HTMLInputElement
  protected readonly $colors!: HTMLDivElement
  protected readonly $delete!: HTMLButtonElement
  protected readonly $drawColorsInOrder!: HTMLInputElement
  protected readonly $drawTransparent!: HTMLInputElement
  protected readonly $export!: HTMLDivElement
  protected readonly $lock!: HTMLButtonElement
  protected readonly $opacity!: HTMLInputElement
  protected readonly $progressLine!: HTMLDivElement
  protected readonly $progressText!: HTMLSpanElement
  protected readonly $resetSize!: HTMLButtonElement
  protected readonly $resetAspect!: HTMLButtonElement
  protected readonly $resetSizeSpan!: HTMLSpanElement
  protected readonly $settings!: HTMLDivElement
  protected readonly $strategy!: HTMLSelectElement
  protected readonly $exportDialog!: HTMLDialogElement
  protected readonly $colorMetric!: HTMLSelectElement
  protected readonly $topbar!: HTMLDivElement
  protected readonly $wrapper!: HTMLDivElement
  protected readonly $name!: HTMLInputElement
  protected readonly $unownedColorStrategyLabel!: HTMLLabelElement
  protected readonly $unownedColorStrategy!: HTMLSelectElement
  protected readonly $outlineFirst!: HTMLInputElement
  protected readonly $regionOrderLabel!: HTMLLabelElement
  protected readonly $regionOrder!: HTMLSelectElement
  protected readonly $fillDirectionLabel!: HTMLLabelElement
  protected readonly $fillDirection!: HTMLSelectElement
  protected readonly $sortColorsDesc!: HTMLButtonElement
  protected readonly $sortColorsAsc!: HTMLButtonElement
  protected readonly $openSettings!: HTMLButtonElement
  protected readonly $dialog!: HTMLDialogElement

  public constructor(
    protected bot: WPlaceBot,
    public readonly image: OffscreenCanvas,
    {
      position,
      ...overrides
    }: Partial<ImageSettings> & {
      position?: WorldPosition
    } = {},
  ) {
    super()
    this.position =
      position ?? WorldPosition.fromScreenPosition(bot, { x: 256, y: 32 })
    this.controller = new ImageController(
      createImageSettings({
        width: image.width,
        name: `${image.width}x${image.height}`,
        ...overrides,
      }),
      this.position,
      {
        calculate: (progress) => this.calculate(progress),
        apply: (calculation, progress) => {
          this.applyCalculation(calculation, progress)
        },
        render: (effect) => {
          this.updateUI()
          if (effect === 'colors') this.updateColors()
        },
        save: () => save(this.bot),
      },
    )
    this.bot.images.push(this)
    this.resolution = image.width / image.height
    this.imageData = this.image
      .getContext('2d')!
      .getImageData(0, 0, image.width, image.height).data

    this.element.innerHTML = obfucsateHTML(html)
    addClass(this.element, 'image')
    document.body.append(this.element)

    this.populateElementsWithSelector(this.element, {
      $brightness: '.brightness',
      $colors: '.colors',
      $delete: '.delete',
      $drawColorsInOrder: '.draw-colors-in-order',
      $drawTransparent: '.draw-transparent',
      $export: '.export',
      $lock: '.lock',
      $opacity: '.opacity',
      $progressLine: '.progress div',
      $progressText: '.progress span',
      $resetSize: '.reset-size',
      $resetAspect: '.reset-aspect',
      $settings: '.form',
      $strategy: '.strategy',
      $exportDialog: '.export-dialog',
      $colorMetric: '.color-metric',
      $topbar: '.topbar',
      $wrapper: '.wrapper',
      $name: '.name',
      $unownedColorStrategyLabel: '.unowned-color-strategy',
      $outlineFirst: '.outline-first',
      $regionOrderLabel: '.region-order',
      $fillDirectionLabel: '.fill-direction',
      $sortColorsDesc: '.sort-colors-desc',
      $sortColorsAsc: '.sort-colors-asc',
      $openSettings: '.open-settings',
      $dialog: 'dialog',
      $canvas: 'canvas',
    })
    this.context = this.$canvas.getContext('2d')!
    this.$unownedColorStrategy =
      this.$unownedColorStrategyLabel.querySelector<HTMLSelectElement>(
        'select',
      )!
    this.$regionOrder =
      this.$regionOrderLabel.querySelector<HTMLSelectElement>('select')!
    this.$fillDirection =
      this.$fillDirectionLabel.querySelector<HTMLSelectElement>('select')!
    this.$resetSizeSpan =
      this.$resetSize.querySelector<HTMLSpanElement>('span')!

    this.$openSettings.addEventListener('click', () => {
      this.$dialog.showModal()
    })
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
    this.$colorMetric.addEventListener('change', () => {
      void this.update({
        colorMetric: this.$colorMetric.value as ColorMetric,
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

    this.$opacity.addEventListener('input', () => {
      void this.update({ opacity: this.$opacity.valueAsNumber })
    })

    let brightnessTimeout: ReturnType<typeof setTimeout> | undefined
    this.$brightness.addEventListener('change', () => {
      clearTimeout(brightnessTimeout)
      brightnessTimeout = setTimeout(() => {
        void this.update({ brightness: this.$brightness.valueAsNumber })
      }, 1000)
    })
    this.runOnDestroy.push(() => {
      clearTimeout(brightnessTimeout)
    })

    this.$resetSize.addEventListener('click', () => {
      void this.update({ width: this.image.width, height: undefined })
    })
    // Restore the source aspect ratio, keeping the current width
    this.$resetAspect.addEventListener('click', () => {
      void this.update({ height: undefined })
    })
    this.$drawTransparent.addEventListener('click', () => {
      void this.update({
        drawTransparentPixels: this.$drawTransparent.checked,
      })
    })
    this.$drawColorsInOrder.addEventListener('click', () => {
      void this.update({ drawColorsInOrder: this.$drawColorsInOrder.checked })
    })
    this.$lock.addEventListener('click', () => {
      void this.update({ lock: !this.lock })
    })

    this.$delete.addEventListener('click', this.destroy.bind(this))

    // Export button opens a small format picker
    this.$export.addEventListener('click', () => {
      this.$exportDialog.showModal()
    })
    this.$exportDialog.addEventListener('click', (event) => {
      if (event.target === this.$exportDialog) this.$exportDialog.close()
    })
    for (const [selector, format] of [
      ['.export-wbot', 'wbot'],
      ['.export-wplace', 'wplace'],
      ['.export-image', 'image'],
    ] as const)
      querySelector<HTMLButtonElement>(
        this.$exportDialog,
        selector,
      )!.addEventListener('click', () => this.exportAs(format))

    this.$name.addEventListener('change', () => {
      void this.update({ name: this.$name.value })
    })

    this.bot.fixSpaceInInput(this.$name)

    // Anything the site owns is read-only here, or the next sync would just
    // undo the edit
    if (this.wplaceId) {
      addClass(this.element, 'managed')
      this.$name.readOnly = true
    } else this.$canvas.addEventListener('mousedown', this.moveStart.bind(this))

    // Forward wheel event to scroll through image
    this.$wrapper.addEventListener('wheel', (event) =>
      document
        .querySelector<HTMLDivElement>('.maplibregl-canvas')!
        .dispatchEvent(
          new WheelEvent('wheel', {
            bubbles: true,
            deltaX: event.deltaX,
            deltaY: event.deltaY,
            deltaZ: event.deltaZ,
            clientX: event.clientX,
            clientY: event.clientY,
          }),
        ),
    )
    this.registerEvent(document, 'mouseup', this.moveStop.bind(this))
    this.registerEvent(document, 'mousemove', this.move.bind(this))

    // Resize
    if (!this.wplaceId)
      for (const $resize of querySelectorAll<HTMLDivElement>(
        this.element,
        '.resize',
      ))
        $resize.addEventListener('mousedown', this.resizeStart.bind(this))
  }

  /** Change settings. Recalculates, redraws and saves only what they need */
  public async update(changes: ImageChanges) {
    const effect = await this.controller.update(changes)
    if (effect !== 'none' && 'name' in changes) this.bot.widget.update()
  }

  public async toJSON(): Promise<SavedImage> {
    return {
      url: await this.sourceUrl(),
      width: this.width,
      height: this.controller.settings.height,
      brightness: this.brightness,
      colorMetric: this.colorMetric,
      position: this.position.toJSON(),
      strategy: this.strategy,
      opacity: this.opacity,
      drawTransparentPixels: this.drawTransparentPixels,
      drawColorsInOrder: this.drawColorsInOrder,
      colors: this.colors,
      disabledColors: Array.from(this.disabledColors),
      lock: this.lock,
      disabled: this.disabled,
      name: this.name,
      unownedColorStrategy: this.unownedColorStrategy,
      wplaceId: this.wplaceId,
      siteDisabled: this.siteDisabled,
      regionOrder: this.regionOrder,
      fillDirection: this.fillDirection,
      outlineFirst: this.outlineFirst,
      version: SAVE_VERSION,
    }
  }

  /**
   * Apply the site's version of this template.
   * Returns whether anything actually changed.
   */
  public async applySiteTemplate(data: SiteTemplateData) {
    const [globalX, globalY] = data.position
    const changes: ImageChanges = {
      globalX,
      globalY,
      width: data.width,
      siteDisabled: data.disabled,
    }
    if (this.height !== data.height) changes.height = data.height
    if (data.name !== undefined) changes.name = data.name
    if (data.lock !== undefined) changes.lock = data.lock
    // The caller saves once for the whole sync
    const effect = await this.controller.update(changes, { save: false })
    return effect !== 'none'
  }

  /** Calculates everything we need to do. Very expensive task! */
  public updatePixels(progress?: (p: number) => void) {
    return this.controller.recompute(progress)
  }

  protected async calculate(progress?: (p: number) => void) {
    const { width, height } = this
    const result = await workerPixels(
      {
        data: this.imageData,
        brightness: this.brightness,
        colorMetric: this.colorMetric,
        colors: this.colors,
        disabledColors: this.disabledColors,
        drawColorsInOrder: this.drawColorsInOrder,
        drawTransparentPixels: this.drawTransparentPixels,
        globalX: this.position.globalX,
        globalY: this.position.globalY,
        height,
        width,
        nativeHeight: this.image.height,
        nativeWidth: this.image.width,
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
    return { result, width, height }
  }

  protected applyCalculation(
    { result, width, height }: Calculation,
    progress?: (p: number) => void,
  ) {
    this.colorsStat = result.colorStat
    this.tasks = this.visible ? result.taskPositions : new Uint32Array(0)
    this.pixels = result.pixels
    this.$canvas.width = width
    this.$canvas.height = height
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

  protected sourceUrl(): Promise<string> {
    if (!this.encodedSource) {
      const encoding = encodeDataUrl(this.image)
      this.encodedSource = encoding
      encoding.catch(() => {
        if (this.encodedSource === encoding) this.encodedSource = undefined
      })
    }
    return this.encodedSource
  }

  /** Update image (NOT PIXELS) */
  public updateUI() {
    const { x, y } = this.position.toScreenPosition()
    this.element.style.transform = `translate(${x}px, ${y}px)`
    this.element.style.width = `${this.position.pixelSize * this.width}px`
    // Height is free-form, so drive it too; otherwise a vertical resize would
    // only preview on the next redraw (mouseup) instead of live
    this.$canvas.style.height = `${this.position.pixelSize * this.height}px`
    this.$canvas.style.opacity = `${this.opacity}%`
    // A switched-off image takes its topbar with it instead of just dimming
    if (this.visible) removeClass(this.element, 'hidden')
    else addClass(this.element, 'hidden')

    this.$resetSizeSpan.textContent = `${this.width}x${this.height}`
    this.$brightness.valueAsNumber = this.brightness
    this.$strategy.value = this.strategy
    this.$colorMetric.value = this.colorMetric
    this.$opacity.valueAsNumber = this.opacity
    this.$opacity.style.setProperty('--val', this.opacity + '%')
    this.$drawTransparent.checked = this.drawTransparentPixels
    this.$drawColorsInOrder.checked = this.drawColorsInOrder
    this.$outlineFirst.checked = this.outlineFirst
    this.$regionOrder.value = this.regionOrder
    this.$fillDirection.value = this.fillDirection
    // How a blob is filled means nothing while blobs are not a thing
    if (this.regionOrder === RegionOrder.OFF)
      addClass(this.$fillDirectionLabel, 'hidden')
    else removeClass(this.$fillDirectionLabel, 'hidden')
    this.$name.value = this.name
    this.updateProgress()
    if (this.lock) addClass(this.$wrapper, 'no-pointer-events')
    else removeClass(this.$wrapper, 'no-pointer-events')
    this.$lock.textContent = this.lock ? '🔒' : '🔓'
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

  public updateProgress() {
    const maxTasks = this.countedPixels
    const doneTasks = maxTasks - this.tasks.length / 2
    const percent = maxTasks ? doneTasks / maxTasks : 0
    this.$progressText.textContent = `${doneTasks}/${maxTasks} ${formatPercent(percent)} ETA: ${etaText(this.bot, this.tasks.length / 2)}`
    this.$progressLine.style.transform = `scaleX(${percent})`
  }

  /** Removes image */
  public override destroy() {
    this.controller.dispose()
    super.destroy()
    this.element.remove()
    removeFromArray(this.bot.images, this)
    this.bot.widget.update()
    void save(this.bot)
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
            $button.removeEventListener('mousedown', startDrag)
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

  /** Called on move image start */
  protected moveStart(event: MouseEvent) {
    if (!this.lock)
      this.moveInfo = {
        globalX: this.position.globalX,
        globalY: this.position.globalY,
        clientX: event.clientX,
        clientY: event.clientY,
      }
  }

  /** Called on move image stop */
  protected async moveStop() {
    if (this.moveInfo) {
      this.moveInfo = undefined
      await this.updatePixels()
    }
  }

  /** Resize/move image */
  protected move(event: MouseEvent) {
    if (!this.moveInfo) return
    const deltaX = Math.round(
      (event.clientX - this.moveInfo.clientX) / this.position.pixelSize,
    )
    const deltaY = Math.round(
      (event.clientY - this.moveInfo.clientY) / this.position.pixelSize,
    )
    const changes: ImageChanges = {}
    if (this.moveInfo.globalX !== undefined) {
      changes.globalX = deltaX + this.moveInfo.globalX
      if (this.moveInfo.width !== undefined)
        changes.width = Math.max(1, this.moveInfo.width - deltaX)
    } else if (this.moveInfo.width !== undefined)
      changes.width = Math.max(1, deltaX + this.moveInfo.width)
    if (this.moveInfo.globalY !== undefined) {
      changes.globalY = deltaY + this.moveInfo.globalY
      if (this.moveInfo.height !== undefined)
        changes.height = Math.max(1, this.moveInfo.height - deltaY)
    } else if (this.moveInfo.height !== undefined)
      changes.height = Math.max(1, deltaY + this.moveInfo.height)
    void this.controller.preview(changes)
  }

  /** Resize start */
  protected resizeStart(event: MouseEvent) {
    this.moveInfo = {
      clientX: event.clientX,
      clientY: event.clientY,
    }
    const $resize = event.target! as HTMLDivElement
    if (containsClass($resize, 'n')) {
      this.moveInfo.height = this.height
      this.moveInfo.globalY = this.position.globalY
    }
    if (containsClass($resize, 'e')) this.moveInfo.width = this.width
    if (containsClass($resize, 's')) this.moveInfo.height = this.height
    if (containsClass($resize, 'w')) {
      this.moveInfo.width = this.width
      this.moveInfo.globalX = this.position.globalX
    }
  }

  /** Export the image in the chosen format */
  protected async exportAs(format: 'wbot' | 'wplace' | 'image') {
    this.$exportDialog.close()
    const a = document.createElement('a')
    document.body.append(a)
    const download = (href: string, name: string) => {
      a.href = href
      a.download = name
      a.click()
      URL.revokeObjectURL(href)
    }
    const json = (data: unknown) =>
      URL.createObjectURL(
        new Blob([JSON.stringify(data)], { type: 'application/json' }),
      )
    switch (format) {
      case 'wplace': {
        download(
          json(
            toWplaceFile(
              {
                dataUrl: this.$canvas.toDataURL('image/png'),
                globalX: this.position.globalX,
                globalY: this.position.globalY,
                width: this.width,
                height: this.height,
                name: this.name,
                opacity: this.opacity,
                lock: this.lock,
                visible: this.visible,
              },
              this.bot.images.indexOf(this),
            ),
          ),
          `${this.name}.wplace`,
        )
        break
      }
      case 'image': {
        download(this.$canvas.toDataURL('image/webp', 1), `${this.name}.webp`)
        break
      }
      default: {
        download(json(await this.toJSON()), `${this.name}.wbot`)
      }
    }
    a.remove()
  }
}
