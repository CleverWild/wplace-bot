import { wait } from '@softsky/utils'

import { BotImage, UnownedColorStrategy } from './image'
import { findMap, type WplaceMap } from './map'
import { obfuscateCSS } from './obfuscator'
import { DELETE_ALL_DATA, loadSave, save, SAVE_VERSION } from './save'
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
import { BotStrategy, DropletStrategy, Widget } from './widget'
import { workerClearMapCache } from './worker-client'
import {
  addFavoriteLocation,
  extractScreenPositionFromStar,
  FAVORITE_LOCATIONS,
  FAVORITE_LOCATIONS_POSITIONS,
  type Position,
  WorldPosition,
} from './world-position'
import {
  OVERLAYS_KEY,
  readSiteTemplateImage,
  readSiteTemplates,
} from './wplace-file'

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

  /** Cached stars elements */
  public $stars: HTMLDivElement[] = []

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

  /** Images on canvas */
  public images: BotImage[] = []

  /** Autodraw interval */
  public autoDrawInterval?: ReturnType<typeof setInterval>

  /** True while draw() walks this.images */
  protected drawing = false

  public widget = new Widget(this)

  /** Used to wait for pixel data on marker set */
  protected markerPixelPositionResolvers: ((
    position: WorldPosition,
  ) => unknown)[] = []

  /** Last color drawn */
  protected lastColor?: number

  /** Answers the one batched paint request the running draw() sent */
  protected paintResolver?: (painted: number | undefined) => void

  public constructor(save?: Awaited<ReturnType<WPlaceBot['toJSON']>>) {
    // Preinit save data before page has loaded
    if (save) {
      for (let index = 0; index < save.images.length; index++) {
        const image = save.images[index]!
        addFavoriteLocation({
          x: image.position[0] - 1000,
          y: image.position[1] - 1000,
        })
        addFavoriteLocation({
          x: image.position[0] + 1000,
          y: image.position[1] + 1000,
        })
      }

      this.strategy = save.strategy
      this.dropletStrategy = save.dropletStrategy
      this.title = save.title
    } else {
      this.title = 'WPlace-bot'
    }

    // Templates placed in wplace's own manager that aren't in the save yet.
    // Read here, before the interceptor, so their anchors reach /me.
    const known = new Set(save?.images.map((image) => image.wplaceId))
    const newTemplates = readSiteTemplates().filter(
      (template) => !known.has(template.id),
    )
    for (let index = 0; index < newTemplates.length; index++) {
      const [x, y] = newTemplates[index]!.data.position
      addFavoriteLocation({ x: x - 1000, y: y - 1000 })
      addFavoriteLocation({ x: x + 1000, y: y + 1000 })
    }

    this.registerFetchInterceptor()

    // Embed styles
    const style = document.createElement('style')
    style.textContent = obfuscateCSS(
      (css as string).replace(
        'FAKE_FAVORITE_LOCATIONS',
        FAVORITE_LOCATIONS.length.toString(),
      ),
    )
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
        const $canvasContainer = await this.waitForElement(
          '.maplibregl-canvas-container',
        )
        progress(0.03)
        this.map = await findMap(this)
        new MutationObserver((mutations: MutationRecord[]) => {
          // Stars come and go as wplace re-renders markers
          for (let index = 0; index < mutations.length; index++) {
            const mutation = mutations[index]!
            if (
              mutation.removedNodes.length !== 0 ||
              mutation.addedNodes.length !== 0
            ) {
              this.updateStars()
              break
            }
          }
          for (let index = 0; index < this.images.length; index++)
            this.images[index]!.updateUI()
        }).observe($canvasContainer, {
          attributes: true,
          childList: true,
          subtree: true,
        })
        this.updateStars()
        await wait(500) // Sometimes wplace UI becomes bugged if interacted too early
        progress(0.04)
        await this.updateColorsData()
        progress(0.05)
        // Load images
        if (save) {
          const batchSize = 1 / save.images.length
          for (let index = 0; index < save.images.length; index++) {
            await BotImage.fromJSON(this, save.images[index]!, (p) => {
              progress(0.05 + (index * batchSize + p * batchSize) * 0.95)
            })
          }
        }
        await this.importSiteTemplates(newTemplates)
        // Catch up on anything that changed while the tab was closed
        await this.syncSiteTemplates()
        this.watchSiteTemplates()
        // Unblock buttons
        this.widget.setDisabled('draw', false)
        this.widget.setDisabled('auto-draw', false)
        this.widget.setDisabled('add-image', false)
        // this.widget.setDisabled('pumpkin-hunt', false)
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
              'Wplace-Bot-Broken-Save.txt is your broken save. If you ACTUALLY need data from this save, create issue on https://github.com/SoundOfTheSky/wplace-bot/issues\n\nDeveloper will try to fix your save. Be vary that github issues are public, and save file contains your images and their positions in world.',
            )
            DELETE_ALL_DATA()
          } catch {
            DELETE_ALL_DATA()
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
        const firstImage = this.images[0]
        if (!firstImage) return
        this.drawing = true

        // Stop mouse messing with drawing by capturing event
        globalThis.addEventListener('mousemove', prevent, true)
        $canvas.addEventListener('wheel', prevent, true)

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
            this.zoomIn(4, $canvas),
            fetch('https://backend.wplace.live/me', {
              credentials: 'include',
            })
              .then((x) => x.json())
              .then((x) => {
                this.me = x as Me
              }),
          ]),
        )

        const initialCharges = Math.floor(this.me!.charges.count)
        let charges = initialCharges

        // Calculate tasks and colors to buy
        let tasksLength = 0
        for (let index = 0; index < this.images.length; index++) {
          const image = this.images[index]!
          if (!image.visible) continue
          tasksLength += image.tasks.length / 2
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
              (tasksLength - initialCharges) / CHARGES_PER_PACK_WITH_PAYBACK,
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

        // Nothing is painted until wplace's own button goes out. A run that
        // sends the queue itself learns here what it cost; one that leaves the
        // button to the user has painted nothing yet and must claim nothing
        const queued = initialCharges - charges
        const meBeforePaint = this.lastMeAt
        const painted =
          submit && queued > 0 ? await this.submitPaint(queued) : 0
        // A batch is all-or-nothing in practice, and which pixels a short
        // answer left out is not knowable, so keep the tasks and let the next
        // run rebuild them from the map
        if (painted >= queued)
          for (const [image, value] of indexes)
            image.tasks = image.tasks.subarray(value * 2)

        this.widget.update()

        // Painting moves both counters, and the ETA and the wake-up time read
        // our copy of /me. wplace refetches it after some paints, so only
        // correct the numbers by hand when it did not
        if (this.lastMeAt === meBeforePaint) {
          this.me!.charges.count = Math.max(0, this.me!.charges.count - painted)
          this.me!.droplets += painted * DROPLETS_PER_PIXEL
          this.lastMeAt = Date.now()
        }

        // The bar is empty now, so the account maximum no longer caps a
        // purchase. Without this the droplets would sit unspent until the next
        // Auto-Draw, which deliberately wakes up with the bar almost full.
        // Painting something is the condition that keeps this from spinning:
        // a run that paints nothing cannot pay for the next one
        if (
          wantsCharges &&
          painted > 0 &&
          this.me!.droplets >= DROPLETS_PER_PACK &&
          this.images.some((image) => image.visible && image.tasks.length > 0)
        )
          return this.draw(submit)
      },
      () => {
        this.drawing = false
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
    for (let index = 0; index < this.images.length; index++) {
      const image = this.images[index]!
      if (image.visible) tasks += image.tasks.length / 2
    }
    // Nothing left to paint: look again once the bar has filled anyway
    if (tasks === 0) return maxCharges * cooldownMs
    const buysCharges = this.spendsOnCharges && this.colorsToBuy().length === 0
    const bought = buysCharges
      ? Math.floor((this.me?.droplets ?? 0) / DROPLETS_PER_PACK) *
        CHARGES_PER_PACK
      : 0
    const painting = Math.min(tasks, maxCharges)
    const missing = painting - (this.me?.charges.count ?? 0) - bought
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
  public async toJSON() {
    return {
      version: SAVE_VERSION,
      images: await Promise.all(this.images.map((x) => x.toJSON())),
      strategy: this.strategy,
      dropletStrategy: this.dropletStrategy,
      title: this.title,
    }
  }

  /** Pull templates out of wplace's own manager */
  protected async importSiteTemplates(
    templates: ReturnType<typeof readSiteTemplates>,
  ) {
    if (templates.length === 0) return
    await this.widget.run('Importing templates', async (progress) => {
      const batchSize = 1 / templates.length
      for (let index = 0; index < templates.length; index++) {
        const template = templates[index]!
        const url = await readSiteTemplateImage(template.id)
        if (!url) continue
        await BotImage.fromJSON(
          this,
          // Opacity stays ours: the site draws its own overlay, so ours is
          // hidden until the user wants to compare. Visibility is the site's,
          // so it lands in `siteDisabled` and leaves our switch alone
          {
            ...template.data,
            opacity: 0,
            url,
            wplaceId: template.id,
            disabled: false,
            siteDisabled: template.data.disabled,
          },
          (p) => {
            progress(index * batchSize + p * batchSize)
          },
        )
      }
    })
    await save(this, true)
  }

  /**
   * Follow wplace's template manager.
   * Its writes to localStorage fire no event in the tab that made them, so
   * this polls. Comparing the raw string first keeps it to a string compare
   * on the vast majority of ticks.
   */
  protected watchSiteTemplates() {
    let snapshot = localStorage.getItem(OVERLAYS_KEY)
    let syncing = false
    // The bot lives as long as the page does, so this is never cleared
    setInterval(() => {
      // Syncing deletes images, which would derail the draw loop
      if (this.drawing || syncing) return
      const current = localStorage.getItem(OVERLAYS_KEY)
      if (current === snapshot) return
      snapshot = current
      syncing = true
      void this.syncSiteTemplates().finally(() => {
        syncing = false
      })
    }, 1000)
  }

  /** Make our copies match the site's templates */
  protected async syncSiteTemplates() {
    const templates = new Map(
      readSiteTemplates().map((template) => [template.id, template.data]),
    )
    let changed = false
    for (let index = this.images.length - 1; index >= 0; index--) {
      const image = this.images[index]!
      if (!image.wplaceId) continue
      const data = templates.get(image.wplaceId)
      if (data) {
        templates.delete(image.wplaceId)
        if (await image.applySiteTemplate(data)) changed = true
      } else {
        // Removed on the site, so it goes here too
        image.destroy()
        changed = true
      }
    }
    if (templates.size !== 0) {
      // Anchors for these only reach the map with the next /me, which wplace
      // sends after a server-confirmed action. Until then they position off
      // the existing ones, which measured under 0.1 map pixels of drift.
      const fresh = [...templates].map(([id, data]) => ({ id, data }))
      for (let index = 0; index < fresh.length; index++) {
        const [x, y] = fresh[index]!.data.position
        addFavoriteLocation({ x: x - 1000, y: y - 1000 })
        addFavoriteLocation({ x: x + 1000, y: y + 1000 })
      }
      await this.importSiteTemplates(fresh)
      changed = true
    }
    if (changed) {
      this.widget.update()
      await save(this, true)
    }
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

  /** Move map */
  public moveMap(delta: Position) {
    const canvas = document.querySelector('.maplibregl-canvas')!
    const startX = window.innerWidth / 2
    const startY = window.innerHeight / 2
    const endX = startX - delta.x
    const endY = startY - delta.y
    function fire(type: string, x: number, y: number) {
      canvas.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          buttons: 1,
        }),
      )
    }
    fire('mousedown', startX, startY)
    fire('mousemove', endX, endY)
    fire('mouseup', endX, endY)
  }

  /** Find anchor data for screen postition */
  public findAnchorsForScreen(position: Position) {
    let anchorIndex = 0
    let minI2 = 1
    let min1 = Infinity
    let min2 = Infinity
    for (let index = 0; index < this.$stars.length; index++) {
      const { x, y } = extractScreenPositionFromStar(this.$stars[index]!)
      if (x < position.x && y < position.y) {
        const delta = position.x - x + (position.y - y)
        if (delta < min1) {
          min1 = delta
          anchorIndex = index
        }
      } else if (x > position.x && y > position.y) {
        const delta = x - position.x + (y - position.y)
        if (delta < min2) {
          min2 = delta
          minI2 = index
        }
      }
    }
    const anchorScreenPosition = extractScreenPositionFromStar(
      this.$stars[anchorIndex]!,
    )
    const anchorWorldPosition = FAVORITE_LOCATIONS_POSITIONS[anchorIndex]!
    return {
      anchorScreenPosition,
      anchorWorldPosition,
      pixelSize:
        (extractScreenPositionFromStar(this.$stars[minI2]!).x -
          anchorScreenPosition.x) /
        (FAVORITE_LOCATIONS_POSITIONS[minI2]!.x - anchorWorldPosition.x),
    }
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

  /** Simply update $stars property */
  protected updateStars() {
    const previous = this.$stars.length
    this.$stars = [
      ...document.querySelectorAll<HTMLDivElement>(
        '.text-yellow-400.cursor-pointer.z-10.maplibregl-marker.maplibregl-marker-anchor-center',
      ),
    ].slice(0, FAVORITE_LOCATIONS.length)
    // A changed count means anchors arrived (or left) with a /me, so images
    // can pick better ones
    if (this.$stars.length !== previous)
      for (let index = 0; index < this.images.length; index++)
        this.images[index]!.position.updateAnchor()
  }

  /** Zoom in canvas */
  protected async zoomIn(
    zoom: number,
    canvas = document.querySelector<HTMLDivElement>('.maplibregl-canvas')!,
  ) {
    const position = this.images[0]!.position
    if (position.pixelSize >= zoom) return
    const event = new WheelEvent('wheel', {
      deltaY: -10,
      clientX: canvas.clientWidth / 2,
      clientY: canvas.clientHeight / 2,
      bubbles: true,
      shiftKey: true,
    })
    return new Promise<void>((resolve) => {
      function scroll() {
        if (position.pixelSize >= zoom) resolve()
        else requestAnimationFrame(scroll)
        canvas.dispatchEvent(event)
      }
      scroll()
    })
  }

  /** Start listening to fetch requests */
  protected registerFetchInterceptor() {
    const originalFetch = globalThis.fetch
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
        this.me.favoriteLocations.unshift(...FAVORITE_LOCATIONS)
        this.me.maxFavoriteLocations = Infinity
        response.json = () => Promise.resolve(this.me)
      }
      const pixelMatch = pixelRegExp.exec(url)
      if (pixelMatch) {
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
