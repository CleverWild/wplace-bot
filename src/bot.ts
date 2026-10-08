import { wait } from '@softsky/utils'

import { BotStrategy, DropletStrategy } from './drawing/policy'
import { WPlaceBotError } from './errors'
import {
  cashbackCharges,
  countCashbackTasks,
  coveredTiles,
  FLAG_CASHBACK_PIXELS,
  ownsFlag,
  tileFromKey,
  tileKey,
} from './flags'
import { BotImage } from './image'
import { UnownedColorStrategy } from './image/model'
import { findMap, type WplaceMap } from './map'
import { obfuscateCSS } from './obfuscator'
import {
  type LoadedBot,
  SAVE_VERSION,
  type SavedBot,
  type SavedImage,
} from './persistence/schema'
import { deleteAllData } from './persistence/store'
import { loadSave, save } from './save'
import { planTemplateSync, type SiteTemplate } from './site/template-data'
import { SiteTemplates } from './site/templates'
// @ts-ignore
import css from './style.css' with { type: 'text' }
import {
  CHARGES_PER_PACK,
  CHARGES_PER_PACK_WITH_PAYBACK,
  formatEta,
  DROPLETS_PER_COLOR,
  DROPLETS_PER_PACK,
  DROPLETS_PER_PIXEL,
} from './utils'
import { Widget } from './widget'
import { workerClearMapCache } from './worker-client'
import {
  type Position,
  WorldPosition,
  zoomForPixelSize,
} from './world-position'

export type Me = {
  allianceId: number
  allianceRole: string
  banned: false
  charges: { cooldownMs: number; count: number; max: number }
  country: string
  discord: string
  discordId: string
  droplets: number
  equippedFlag: number
  experiments: unknown
  extraColorsBitmap: number
  favoriteLocations: {
    id: number
    name: string
    latitude: number
    longitude: number
  }[]
  flagsBitmap: string
  id: number
  isCustomer: boolean
  level: number
  maxFavoriteLocations: number
  name: string
  needsPhoneVerification: boolean
  picture: string
  pixelsPainted: number
  showLastPixel: boolean
  suspensionReason: string
  timeoutUntil: string
}

/**
 * Main class. Initializes everything.
 * Used to interact with wplace
 * */
export class WPlaceBot {
  /** Title in widget */
  public title = ''

  /** Colors that can be bought */
  public unavailableColors = new Set<number>()

  /** Keys to  */
  public mapsCacheKeys = new Uint32Array(0)

  /** Cache of parsed images of world map */
  public mapsCache = new Uint8Array(0)

  /** Data about account */
  public me?: Me

  /** Timestamp of the last successful /me response */
  public lastMeAt?: number

  /** wplace's own maplibre map. Set during init, before any image loads */
  public map!: WplaceMap

  /** Strategy how to distribute draw calls between images */
  public strategy = BotStrategy.SEQUENTIAL

  /** What the droplet balance is spent on */
  public dropletStrategy = DropletStrategy.COLORS_FIRST

  /** Whether droplets go into paint charges, and so pay part of the ETA back */
  public get spendsOnCharges() {
    return this.dropletStrategy !== DropletStrategy.COLORS
  }

  /** Templates of wplace's own manager that are drawn, in drawing order */
  public images: BotImage[] = []

  /** Reader of wplace's template manager, once its client was recognised */
  public templates?: SiteTemplates

  /** Settings of templates that are gone from the site, kept to restore them */
  protected dormant = new Map<string, SavedImage>()

  /** Older images with no wplace template, left out of drawing by the save migration */
  public archivedImageCount = 0

  /** Set when a template changed under a running draw; its queue is stale */
  protected drawInvalidated = false

  protected templateSignature = ''
  protected syncChain: Promise<unknown> = Promise.resolve()
  protected syncTimer?: ReturnType<typeof setTimeout>

  /** Country of every tile seen so far. It never changes, so it is saved */
  public tileCountries = new Map<number, number>()

  /** Tiles whose country is being asked for right now */
  protected pendingTiles = new Set<number>()

  /** `cashbackTasks` per task array, dropped when flags or tiles change */
  protected cashbackCache = new WeakMap<
    Uint32Array,
    { stamp: string; count: number }
  >()

  /** fetch before the interceptor wrapped it */
  protected originalFetch = globalThis.fetch.bind(globalThis)

  /** Autodraw interval */
  public autoDrawInterval?: ReturnType<typeof setInterval>

  /** True while draw() walks this.images */
  protected drawing = false

  public widgetOpen = true
  public widget: Widget

  /** Used to wait for pixel data on marker set */
  protected markerPixelPositionResolvers: ((
    position: WorldPosition,
  ) => unknown)[] = []

  /** Last color drawn */
  protected lastColor?: number

  /** Answers the one batched paint request the running draw() sent */
  protected paintResolver?: (painted: number | undefined) => void

  public constructor(save?: LoadedBot) {
    // Preinit save data before page has loaded
    if (save) {
      this.strategy = save.strategy
      this.dropletStrategy = save.dropletStrategy
      this.title = save.title
      this.widgetOpen = save.widgetOpen
      this.tileCountries = new Map(save.tileCountries)
      this.archivedImageCount = save.archivedImageCount ?? 0
      for (const image of save.images) this.dormant.set(image.wplaceId, image)
    } else {
      this.title = 'WPlace-bot'
    }

    this.widget = new Widget(this)

    this.registerFetchInterceptor()

    // Embed styles
    const style = document.createElement('style')
    style.textContent = obfuscateCSS(css as string)
    document.head.append(style)

    void this.widget
      .run('Initializing', async (progress) => {
        // Waiting for all of website to load
        await this.waitForElement('.avatar.center-absolute.absolute')
        progress(0.01)
        await this.waitForElement(
          '.btn.btn-primary.btn-lg.relative.z-30 canvas',
        )
        progress(0.02)
        await this.waitForElement('.maplibregl-canvas-container')
        progress(0.03)
        this.map = await findMap(this)
        await wait(500) // Sometimes wplace UI becomes bugged if interacted too early
        progress(0.04)
        await this.updateColorsData()
        progress(0.05)
        // Pick up the templates placed in wplace's own manager
        const templateError = await this.syncTemplates((p) => {
          progress(0.05 + p * 0.95)
        })
        this.watchTemplates()
        // Unblock buttons
        this.widget.setDisabled('draw', false)
        this.widget.setDisabled('auto-draw', false)
        // this.widget.setDisabled('pumpkin-hunt', false)
        return templateError
      })
      .then((templateError) => {
        if (templateError) this.widget.status = `❌ ${templateError}`
      })
      .catch(async () => {
        if (
          window.confirm(
            "WPlace-bot couldn't load!\nDo you want to CLEAR ALL DATA to fix it?\n\nHint for next time: Create backup's with 📤 button.",
          )
        ) {
          try {
            const a = document.createElement('a')
            document.body.append(a)
            a.href = URL.createObjectURL(
              new Blob([JSON.stringify(await loadSave())], {
                type: 'application/json',
              }),
            )
            a.download = `Wplace-Bot-Broken-Save.txt`
            a.click()
            window.alert(
              'Wplace-Bot-Broken-Save.txt is your broken save. If you ACTUALLY need data from this save, create issue on https://github.com/CleverWild/wplace-bot/issues\n\nDeveloper will try to fix your save. Be vary that github issues are public, and save file contains your images and their positions in world.',
            )
            await deleteAllData()
          } catch {
            await deleteAllData().catch(() => undefined)
          } finally {
            document.location.reload()
          }
        }
      })
  }

  /*
   * Paints every visible image until charges run out.
   *
   * `submit` says whether the run hands the queue to wplace itself. Auto-Draw
   * does, because the answer to that one request is where it learns what the
   * run cost and whether droplets are worth spending. The Draw button does
   * not: it only stages the pixels and leaves the paint button to the user.
   *
   * Buying charges restarts the run so the new balance is read from `/me`, and
   * `dropletsBeforePurchase` is what stops that going round forever: a purchase
   * that did not actually take the money leaves the balance where it was, and
   * that is the failure the loop ends on.
   */
  public draw(
    submit = false,
    dropletsBeforePurchase = Infinity,
  ): Promise<void> {
    this.widget.setDisabled('draw', true)
    this.widget.status = ''
    // Clear maps cache to refetch pixels
    const $canvas =
      document.querySelector<HTMLDivElement>('.maplibregl-canvas')!
    const prevent = (event: MouseEvent | WheelEvent) => {
      if (!event.shiftKey) event.stopPropagation()
    }
    return this.widget.run(
      'Drawing',
      async (progress) => {
        const syncError = await this.syncTemplates()
        if (syncError) throw new WPlaceBotError(`❌ ${syncError}`, this)
        const firstImage = this.images[0]
        if (!firstImage) return
        this.drawing = true
        this.drawInvalidated = false

        // Stop mouse messing with drawing by capturing event
        globalThis.addEventListener('mousemove', prevent, true)
        $canvas.addEventListener('wheel', prevent, true)

        this.zoomIn(4)
        await this.widget.run('Loading', (progress) =>
          Promise.all([
            this.updateColorsData().then(async () => {
              workerClearMapCache()
              await wait(100)
              const batchSize = 1 / this.images.length
              for (let index = 0; index < this.images.length; index++)
                await this.images[index]!.updatePixels((p) => {
                  progress(index * batchSize + p * batchSize)
                })
            }),
            fetch('https://backend.wplace.live/me', {
              credentials: 'include',
            })
              .then((x) => x.json())
              .then((x) => {
                this.me = x as Me
              }),
            this.fetchTileCountries(this.images),
          ]),
        )

        const initialCharges = Math.floor(this.me!.charges.count)
        let charges = initialCharges

        // Calculate tasks and colors to buy
        let tasksLength = 0
        let cashbackLength = 0
        for (let index = 0; index < this.images.length; index++) {
          const image = this.images[index]!
          if (!image.visible) continue
          tasksLength += image.tasks.length / 2
          cashbackLength += this.cashbackTasks(image)
        }
        const colorToBuy = this.colorsToBuy()[0]
        if (
          this.me!.droplets >= DROPLETS_PER_COLOR &&
          colorToBuy !== undefined
        ) {
          document.getElementById('color-' + colorToBuy)?.click()
          await wait(500)
          document
            .querySelector<HTMLButtonElement>(
              '.modal-box .flex.w-max.flex-col button',
            )
            ?.click()
          await wait(1000)
          await this.closeAll()
          await wait(500)
          // Retry after color bought
          return this.draw(submit)
        }
        // Charges are only worth buying once the colors this run needs are paid for
        const wantsCharges =
          this.dropletStrategy === DropletStrategy.COLORS_FIRST &&
          colorToBuy === undefined
        // A balance that did not drop means the last purchase never happened
        if (wantsCharges && this.me!.droplets < dropletsBeforePurchase) {
          const packs = Math.min(
            // Each pack pays for part of the next one, so fewer are needed
            Math.ceil(
              (tasksLength -
                cashbackLength / FLAG_CASHBACK_PIXELS -
                initialCharges) /
                CHARGES_PER_PACK_WITH_PAYBACK,
            ),
            Math.floor(this.me!.droplets / DROPLETS_PER_PACK),
            // Charges over the account maximum are bought for nothing
            Math.floor(
              (this.me!.charges.max - initialCharges) / CHARGES_PER_PACK,
            ),
          )
          // Retry after charges bought, so /me reports the new balance
          const droplets = this.me!.droplets
          if (packs > 0 && (await this.buyChargePacks(packs)))
            return this.draw(submit, droplets)
        }
        const indexes = new Map<BotImage, number>()

        const drawTask = async (image: BotImage) => {
          // A queue calculated from an older template must not be added to
          if (this.drawInvalidated) {
            charges = 0
            return undefined
          }
          let index = indexes.get(image)
          if (index === undefined) indexes.set(image, (index = 0))
          const dIndex = index * 2
          if (dIndex === image.tasks.length) return undefined
          const worldPosition = new WorldPosition(
            this,
            image.tasks[dIndex]!,
            image.tasks[dIndex + 1]!,
          )
          const color =
            image.pixels[
              (worldPosition.globalY - image.position.globalY) * image.width +
                (worldPosition.globalX - image.position.globalX)
            ]

          if (this.lastColor !== color) {
            ;(
              document.getElementById('color-' + color) as HTMLButtonElement
            ).click()
            this.lastColor = color
          }
          const halfPixel = worldPosition.pixelSize / 2
          const position = worldPosition.toScreenPosition()
          document.documentElement.dispatchEvent(
            new MouseEvent('mousemove', {
              bubbles: true,
              clientX: position.x + halfPixel,
              clientY: position.y + halfPixel,
              shiftKey: true,
            }),
          )
          document.documentElement.dispatchEvent(
            new KeyboardEvent('keydown', {
              key: ' ',
              code: 'Space',
              keyCode: 32,
              which: 32,
              bubbles: true,
              cancelable: true,
            }),
          )
          document.documentElement.dispatchEvent(
            new KeyboardEvent('keyup', {
              key: ' ',
              code: 'Space',
              keyCode: 32,
              which: 32,
              bubbles: true,
              cancelable: true,
            }),
          )
          indexes.set(image, index + 1)
          charges--
          progress((initialCharges - charges) / initialCharges)
          await wait(1)
          return true
        }

        switch (this.strategy) {
          case BotStrategy.ALL: {
            while (charges > 0) {
              let end = true
              for (
                let imageIndex = 0;
                imageIndex < this.images.length;
                imageIndex++
              ) {
                const image = this.images[imageIndex]!
                if (!image.visible) continue
                if (await drawTask(image)) end = false
              }
              if (end) break
            }
            break
          }
          case BotStrategy.PERCENTAGE: {
            for (
              let taskIndex = 0;
              taskIndex < tasksLength && charges > 0;
              taskIndex++
            ) {
              let minPercent = 1
              let minImage: BotImage | undefined
              for (
                let imageIndex = 0;
                imageIndex < this.images.length;
                imageIndex++
              ) {
                const image = this.images[imageIndex]!
                if (!image.visible) continue
                const percent = 1 - image.tasks.length / 2 / image.countedPixels
                if (percent < minPercent) {
                  minPercent = percent
                  minImage = image
                }
              }
              if (minImage) await drawTask(minImage)
            }
            break
          }
          case BotStrategy.SEQUENTIAL: {
            for (
              let imageIndex = 0;
              imageIndex < this.images.length;
              imageIndex++
            ) {
              const image = this.images[imageIndex]!
              if (!image.visible) continue
              for (let i = 0; i < image.tasks.length / 2 && charges > 0; i++)
                await drawTask(image)
            }
          }
        }

        if (this.drawIsStale()) {
          if (this.autoDrawInterval) this.autoDraw()
          throw new WPlaceBotError(
            '⚠ A template changed during drawing. Clear the pixels already staged on the map, then draw again',
            this,
          )
        }

        // Nothing is painted until wplace's own button goes out. A run that
        // sends the queue itself learns here what it cost; one that leaves the
        // button to the user has painted nothing yet and must claim nothing
        const queued = initialCharges - charges
        const meBeforePaint = this.lastMeAt
        const painted =
          submit && queued > 0 ? await this.submitPaint(queued) : 0
        let paintedCashback = 0
        const cashbackTiles = this.cashbackTiles()
        // A batch is all-or-nothing in practice, and which pixels a short
        // answer left out is not knowable, so keep the tasks and let the next
        // run rebuild them from the map
        if (painted >= queued)
          for (const [image, value] of indexes) {
            paintedCashback += countCashbackTasks(
              image.tasks.subarray(0, value * 2),
              cashbackTiles,
            )
            image.tasks = image.tasks.subarray(value * 2)
          }

        this.widget.update()

        // Painting moves both counters, and the ETA and the wake-up time read
        // our copy of /me. wplace refetches it after some paints, so only
        // correct the numbers by hand when it did not
        if (this.lastMeAt === meBeforePaint) {
          this.me!.charges.count =
            Math.max(0, this.me!.charges.count - painted) +
            cashbackCharges(paintedCashback)
          this.me!.droplets += painted * DROPLETS_PER_PIXEL
          this.lastMeAt = Date.now()
        }

        // The bar is empty now, so the account maximum no longer caps a
        // purchase. Without this the droplets would sit unspent until the next
        // Auto-Draw, which deliberately wakes up with the bar almost full.
        // Painting something is the condition that keeps this from spinning:
        // a run that paints nothing cannot pay for the next one
        // Flag cashback lands on the bar at once, so spend it right away too.
        // Each refund is a tenth of what earned it, so this dies out quickly
        const refunded =
          cashbackCharges(paintedCashback) > 0 &&
          Math.floor(this.me!.charges.count) > 0
        if (
          painted > 0 &&
          ((wantsCharges && this.me!.droplets >= DROPLETS_PER_PACK) ||
            refunded) &&
          this.images.some((image) => image.visible && image.tasks.length > 0)
        )
          return this.draw(submit)
      },
      () => {
        this.drawing = false
        if (this.drawInvalidated) this.scheduleSync(0)
        globalThis.removeEventListener('mousemove', prevent, true)
        $canvas.removeEventListener('wheel', prevent, true)
        this.widget.setDisabled('draw', false)
      },
    )
  }

  /**
   * Hands the queued pixels to wplace and reports how many of them it painted.
   *
   * wplace only stages what the space key drops and sends the lot as one
   * `POST /paint` when its own button is clicked, so the run has to click it
   * and wait right here. Clicking it after the run tells the run nothing: the
   * charges it just spent and the droplets they earned would both stay
   * invisible, and every purchase decision reads those two numbers.
   */
  protected submitPaint(queued: number): Promise<number> {
    const PAINT_BUTTON = '.absolute.bottom-0  .btn.btn-lg.relative.btn-primary'
    const $paint = document.querySelector<HTMLButtonElement>(PAINT_BUTTON)
    // A disabled button means wplace staged none of the queue, and clicking it
    // would only buy a 15-second timeout
    if (!$paint || $paint.disabled) {
      console.warn(`wbot: no usable ${PAINT_BUTTON}, nothing was painted`)
      return Promise.resolve(0)
    }
    return new Promise<number>((resolve) => {
      // A few thousand pixels are not answered in a moment, and a request that
      // never lands must not hold the run forever
      const timeout = setTimeout(() => {
        this.paintResolver = undefined
        resolve(0)
      }, 15000)
      this.paintResolver = (painted) => {
        clearTimeout(timeout)
        // wplace's own client reads nothing off the body, so a plain OK with
        // no count in it means the whole batch went through
        resolve(painted ?? queued)
      }
      $paint.click()
    })
  }

  /**
   * How long Auto-Draw should wait before the next run.
   *
   * Waiting for a full bar wastes nothing, but waiting past what the remaining
   * tasks need wastes a whole cycle, and arriving with the bar already full
   * leaves no room under the account maximum for a purchase. So aim at exactly
   * the charges the next run will spend, less the ones droplets can cover.
   *
   * A run spends nothing until it submits the whole queue at the very end, so
   * a bar that tops out while it is still working regenerates nothing from
   * that moment on. Come back early by as long as the run takes, and the bar
   * fills up just as the run drains it.
   */
  protected msUntilNextDraw(): number {
    // What a run costs before its charges are actually spent: a flat lead-in
    // for loading, /me and zooming, plus the time to queue each pixel
    const DRAW_BASE_MS = 2000
    const DRAW_MS_PER_PIXEL = 5
    const cooldownMs = this.me?.charges.cooldownMs ?? 30000
    const maxCharges = this.me?.charges.max ?? 100
    let tasks = 0
    let cashback = 0
    for (let index = 0; index < this.images.length; index++) {
      const image = this.images[index]!
      if (!image.visible) continue
      tasks += image.tasks.length / 2
      cashback += this.cashbackTasks(image)
    }
    // Nothing left to paint: look again once the bar has filled anyway
    if (tasks === 0) return maxCharges * cooldownMs
    const buysCharges = this.spendsOnCharges && this.colorsToBuy().length === 0
    const bought = buysCharges
      ? Math.floor((this.me?.droplets ?? 0) / DROPLETS_PER_PACK) *
        CHARGES_PER_PACK
      : 0
    const painting = Math.min(tasks, maxCharges)
    const refund = (painting * cashback) / tasks / FLAG_CASHBACK_PIXELS
    const missing = painting - refund - (this.me?.charges.count ?? 0) - bought
    const lead = DRAW_BASE_MS + painting * DRAW_MS_PER_PIXEL
    // Never come back in a tight loop, even when the numbers say "now"
    return Math.max(cooldownMs, missing * cooldownMs - lead)
  }

  public autoDraw() {
    if (this.autoDrawInterval) {
      this.widget.$autoDraw.innerText = 'Auto-Draw'
      clearInterval(this.autoDrawInterval)
      this.autoDrawInterval = undefined
      return false
    }
    this.widget.$autoDraw.innerText = 'Auto-Draw is starting...'
    let errorCount = 0
    let drawTime = 0
    this.autoDrawInterval = setInterval(async () => {
      // The tick keeps coming every second while a run is still going
      if (this.drawing) {
        this.widget.$autoDraw.innerText = 'Auto-Draw is drawing...'
        return
      }
      const deltaTime = drawTime - Date.now()
      if (deltaTime > 0) {
        // Rounded up, so the countdown never sits on "0h 0m" before it fires
        this.widget.$autoDraw.innerText = `Auto-Draw in (${formatEta(Math.ceil(deltaTime / 60000))})!`
        return
      }
      try {
        // Only Auto-Draw's runs send the queue; the Draw button stages it
        await this.draw(true)
        errorCount = 0
      } catch {
        errorCount++
        if (errorCount === 4) throw new Error('Error')
      } finally {
        // One place owns the schedule, whether the run worked out or not
        drawTime = Date.now() + this.msUntilNextDraw()
      }
    }, 1000)
    return true
  }

  /** Serialize bot */
  public toJSON(): Promise<SavedBot> {
    return Promise.resolve({
      version: SAVE_VERSION,
      images: [
        ...this.images.map((image) => image.toJSON()),
        ...this.dormant.values(),
      ],
      strategy: this.strategy,
      dropletStrategy: this.dropletStrategy,
      title: this.title,
      widgetOpen: this.widgetOpen,
      tileCountries: [...this.tileCountries],
    })
  }

  /**
   * Make our images match the templates of wplace's own manager.
   * Resolves to a message when wplace's side could not be read. That is never
   * treated as "no templates": the saved settings stay as they are.
   */
  public syncTemplates(
    progress?: (p: number) => void,
  ): Promise<string | undefined> {
    const run = this.syncChain.then(() => this.runSync(progress))
    this.syncChain = run
    return run
  }

  protected async runSync(
    progress?: (p: number) => void,
  ): Promise<string | undefined> {
    let list: SiteTemplate[]
    try {
      if (!this.templates) {
        const templates = await SiteTemplates.connect()
        templates.subscribe(this.onTemplatesChanged)
        this.templates = templates
      }
      list = this.templates.list()
    } catch (error) {
      console.error(error)
      return error instanceof Error ? error.message : String(error)
    }
    const byId = new Map(list.map((template) => [template.id, template]))
    const plan = planTemplateSync(
      this.images.map((image) => image.wplaceId),
      [...this.dormant.keys()],
      list,
    )
    let changed = plan.remove.length > 0 || plan.create.length > 0
    for (const image of [...this.images]) {
      const template = byId.get(image.wplaceId)
      if (template) {
        if (await image.applyTemplate(template)) changed = true
      } else {
        // Gone from the site: stop drawing it, keep its settings for a restore
        this.dormant.set(image.wplaceId, image.toJSON())
        image.destroy()
      }
    }
    for (let index = 0; index < plan.create.length; index++) {
      const id = plan.create[index]!
      const saved = this.dormant.get(id)
      this.dormant.delete(id)
      const image = new BotImage(
        this,
        byId.get(id)!,
        saved && { ...saved, disabledColors: new Set(saved.disabledColors) },
      )
      this.images.push(image)
      await image.updatePixels((p) => {
        progress?.((index + p) / plan.create.length)
      })
    }
    this.templateSignature = list.map((template) => template.revision).join()
    if (changed) {
      this.widget.update()
      await save(this, true)
    }
    return undefined
  }

  /** Coalesces bursts of site notifications into one reconciliation */
  protected scheduleSync(delayMs = 250) {
    clearTimeout(this.syncTimer)
    this.syncTimer = setTimeout(() => {
      void this.syncTemplates().then((error) => {
        if (error && !this.drawing) this.widget.status = `❌ ${error}`
      })
    }, delayMs)
  }

  /** Read through a method so the check is not narrowed by what the run set earlier */
  protected drawIsStale() {
    return this.drawInvalidated
  }

  protected readonly onTemplatesChanged = () => {
    if (!this.drawing) this.scheduleSync()
    else if (this.drawnTemplatesChanged()) this.drawInvalidated = true
  }

  /** Whether a template the running draw works from was edited or removed */
  protected drawnTemplatesChanged() {
    try {
      const byId = new Map(
        this.templates!.list().map((template) => [template.id, template]),
      )
      return this.images.some((image) => {
        const template = byId.get(image.wplaceId)
        return template?.contentKey !== image.template.contentKey
      })
    } catch {
      return false
    }
  }

  /**
   * Follow wplace's template manager: its own change notifications, a light
   * metadata check in case one is missed, and a look when the tab comes back.
   * The bot lives as long as the page does, so none of this is ever removed
   */
  protected watchTemplates() {
    setInterval(() => {
      if (this.drawing || !this.templates) return
      try {
        const signature = this.templates
          .list()
          .map((template) => template.revision)
          .join()
        if (signature !== this.templateSignature) this.scheduleSync()
      } catch {
        // A failed read is retried by the next tick or the next notification
      }
    }, 5000)
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !this.drawing)
        this.scheduleSync(0)
    }
    document.addEventListener('visibilitychange', onVisible)
    globalThis.addEventListener('focus', onVisible)
  }

  /**
   * Colors the visible images want but the account does not own, most wanted
   * first. Only images set to buy them count
   */
  public colorsToBuy(): number[] {
    const amounts = new Map<number, number>()
    for (let index = 0; index < this.images.length; index++) {
      const image = this.images[index]!
      if (
        !image.visible ||
        image.unownedColorStrategy !== UnownedColorStrategy.BUY
      )
        continue
      for (let i = 0; i < image.colors.length; i++) {
        const color = image.colors[i]!
        if (
          image.disabledColors.has(color) ||
          !this.unavailableColors.has(color)
        )
          continue
        amounts.set(
          color,
          (amounts.get(color) ?? 0) + image.colorsStat.get(color)!.amount,
        )
      }
    }
    return [...amounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([color]) => color)
  }

  /** Read colors */
  public async updateColorsData() {
    await this.openColors()
    this.unavailableColors.clear()
    for (const $button of document.querySelectorAll<HTMLButtonElement>(
      'button.btn.relative.w-full',
    ))
      if ($button.children.length !== 0)
        this.unavailableColors.add(
          Math.abs(Number.parseInt($button.id.slice(6))),
        )
  }

  /**
   * Buys up to `packs` packs of paint charges, returns whether the order went
   * through.
   *
   * The store is wplace's own UI, so this is the usual pile of hardcoded
   * handles. The card is found by its wording rather than its classes, because
   * the wording churns less; if buying quietly stops working, check
   * STORE_BUTTON and PACK_LABEL against the live page first.
   */
  public async buyChargePacks(packs: number): Promise<boolean> {
    const STORE_BUTTON = 'button[title="Store"]'
    const PACK_LABEL = '+30 Paint Charges'
    await this.closeAll()
    const $store = document.querySelector<HTMLButtonElement>(STORE_BUTTON)
    if (!$store) {
      console.warn(`wbot: no ${STORE_BUTTON} on the page, charges not bought`)
      return false
    }
    $store.click()

    // Bounded wait: a store that never opens must not hang the whole draw.
    // The card is looked up in the document, not in a container, because the
    // store is a plain section rather than the modal colors are bought from
    let $card: HTMLElement | null = null
    for (let attempt = 0; attempt < 10 && !$card; attempt++) {
      await wait(200)
      $card =
        [...document.querySelectorAll('p')].find(
          (p) => p.textContent.trim() === PACK_LABEL,
        )?.parentElement ?? null
    }
    if (!$card) {
      console.warn(`wbot: no "${PACK_LABEL}" card in the store`)
      await this.closeAll()
      return false
    }

    // wplace caps the counter at what the balance can afford
    const $amount = $card.querySelector<HTMLInputElement>(
      'input[type="number"]',
    )
    if ($amount) {
      $amount.value = Math.min(packs, Number($amount.max) || 1).toString()
      // Svelte reads the value off the event, not off the property
      $amount.dispatchEvent(new Event('input', { bubbles: true }))
      await wait(100)
    }
    const $buy = $card.querySelector<HTMLButtonElement>('button.btn-primary')
    if (!$buy || $buy.disabled) {
      console.warn('wbot: the charges card has no buy button to click')
      await this.closeAll()
      return false
    }
    $buy.click()
    await wait(1000)
    await this.closeAll()
    await wait(500)
    return true
  }

  /** Scroll the map by a screen-space delta */
  public moveMap(delta: Position) {
    // panBy moves the camera, so the content shifts by -delta, which is what
    // the old synthetic drag did too
    this.map.panBy([delta.x, delta.y], { duration: 0 })
  }

  /** Close drawing on focus to not consume space */
  public fixSpaceInInput(input: HTMLInputElement) {
    input.addEventListener('focus', () => this.closeAll())
  }

  /** Opens colors and makes them visible for selection */
  protected async openColors() {
    this.lastColor = undefined
    // Click close marker
    document
      .querySelector<HTMLButtonElement>('.flex.gap-2.px-3 > .btn-circle')
      ?.click()
    await wait(1)
    // Click "Paint"
    document
      .querySelector<HTMLButtonElement>('.btn.btn-primary.btn-lg.relative.z-30')
      ?.click()
    await wait(1)
    // Click Unfold colors if folded
    const unfoldColors =
      document.querySelector<HTMLButtonElement>('button.bottom-0')
    if (
      unfoldColors?.innerHTML ===
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" class="size-5"><path d="M480-120 300-300l58-58 122 122 122-122 58 58-180 180ZM358-598l-58-58 180-180 180 180-58 58-122-122-122 122Z"></path></svg><!---->'
    ) {
      unfoldColors.click()
      await wait(1)
    }
  }

  /** Closes all popups */
  public async closeAll() {
    for (const button of document.querySelectorAll('button')) {
      if (
        button.innerHTML === '✕' ||
        button.innerHTML ===
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" class="size-4"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"></path></svg><!---->`
      ) {
        button.click()
        await wait(1)
      }
    }
  }

  /** Wait for element to show up in document */
  protected waitForElement<T extends Element>(selector: string): Promise<T> {
    return new Promise<T>((resolve) => {
      // If element already exists, resolve immediately
      const existing = document.querySelector<T>(selector)
      if (existing) {
        resolve(existing)
        return
      }
      // Watch for new elements
      const observer = new MutationObserver(() => {
        const element = document.querySelector<T>(selector)
        if (element) {
          observer.disconnect()
          resolve(element)
        }
      })
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      })
    })
  }

  /** Tiles whose country's flag the account has bought */
  public cashbackTiles() {
    const tiles = new Set<number>()
    const flags = this.me?.flagsBitmap
    if (!flags) return tiles
    for (const [key, countryId] of this.tileCountries)
      if (ownsFlag(flags, countryId)) tiles.add(key)
    return tiles
  }

  /** How many of the image's tasks a bought flag pays a refund on */
  public cashbackTasks(image: BotImage) {
    const stamp = `${this.me?.flagsBitmap ?? ''}|${this.tileCountries.size}`
    const cached = this.cashbackCache.get(image.tasks)
    if (cached?.stamp === stamp) return cached.count
    const count = countCashbackTasks(image.tasks, this.cashbackTiles())
    this.cashbackCache.set(image.tasks, { stamp, count })
    return count
  }

  /**
   * Asks wplace for the country of every tile the images overlap that is not
   * known yet. A tile has one country, so one pixel per tile is enough.
   * Resolves to whether anything new was learned
   */
  public async fetchTileCountries(images: readonly BotImage[]) {
    const missing = new Set<number>()
    for (const image of images) {
      if (!image.visible) continue
      for (const key of coveredTiles(
        image.position.globalX,
        image.position.globalY,
        image.width,
        image.height,
      ))
        if (!this.tileCountries.has(key) && !this.pendingTiles.has(key))
          missing.add(key)
    }
    let learned = false
    for (const key of missing) {
      this.pendingTiles.add(key)
      const [tileX, tileY] = tileFromKey(key)
      try {
        // Past the interceptor, or the lookup would pass for a marker click
        const response = await this.originalFetch(
          `https://backend.wplace.live/s0/pixel/${tileX}/${tileY}?x=500&y=500`,
          { credentials: 'include' },
        )
        if (
          response.ok &&
          this.learnTileCountry(tileX, tileY, await response.json())
        )
          learned = true
      } catch {
        // An unknown tile only goes without cashback until the next try
      } finally {
        this.pendingTiles.delete(key)
      }
    }
    if (learned) void save(this)
    return learned
  }

  protected learnTileCountry(tileX: number, tileY: number, info: unknown) {
    const countryId = (info as { region?: { countryId?: unknown } } | null)
      ?.region?.countryId
    if (typeof countryId !== 'number') return false
    const key = tileKey(tileX, tileY)
    if (this.tileCountries.get(key) === countryId) return false
    this.tileCountries.set(key, countryId)
    return true
  }

  /** Zoom in until one map pixel is at least `pixelSize` screen pixels */
  protected zoomIn(pixelSize: number) {
    const zoom = zoomForPixelSize(pixelSize)
    if (this.map.getZoom() < zoom) this.map.jumpTo({ zoom })
  }

  /** Start listening to fetch requests */
  protected registerFetchInterceptor() {
    const originalFetch = this.originalFetch
    const pixelRegExp =
      /https:\/\/backend.wplace.live\/s\d+\/pixel\/(-?\d+)\/(-?\d+)\?x=(-?\d+)&y=(-?\d+)/
    // Every staged pixel leaves in one batched request, whatever tiles it spans
    const paintRegExp = /^https:\/\/backend\.wplace\.live\/paint(?:\?|$)/
    // @ts-ignore
    globalThis.fetch = async (request, options) => {
      const response = await originalFetch(request, options)
      const cloned = response.clone()
      let url = ''
      if (typeof request == 'string') url = request
      else if (request instanceof Request) url = request.url
      else if (request instanceof URL) url = request.href
      const method =
        request instanceof Request ? request.method : (options?.method ?? 'GET')
      if (method.toUpperCase() === 'POST' && paintRegExp.test(url)) {
        const result = (await cloned.json().catch(() => undefined)) as
          { painted?: number } | undefined
        const resolve = this.paintResolver
        this.paintResolver = undefined
        resolve?.(response.ok ? result?.painted : 0)
      }
      if (response.url === 'https://backend.wplace.live/me') {
        this.me = (await cloned.json()) as Me
        this.lastMeAt = Date.now()
      }
      const pixelMatch = pixelRegExp.exec(url)
      if (pixelMatch) {
        // wplace asks for pixel info on every click, and it names the country
        void cloned
          .json()
          .then((info: unknown) => {
            this.learnTileCountry(+pixelMatch[1]!, +pixelMatch[2]!, info)
          })
          .catch(() => undefined)
        for (
          let index = 0;
          index < this.markerPixelPositionResolvers.length;
          index++
        )
          this.markerPixelPositionResolvers[index]!(
            new WorldPosition(
              this,
              +pixelMatch[1]!,
              +pixelMatch[2]!,
              +pixelMatch[3]!,
              +pixelMatch[4]!,
            ),
          )
        this.markerPixelPositionResolvers.length = 0
      }
      return response
    }
  }
}

// @ts-ignore
globalThis.wbot = new WPlaceBot(await loadSave())
