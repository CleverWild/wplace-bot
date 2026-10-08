// ==UserScript==
// @name         wplace-bot
// @namespace    https://github.com/CleverWild
// @version      5.2.0
// @description  Bot to automate painting on website https://wplace.live
// @author       SoundOfTheSky, CleverWild
// @license      MPL-2.0
// @homepageURL  https://github.com/CleverWild/wplace-bot
// @supportURL   https://github.com/CleverWild/wplace-bot/issues
// @updateURL    https://raw.githubusercontent.com/CleverWild/wplace-bot/refs/heads/main/dist.user.js
// @downloadURL  https://raw.githubusercontent.com/CleverWild/wplace-bot/refs/heads/main/dist.user.js
// @run-at       document-start
// @match        *://*.wplace.live/*
// @grant        none
// ==/UserScript==

// Wplace  --> https://wplace.live
// License --> https://www.mozilla.org/en-US/MPL/2.0/

// node_modules/@softsky/utils/dist/arrays.js
function swap(array, index, index2) {
  const temporary = array[index2];
  array[index2] = array[index];
  array[index] = temporary;
  return array;
}
function removeFromArray(array, value) {
  const index = array.indexOf(value);
  if (index !== -1)
    array.splice(index, 1);
  return index;
}
// node_modules/@softsky/utils/dist/objects.js
class Base {
  static lastId = 0;
  static idMap = new Map;
  static subclasses = new Map;
  runOnDestroy = [];
  _id;
  get id() {
    return this._id;
  }
  set id(value) {
    Base.idMap.delete(this._id);
    Base.idMap.set(value, this);
    this._id = value;
  }
  constructor(id = ++Base.lastId) {
    this._id = id;
    Base.idMap.set(id, this);
  }
  static registerSubclass() {
    Base.subclasses.set(this.name, this);
  }
  destroy() {
    Base.idMap.delete(this._id);
    for (let index = 0;index < this.runOnDestroy.length; index++)
      this.runOnDestroy[index]();
  }
  registerEvent(target, type, listener, options = {}) {
    options.passive ??= true;
    target.addEventListener(type, listener, options);
    this.runOnDestroy.push(() => {
      target.removeEventListener(type, listener);
    });
  }
}

// node_modules/@softsky/utils/dist/control.js
var lastIncId = Math.floor(Math.random() * 65536);
var SESSION_ID = Math.floor(Math.random() * 4503599627370496).toString(16).padStart(13, "0");
function wait(time) {
  return new Promise((r) => setTimeout(r, time));
}
// node_modules/@softsky/utils/dist/signals.js
var effectsMap = new WeakMap;
// src/drawing/policy.ts
var BotStrategy;
((BotStrategy) => {
  BotStrategy["ALL"] = "ALL";
  BotStrategy["PERCENTAGE"] = "PERCENTAGE";
  BotStrategy["SEQUENTIAL"] = "SEQUENTIAL";
})(BotStrategy ||= {});
var DropletStrategy;
((DropletStrategy) => {
  DropletStrategy["COLORS"] = "COLORS";
  DropletStrategy["COLORS_FIRST"] = "COLORS_FIRST";
})(DropletStrategy ||= {});

// src/errors.ts
class WPlaceBotError extends Error {
  name = "WPlaceBotError";
  constructor(message, bot) {
    super(message);
    bot.widget.status = message;
  }
}

class NoMapError extends WPlaceBotError {
  name = "NoMapError";
  constructor(bot) {
    super("❌ Couldn't find wplace's map. The site has probably changed.", bot);
  }
}

// src/coordinates.ts
var WORLD_TILE_SIZE = 1000;
var WORLD_TILES = 2048;
var WORLD_PIXEL_SIZE = WORLD_TILE_SIZE * WORLD_TILES;
function worldToLatitude(y) {
  return (2 * Math.atan(Math.exp(-(y / WORLD_PIXEL_SIZE * (2 * Math.PI) - Math.PI))) - Math.PI / 2) * 180 / Math.PI;
}
function worldToLongitude(x) {
  return (x / WORLD_PIXEL_SIZE * (2 * Math.PI) - Math.PI) * 180 / Math.PI;
}
function latitudeToWorld(latitude) {
  return (-Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 180 / 2)) + Math.PI) / (2 * Math.PI) * WORLD_PIXEL_SIZE;
}
function longitudeToWorld(longitude) {
  return (longitude * Math.PI / 180 + Math.PI) / (2 * Math.PI) * WORLD_PIXEL_SIZE;
}
function pixelSizeForZoom(zoom) {
  return 512 * 2 ** zoom / WORLD_PIXEL_SIZE;
}
function zoomForPixelSize(pixelSize) {
  return Math.log2(pixelSize * WORLD_PIXEL_SIZE / 512);
}

// src/flags.ts
var FLAG_CASHBACK_PIXELS = 10;
function ownsFlag(flagsBitmap, countryId) {
  if (!flagsBitmap)
    return false;
  let bytes;
  try {
    bytes = atob(flagsBitmap);
  } catch {
    return false;
  }
  const byteIndex = Math.floor(countryId / 8);
  if (byteIndex >= bytes.length)
    return false;
  return (bytes.charCodeAt(bytes.length - 1 - byteIndex) & 1 << countryId % 8) !== 0;
}
function tileKey(tileX, tileY) {
  return tileY * WORLD_TILES + tileX;
}
function tileFromKey(key) {
  return [key % WORLD_TILES, Math.floor(key / WORLD_TILES)];
}
function coveredTiles(globalX, globalY, width, height) {
  const keys = [];
  const lastX = Math.floor((globalX + Math.max(1, width) - 1) / WORLD_TILE_SIZE);
  const lastY = Math.floor((globalY + Math.max(1, height) - 1) / WORLD_TILE_SIZE);
  for (let y = Math.floor(globalY / WORLD_TILE_SIZE);y <= lastY; y++)
    for (let x = Math.floor(globalX / WORLD_TILE_SIZE);x <= lastX; x++)
      keys.push(tileKey(x, y));
  return keys;
}
function countCashbackTasks(tasks, cashbackTiles) {
  if (cashbackTiles.size === 0)
    return 0;
  let count = 0;
  let lastKey = -1;
  let lastHit = false;
  for (let index = 0;index < tasks.length; index += 2) {
    const key = tileKey(tasks[index] / WORLD_TILE_SIZE | 0, tasks[index + 1] / WORLD_TILE_SIZE | 0);
    if (key !== lastKey) {
      lastKey = key;
      lastHit = cashbackTiles.has(key);
    }
    if (lastHit)
      count++;
  }
  return count;
}
function cashbackCharges(pixels) {
  return Math.floor(Math.max(0, pixels) / FLAG_CASHBACK_PIXELS);
}

// src/obfuscator.ts
var SID = Array.from({ length: 16 }, () => (10 + Math.random() * 26 | 0).toString(36)).join("");
function obfucsateHTML(html) {
  return html.replace(/class="([^"]*)"/g, (_, classes) => {
    const prefixed = classes.split(/\s+/).filter(Boolean).map((c) => `${SID}${c}`).join(" ");
    return `class="${prefixed}"`;
  });
}
function obfuscateLocalCSS(css) {
  return css.replaceAll(/\.([a-z])/g, `.${SID}$1`);
}
function obfuscateCSS(css) {
  const [global, local] = css.split("/** LOCAL STYLES */");
  return global + `
` + obfuscateLocalCSS(local);
}
function toggleClass(el, className) {
  return el.classList.toggle(SID + className);
}
function addClass(el, className) {
  el.classList.add(SID + className);
}
function removeClass(el, className) {
  el.classList.remove(SID + className);
}
function containsClass(el, className) {
  return el.classList.contains(SID + className);
}
function querySelector(el, selector) {
  return el.querySelector(obfuscateLocalCSS(selector));
}

// src/base.ts
class Base2 {
  runOnDestroy = [];
  destroy() {
    for (let index = 0;index < this.runOnDestroy.length; index++)
      this.runOnDestroy[index]();
  }
  populateElementsWithSelector(element, selectors) {
    for (const key in selectors) {
      this[key] = querySelector(element, selectors[key]);
    }
  }
  registerEvent(target, type, listener, options = {}) {
    options.passive ??= true;
    target.addEventListener(type, listener, options);
    this.runOnDestroy.push(() => {
      target.removeEventListener(type, listener);
    });
  }
}

// src/colors.ts
function srgbNonlinearTransformInv(c) {
  return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92;
}
function rgbToLab(r, g, b) {
  const lr = srgbNonlinearTransformInv(r / 255);
  const lg = srgbNonlinearTransformInv(g / 255);
  const lb = srgbNonlinearTransformInv(b / 255);
  const f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  const fx = f((lr * 0.4124 + lg * 0.3576 + lb * 0.1805) / 0.95047);
  const fy = f(lr * 0.2126 + lg * 0.7152 + lb * 0.0722);
  const fz = f((lr * 0.0193 + lg * 0.1192 + lb * 0.9505) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
var COLORS_RGB = [
  NaN,
  0,
  3947580,
  7895160,
  13816530,
  16777215,
  6291480,
  15539236,
  16744231,
  16165385,
  16375099,
  16775868,
  964968,
  1304187,
  8912734,
  819566,
  1093286,
  1302974,
  2642078,
  4232164,
  6354930,
  7033078,
  10072571,
  7867545,
  11155641,
  14721017,
  13303930,
  15474560,
  15961513,
  6833716,
  9791530,
  16298615,
  11184810,
  10817054,
  16416882,
  14965786,
  14071188,
  10257457,
  12954929,
  15258719,
  4877114,
  5936202,
  8701299,
  1014175,
  12319474,
  8243199,
  5059000,
  4866692,
  8024516,
  11906801,
  14394467,
  13729873,
  16762277,
  10179145,
  13729912,
  16430756,
  8086354,
  10257515,
  3356993,
  7173517,
  11778513,
  7169087,
  9735275,
  13485470
];
var COLORS_RGB_TRIPLES = COLORS_RGB.map((rgb) => [rgb >> 16, rgb >> 8 & 255, rgb & 255]);
var COLORS = COLORS_RGB.map((rgb, index) => index === 0 ? [Number.NaN, Number.NaN, Number.NaN] : rgbToLab(rgb >> 16, rgb >> 8 & 255, rgb & 255));
var COLORS_RGB_MAP = new Map;
for (let index = 0;index < COLORS_RGB.length; index++)
  COLORS_RGB_MAP.set(COLORS_RGB[index], index);
function colorToCSS(colorId) {
  if (colorId === 0)
    return "transparent";
  return "#" + COLORS_RGB[colorId].toString(16).padStart(6, "0");
}

// src/image/controller.ts
var SETTING_EFFECTS = {
  strategy: "recompute",
  drawTransparentPixels: "recompute",
  drawColorsInOrder: "recompute",
  colors: "recompute",
  disabledColors: "recompute",
  disabled: "recompute",
  unownedColorStrategy: "recompute",
  regionOrder: "recompute",
  fillDirection: "recompute",
  outlineFirst: "recompute"
};
function effectOf(keys) {
  for (const key of keys)
    if (Object.hasOwn(SETTING_EFFECTS, key))
      return "recompute";
  return "none";
}

class ImageController {
  settings;
  host;
  revision = 0;
  disposed = false;
  latest = Promise.resolve();
  constructor(settings, host) {
    this.settings = settings;
    this.host = host;
  }
  async update(changes, { save = true } = {}) {
    const effect = effectOf(this.assign(changes));
    if (effect === "none")
      return effect;
    await this.recompute();
    if (save)
      await this.host.save();
    return effect;
  }
  invalidate() {
    this.revision++;
    this.latest = Promise.resolve();
  }
  recompute(progress) {
    const run = this.run(++this.revision, progress);
    this.latest = run;
    return run;
  }
  dispose() {
    this.disposed = true;
    this.revision++;
  }
  assign(changes) {
    const changed = [];
    for (const [key, value] of Object.entries(changes)) {
      if (!Object.hasOwn(SETTING_EFFECTS, key))
        continue;
      const target = this.settings;
      if (Object.is(target[key], value))
        continue;
      target[key] = value;
      changed.push(key);
    }
    return changed;
  }
  async run(revision, progress) {
    let result;
    try {
      result = await this.host.calculate(progress);
    } catch (error) {
      if (this.disposed)
        return;
      if (revision !== this.revision)
        return this.latest;
      throw error;
    }
    if (this.disposed)
      return;
    if (revision !== this.revision)
      return this.latest;
    this.host.apply(result, progress);
  }
}

// src/ordering.ts
var ImageStrategy;
((ImageStrategy) => {
  ImageStrategy["RANDOM"] = "RANDOM";
  ImageStrategy["CONTRAST"] = "CONTRAST";
  ImageStrategy["DOWN"] = "DOWN";
  ImageStrategy["UP"] = "UP";
  ImageStrategy["LEFT"] = "LEFT";
  ImageStrategy["RIGHT"] = "RIGHT";
  ImageStrategy["SPIRAL_FROM_CENTER"] = "SPIRAL_FROM_CENTER";
  ImageStrategy["SPIRAL_TO_CENTER"] = "SPIRAL_TO_CENTER";
})(ImageStrategy ||= {});
var RegionOrder;
((RegionOrder) => {
  RegionOrder["OFF"] = "OFF";
  RegionOrder["IN_ORDER"] = "IN_ORDER";
  RegionOrder["LARGEST"] = "LARGEST";
  RegionOrder["SMALLEST"] = "SMALLEST";
})(RegionOrder ||= {});
var FillDirection;
((FillDirection) => {
  FillDirection["SEED_OUT"] = "SEED_OUT";
  FillDirection["EDGE_IN"] = "EDGE_IN";
})(FillDirection ||= {});
function sortColorsByAmount(colors, amounts, ascending) {
  return [...colors].sort((a, b) => ascending ? (amounts.get(a) ?? 0) - (amounts.get(b) ?? 0) : (amounts.get(b) ?? 0) - (amounts.get(a) ?? 0));
}

// src/image/model.ts
var UnownedColorStrategy;
((UnownedColorStrategy) => {
  UnownedColorStrategy["BUY"] = "BUY";
  UnownedColorStrategy["SKIP"] = "SKIP";
  UnownedColorStrategy["SUBSTITUTE"] = "SUBSTITUTE";
})(UnownedColorStrategy ||= {});
function createImageSettings(overrides = {}) {
  const settings = {
    strategy: "SPIRAL_TO_CENTER" /* SPIRAL_TO_CENTER */,
    drawTransparentPixels: false,
    drawColorsInOrder: true,
    colors: [],
    disabledColors: new Set,
    disabled: false,
    unownedColorStrategy: "BUY" /* BUY */,
    regionOrder: "OFF" /* OFF */,
    fillDirection: "SEED_OUT" /* SEED_OUT */,
    outlineFirst: false
  };
  for (const key of Object.keys(settings)) {
    const value = overrides[key];
    if (value !== undefined)
      Object.assign(settings, { [key]: value });
  }
  settings.colors = [...settings.colors];
  settings.disabledColors = new Set(settings.disabledColors);
  return settings;
}

// src/image.html
var image_default = `<dialog class="form">\r
    <div class="name"></div>\r
    <div class="progress">\r
      <div></div>\r
      <span></span>\r
    </div>\r
    <label class="unowned-color-strategy" title="What to do with unonwned colors">\r
      Unowned Colors:&nbsp;<select>\r
        <option value="BUY" selected>Buy</option>\r
        <option value="SKIP">Skip</option>\r
        <option value="SUBSTITUTE">Substitute</option>\r
      </select>\r
    </label>\r
    <label color="How to draw">\r
      Strategy:&nbsp;<select class="strategy">\r
        <option value="RANDOM">Random</option>\r
        <option value="CONTRAST">Maximum contrast</option>\r
        <option value="DOWN">Top to Bottom</option>\r
        <option value="UP">Bottom to Top</option>\r
        <option value="LEFT">Right to Left</option>\r
        <option value="RIGHT">Left to Right</option>\r
        <option value="SPIRAL_FROM_CENTER">Spiral out</option>\r
        <option value="SPIRAL_TO_CENTER" selected>Spiral in</option>\r
      </select>\r
    </label>\r
    <label>\r
      <input type="checkbox" class="draw-transparent" />&nbsp;Erase transparent pixels\r
    </label>\r
    <label>\r
      <input type="checkbox" class="draw-colors-in-order" />&nbsp;Draw colors in order\r
    </label>\r
    <label title="The silhouette, meaning whatever touches transparency or the image edge, before everything it encloses">\r
      <input type="checkbox" class="outline-first" />&nbsp;Outline first\r
    </label>\r
    <label class="region-order" title="Finish one blob of a color before starting the next, and which blob goes first">\r
      Fill regions:&nbsp;<select>\r
        <option value="OFF" selected>Off</option>\r
        <option value="IN_ORDER">In drawing order</option>\r
        <option value="LARGEST">Largest first</option>\r
        <option value="SMALLEST">Smallest first</option>\r
      </select>\r
    </label>\r
    <label class="nested fill-direction" title="How a single blob is filled in">\r
      Fill:&nbsp;<select>\r
        <option value="SEED_OUT" selected>From seed outward</option>\r
        <option value="EDGE_IN">From edge inward</option>\r
      </select>\r
    </label>\r
    <div class="colors-sort">\r
      <button class="sort-colors-desc" title="Order colors by pixel count, most first">↓ Most</button>\r
      <button class="sort-colors-asc" title="Order colors by pixel count, fewest first">↑ Fewest</button>\r
    </div>\r
    <div class="colors"></div>\r
  </dialog>\r
`;

// src/persistence/schema.ts
var SAVE_VERSION = 11;

// src/persistence/migrations.ts
function isFields(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isTileCountry(value) {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === "number" && typeof value[1] === "number";
}
function versionOf(fields) {
  return typeof fields.version === "number" ? fields.version : 0;
}
function migrateLegacyImage(old) {
  if (!isFields(old))
    throw new Error("Saved image is not an object");
  let image = old;
  if (versionOf(image) < 3) {
    const pixels = isFields(image.pixels) ? image.pixels : {};
    image = {
      url: pixels.url,
      width: pixels.width,
      height: undefined,
      brightness: pixels.brightness,
      colorMetric: "lab",
      position: image.position,
      strategy: "SPIRAL_TO_CENTER" /* SPIRAL_TO_CENTER */,
      opacity: image.opacity,
      drawTransparentPixels: image.drawTransparentPixels,
      drawColorsInOrder: image.drawColorsInOrder,
      colors: [],
      disabledColors: [],
      lock: image.lock,
      disabled: false,
      name: `Unnamed image`,
      unownedColorStrategy: "BUY" /* BUY */,
      wplaceId: undefined,
      version: 3
    };
  }
  if (versionOf(image) < 4)
    image = {
      ...image,
      disabled: image.wplaceId ? false : Boolean(image.disabled),
      siteDisabled: image.wplaceId ? Boolean(image.disabled) : false,
      version: 4
    };
  if (versionOf(image) < 5)
    image = {
      ...image,
      floodFill: false,
      regionOrder: "NONE",
      fillDirection: "SEED_OUT" /* SEED_OUT */,
      outlineFirst: false,
      version: 5
    };
  if (versionOf(image) < 6) {
    const { floodFill, ...rest } = image;
    image = {
      ...rest,
      regionOrder: floodFill ? rest.regionOrder === "NONE" ? "IN_ORDER" /* IN_ORDER */ : rest.regionOrder : "OFF" /* OFF */,
      version: 6
    };
  }
  return image;
}
function migrateImage(old, legacy = false) {
  if (!isFields(old))
    throw new Error("Saved image is not an object");
  const image = legacy ? migrateLegacyImage(old) : old;
  if (typeof image.wplaceId !== "string" || image.wplaceId.length === 0)
    throw new Error("Saved template has no Wplace ID");
  const defaults = createImageSettings();
  const colorList = (value) => Array.isArray(value) ? value.filter((color) => typeof color === "number" && Number.isInteger(color) && color >= 0 && color < 64) : [];
  return {
    wplaceId: image.wplaceId,
    strategy: Object.values(ImageStrategy).includes(image.strategy) ? image.strategy : defaults.strategy,
    drawTransparentPixels: typeof image.drawTransparentPixels === "boolean" ? image.drawTransparentPixels : defaults.drawTransparentPixels,
    drawColorsInOrder: typeof image.drawColorsInOrder === "boolean" ? image.drawColorsInOrder : defaults.drawColorsInOrder,
    colors: colorList(image.colors),
    disabledColors: colorList(image.disabledColors),
    disabled: typeof image.disabled === "boolean" ? image.disabled : defaults.disabled,
    unownedColorStrategy: Object.values(UnownedColorStrategy).includes(image.unownedColorStrategy) ? image.unownedColorStrategy : defaults.unownedColorStrategy,
    regionOrder: Object.values(RegionOrder).includes(image.regionOrder) ? image.regionOrder : defaults.regionOrder,
    fillDirection: Object.values(FillDirection).includes(image.fillDirection) ? image.fillDirection : defaults.fillDirection,
    outlineFirst: typeof image.outlineFirst === "boolean" ? image.outlineFirst : defaults.outlineFirst
  };
}
function migrate(old) {
  if (!isFields(old))
    throw new Error("Save is not an object");
  if (versionOf(old) > SAVE_VERSION)
    throw new Error("Save version is newer than this bot");
  let save = old;
  if (versionOf(save) < 3)
    save = {
      version: 3,
      images: save.images,
      strategy: save.strategy,
      title: "WPlace-bot"
    };
  if (versionOf(save) < 7)
    save = { ...save, dropletStrategy: "COLORS" /* COLORS */, version: 7 };
  if (versionOf(save) < 8)
    save = {
      ...save,
      dropletStrategy: save.dropletStrategy === "CHARGES" ? "COLORS_FIRST" /* COLORS_FIRST */ : save.dropletStrategy,
      version: 8
    };
  if (versionOf(save) < 9)
    save = { ...save, widgetOpen: true, version: 9 };
  if (versionOf(save) < 10)
    save = { ...save, tileCountries: [], version: 10 };
  if (!Array.isArray(save.images))
    throw new Error("Save has no image list");
  const images = [];
  const seen = new Set;
  let archivedImageCount = 0;
  for (const image of save.images) {
    if (versionOf(old) < 11 && (!isFields(image) || typeof image.wplaceId !== "string" || !image.wplaceId)) {
      archivedImageCount++;
      continue;
    }
    const migrated = migrateImage(image, versionOf(old) < 11);
    if (!seen.has(migrated.wplaceId)) {
      seen.add(migrated.wplaceId);
      images.push(migrated);
    }
  }
  return {
    version: SAVE_VERSION,
    images,
    strategy: Object.values(BotStrategy).includes(save.strategy) ? save.strategy : "ALL" /* ALL */,
    dropletStrategy: Object.values(DropletStrategy).includes(save.dropletStrategy) ? save.dropletStrategy : "COLORS" /* COLORS */,
    title: typeof save.title === "string" ? save.title : "WPlace-bot",
    widgetOpen: typeof save.widgetOpen === "boolean" ? save.widgetOpen : true,
    ...archivedImageCount > 0 ? { archivedImageCount } : {},
    tileCountries: Array.isArray(save.tileCountries) ? save.tileCountries.filter(isTileCountry) : []
  };
}

// src/persistence/save-queue.ts
class SaveQueue {
  write;
  delayMs;
  snapshot;
  waiters = [];
  timer;
  tail = Promise.resolve();
  constructor(write, delayMs = 1000) {
    this.write = write;
    this.delayMs = delayMs;
  }
  save(snapshot, immediate = false) {
    this.snapshot = snapshot;
    clearTimeout(this.timer);
    const result = new Promise((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
    if (immediate)
      this.flush().catch(() => {
        return;
      });
    else
      this.timer = setTimeout(() => {
        this.flush().catch(() => {
          return;
        });
      }, this.delayMs);
    return result;
  }
  flush() {
    clearTimeout(this.timer);
    this.timer = undefined;
    const snapshot = this.snapshot;
    if (!snapshot)
      return this.tail;
    const waiters = this.waiters;
    this.snapshot = undefined;
    this.waiters = [];
    let data;
    try {
      data = snapshot();
    } catch (error) {
      data = Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    const job = this.tail.catch(() => {
      return;
    }).then(async () => {
      await this.write(await data);
    });
    this.tail = job;
    job.then(() => {
      for (const waiter of waiters)
        waiter.resolve();
    }, (error) => {
      for (const waiter of waiters)
        waiter.reject(error);
    });
    return job;
  }
}

// src/persistence/store.ts
var DB_NAME = "wbot";
var STORE_NAME = "saves";
var DB_VERSION = 1;
var SAVE_KEY = "wbot";
var PRE_SITE_TEMPLATES_KEY = "wbot-pre-site-templates-v11";
var database;
function openDatabase() {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME))
        db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        database = undefined;
      };
      resolve(db);
    };
    request.onerror = () => {
      database = undefined;
      reject(request.error ?? new Error("IndexedDB request failed"));
    };
  });
  return database;
}
async function idbGet(key) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB request failed"));
    };
  });
}
async function idbSet(key, value) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(value, key);
    transaction.oncomplete = () => {
      resolve();
    };
    transaction.onerror = () => {
      reject(transaction.error ?? new Error("Save transaction failed"));
    };
    transaction.onabort = () => {
      reject(transaction.error ?? new Error("Save transaction aborted"));
    };
  });
}
async function archiveAndMigrateSave(original, migrated) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(PRE_SITE_TEMPLATES_KEY);
    request.onsuccess = () => {
      try {
        if (request.result === undefined)
          store.add(original, PRE_SITE_TEMPLATES_KEY);
        store.put(migrated, SAVE_KEY);
      } catch (error) {
        transaction.abort();
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    };
    transaction.oncomplete = () => {
      resolve();
    };
    transaction.onerror = () => {
      reject(transaction.error ?? new Error("Save migration failed"));
    };
    transaction.onabort = () => {
      reject(transaction.error ?? new Error("Save migration aborted"));
    };
  });
}
async function deleteAllData() {
  const db = await database?.catch(() => {
    return;
  });
  db?.close();
  database = undefined;
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => {
      resolve();
    };
    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB request failed"));
    };
    request.onblocked = () => {
      reject(new Error("Close other wplace tabs before clearing saved data"));
    };
  });
}

// src/save.ts
var queue = new SaveQueue((data) => idbSet(SAVE_KEY, data));
var loadFailure;
async function loadSave() {
  try {
    let raw = await idbGet(SAVE_KEY);
    let legacyKey;
    if (raw === undefined) {
      for (let index = 0;index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (key?.endsWith(SAVE_KEY)) {
          const json = localStorage.getItem(key);
          if (json !== null) {
            raw = JSON.parse(json);
            legacyKey = key;
            break;
          }
        }
      }
    }
    if (raw === undefined) {
      loadFailure = undefined;
      return;
    }
    const loaded = migrate(raw);
    const version = raw.version;
    if (typeof version !== "number" || version < SAVE_VERSION) {
      const { archivedImageCount: _, ...persisted } = loaded;
      await archiveAndMigrateSave(raw, persisted);
    } else if (legacyKey)
      await idbSet(SAVE_KEY, loaded);
    if (legacyKey)
      localStorage.removeItem(legacyKey);
    loadFailure = undefined;
    return loaded;
  } catch (error) {
    loadFailure = error instanceof Error ? error : new Error(String(error));
    throw loadFailure;
  }
}
function save(bot, immediate = false) {
  if (loadFailure)
    return Promise.reject(loadFailure);
  return queue.save(() => bot.toJSON(), immediate);
}

// src/utils.ts
function formatPercent(n) {
  if (Number.isNaN(n))
    return "0%";
  if (n < 0.1)
    n = (n * 1000 | 0) / 10;
  else
    n = n * 100 | 0;
  return n + "%";
}
function formatEta(minutes) {
  const totalMinutes = Math.max(0, Math.floor(minutes));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor(totalMinutes % (24 * 60) / 60);
  const remainingMinutes = totalMinutes % 60;
  if (days > 0)
    return `${days}d ${hours}h ${remainingMinutes}m`;
  return `${hours}h ${remainingMinutes}m`;
}
var DROPLETS_PER_PIXEL = 1;
var DROPLETS_PER_PACK = 500;
var CHARGES_PER_PACK = 30;
var DROPLETS_PER_COLOR = 2000;
var CHARGE_PAYBACK = DROPLETS_PER_PIXEL * CHARGES_PER_PACK / DROPLETS_PER_PACK;
var CHARGES_PER_PACK_WITH_PAYBACK = CHARGES_PER_PACK / (1 - CHARGE_PAYBACK);
function estimateEtaMinutes(remaining, charges, maxCharges, cooldownMs, elapsedMs, droplets, colorsToBuy = 0, cashbackPixels = 0) {
  if (cooldownMs <= 0)
    return 0;
  const regeneratedCharges = Math.max(0, elapsedMs) / cooldownMs;
  const availableCharges = Math.min(Math.max(0, maxCharges), Math.max(0, charges) + regeneratedCharges);
  let needed = Math.max(0, remaining) - Math.max(0, cashbackPixels) / FLAG_CASHBACK_PIXELS;
  if (droplets !== undefined) {
    const earned = Math.max(0, droplets) + Math.max(0, remaining) * DROPLETS_PER_PIXEL;
    const spentOnColors = Math.max(0, colorsToBuy) * DROPLETS_PER_COLOR;
    needed -= Math.max(0, earned - spentOnColors) * CHARGES_PER_PACK / DROPLETS_PER_PACK;
  }
  return Math.max(0, needed - availableCharges) * cooldownMs / 60000;
}

// src/worker-client.ts
var worker = new Worker(URL.createObjectURL(new Blob([`(() => {
  // src/colors.ts
  function srgbNonlinearTransformInv(c) {
    return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92;
  }
  function rgbToLab(r, g, b) {
    const lr = srgbNonlinearTransformInv(r / 255);
    const lg = srgbNonlinearTransformInv(g / 255);
    const lb = srgbNonlinearTransformInv(b / 255);
    const f = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
    const fx = f((lr * 0.4124 + lg * 0.3576 + lb * 0.1805) / 0.95047);
    const fy = f(lr * 0.2126 + lg * 0.7152 + lb * 0.0722);
    const fz = f((lr * 0.0193 + lg * 0.1192 + lb * 0.9505) / 1.08883);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }
  function deltaE2000(lab1, lab2, brightness) {
    const [L1, a1, b1] = lab1;
    const [L2, a2, b2] = lab2;
    const rad2deg = (rad) => rad * 180 / Math.PI;
    const deg2rad = (deg) => deg * Math.PI / 180;
    const hue = (y, x) => y === 0 && x === 0 ? 0 : (rad2deg(Math.atan2(y, x)) + 360) % 360;
    const kL = 1;
    const kC = 1;
    const kH = 1;
    const C1 = Math.sqrt(a1 ** 2 + b1 ** 2);
    const C2 = Math.sqrt(a2 ** 2 + b2 ** 2);
    const avgC = (C1 + C2) / 2;
    const G = 0.5 * (1 - Math.sqrt(avgC ** 7 / (avgC ** 7 + 25 ** 7)));
    const a1p = a1 * (1 + G);
    const a2p = a2 * (1 + G);
    const C1p = Math.sqrt(a1p ** 2 + b1 ** 2);
    const C2p = Math.sqrt(a2p ** 2 + b2 ** 2);
    const h1p = hue(b1, a1p);
    const h2p = hue(b2, a2p);
    const Lp = L2 - L1;
    const Cp = C2p - C1p;
    let hp = 0;
    if (C1p * C2p !== 0) {
      hp = h2p - h1p;
      if (hp > 180)
        hp -= 360;
      else if (hp < -180)
        hp += 360;
    }
    const Hp = 2 * Math.sqrt(C1p * C2p) * Math.sin(deg2rad(hp) / 2);
    const avgLp = (L1 + L2) / 2;
    const avgCp = (C1p + C2p) / 2;
    let avghp = h1p + h2p;
    if (C1p * C2p !== 0) {
      if (Math.abs(h1p - h2p) > 180)
        avghp += avghp < 360 ? 360 : -360;
      avghp /= 2;
    }
    const T = 1 - 0.17 * Math.cos(deg2rad(avghp - 30)) + 0.24 * Math.cos(deg2rad(2 * avghp)) + 0.32 * Math.cos(deg2rad(3 * avghp + 6)) - 0.2 * Math.cos(deg2rad(4 * avghp - 63));
    const SL = 1 + 0.015 * (avgLp - 50) ** 2 / Math.sqrt(20 + (avgLp - 50) ** 2);
    const SC = 1 + 0.045 * avgCp;
    const SH = 1 + 0.015 * avgCp * T;
    const RC = 2 * Math.sqrt(avgCp ** 7 / (avgCp ** 7 + 25 ** 7));
    const RT = -RC * Math.sin(deg2rad(60 * Math.exp(-(((avghp - 275) / 25) ** 2))));
    const dL = Lp / (kL * SL);
    const dC = Cp / (kC * SC);
    const dH = Hp / (kH * SH);
    return Math.sqrt(Math.max(0, dL ** 2 + dC ** 2 + dH ** 2 + RT * dC * dH)) - Lp / 100 * brightness;
  }
  function deltaE94(lab1, lab2, brightness) {
    const [L1, a1, b1] = lab1;
    const [L2, a2, b2] = lab2;
    const dL = L2 - L1;
    const da = a2 - a1;
    const db = b2 - b1;
    const C1 = Math.sqrt(a1 ** 2 + b1 ** 2);
    const dC = Math.sqrt(a2 ** 2 + b2 ** 2) - C1;
    const dH = Math.sqrt(Math.max(0, da ** 2 + db ** 2 - dC ** 2));
    return Math.sqrt(dL ** 2 + (dC / (1 + 0.045 * C1)) ** 2 + (dH / (1 + 0.015 * C1)) ** 2) - dL / 100 * brightness;
  }
  function deltaCompuphase(rgb1, rgb2, brightness) {
    const [r1, g1, b1] = rgb1;
    const [r2, g2, b2] = rgb2;
    const avgR = (r1 + r2) / 2;
    const dr = r1 - r2;
    const dg = g1 - g2;
    const db = b1 - b2;
    return Math.sqrt((2 + avgR / 256) * dr ** 2 + 4 * dg ** 2 + (2 + (255 - avgR) / 256) * db ** 2) - (0.299 * (r2 - r1) + 0.587 * (g2 - g1) + 0.114 * (b2 - b1)) / 255 * brightness;
  }
  function metricFunction(metric) {
    switch (metric) {
      case "ciede2000":
        return deltaE2000;
      case "compuphase":
        return deltaCompuphase;
      case "lab":
        return deltaE94;
    }
  }
  var COLORS_RGB = [
    NaN,
    0,
    3947580,
    7895160,
    13816530,
    16777215,
    6291480,
    15539236,
    16744231,
    16165385,
    16375099,
    16775868,
    964968,
    1304187,
    8912734,
    819566,
    1093286,
    1302974,
    2642078,
    4232164,
    6354930,
    7033078,
    10072571,
    7867545,
    11155641,
    14721017,
    13303930,
    15474560,
    15961513,
    6833716,
    9791530,
    16298615,
    11184810,
    10817054,
    16416882,
    14965786,
    14071188,
    10257457,
    12954929,
    15258719,
    4877114,
    5936202,
    8701299,
    1014175,
    12319474,
    8243199,
    5059000,
    4866692,
    8024516,
    11906801,
    14394467,
    13729873,
    16762277,
    10179145,
    13729912,
    16430756,
    8086354,
    10257515,
    3356993,
    7173517,
    11778513,
    7169087,
    9735275,
    13485470
  ];
  var COLORS_RGB_TRIPLES = COLORS_RGB.map((rgb) => [rgb >> 16, rgb >> 8 & 255, rgb & 255]);
  var COLORS = COLORS_RGB.map((rgb, index) => index === 0 ? [Number.NaN, Number.NaN, Number.NaN] : rgbToLab(rgb >> 16, rgb >> 8 & 255, rgb & 255));
  var COLORS_RGB_MAP = new Map;
  for (let index = 0;index < COLORS_RGB.length; index++)
    COLORS_RGB_MAP.set(COLORS_RGB[index], index);

  // src/ordering.ts
  function strategyPosition(strategy, height, width) {
    const SIZE = width * height;
    const result = new Uint16Array(SIZE * 2);
    let index = 0;
    switch (strategy) {
      case "CONTRAST" /* CONTRAST */:
      case "DOWN" /* DOWN */: {
        for (let y = 0;y < height; y++)
          for (let x = 0;x < width; x++) {
            result[index] = x;
            result[index + 1] = y;
            index += 2;
          }
        break;
      }
      case "UP" /* UP */: {
        for (let y = height - 1;y >= 0; y--)
          for (let x = 0;x < width; x++) {
            result[index] = x;
            result[index + 1] = y;
            index += 2;
          }
        break;
      }
      case "LEFT" /* LEFT */: {
        for (let x = 0;x < width; x++)
          for (let y = 0;y < height; y++) {
            result[index] = x;
            result[index + 1] = y;
            index += 2;
          }
        break;
      }
      case "RIGHT" /* RIGHT */: {
        for (let x = width - 1;x >= 0; x--)
          for (let y = 0;y < height; y++) {
            result[index] = x;
            result[index + 1] = y;
            index += 2;
          }
        break;
      }
      case "RANDOM" /* RANDOM */: {
        for (let y = 0;y < height; y++)
          for (let x = 0;x < width; x++) {
            result[index] = x;
            result[index + 1] = y;
            index += 2;
          }
        for (let index = SIZE - 1;index >= 0; index--) {
          const randIndex = Math.floor(Math.random() * (index + 1)) * 2;
          const realIndex = index * 2;
          const temporaryX = result[realIndex];
          const temporaryY = result[realIndex + 1];
          result[realIndex] = result[randIndex];
          result[realIndex + 1] = result[randIndex + 1];
          result[randIndex] = temporaryX;
          result[randIndex + 1] = temporaryY;
        }
        break;
      }
      case "SPIRAL_FROM_CENTER" /* SPIRAL_FROM_CENTER */:
      case "SPIRAL_TO_CENTER" /* SPIRAL_TO_CENTER */: {
        const reverse = strategy === "SPIRAL_FROM_CENTER" /* SPIRAL_FROM_CENTER */;
        let idx = reverse ? SIZE - 1 : 0;
        const step = reverse ? -1 : 1;
        let top = 0, bottom = height - 1, left = 0, right = width - 1;
        while (top <= bottom && left <= right) {
          for (let x = left;x <= right; x++) {
            result[idx * 2] = x;
            result[idx * 2 + 1] = top;
            idx += step;
          }
          top++;
          for (let y = top;y <= bottom; y++) {
            result[idx * 2] = right;
            result[idx * 2 + 1] = y;
            idx += step;
          }
          right--;
          if (top <= bottom) {
            for (let x = right;x >= left; x--) {
              result[idx * 2] = x;
              result[idx * 2 + 1] = bottom;
              idx += step;
            }
            bottom--;
          }
          if (left <= right) {
            for (let y = bottom;y >= top; y--) {
              result[idx * 2] = left;
              result[idx * 2 + 1] = y;
              idx += step;
            }
            left++;
          }
        }
        break;
      }
    }
    return result;
  }
  function floodOrder(taskPixels, colorAt, width, height, regionOrder, fillDirection) {
    const SIZE = width * height;
    const LENGTH = taskPixels.length;
    const isTask = new Uint8Array(SIZE);
    for (let index = 0;index < LENGTH; index++)
      isTask[taskPixels[index]] = 1;
    const visited = new Uint8Array(SIZE);
    const result = new Uint32Array(LENGTH);
    const queue = new Uint32Array(LENGTH);
    const regionStarts = [];
    const regionLengths = [];
    const member = new Int32Array(SIZE).fill(-1);
    const layered = new Int32Array(SIZE).fill(-1);
    const scratch = new Uint32Array(LENGTH);
    let out = 0;
    for (let index = 0;index < LENGTH; index++) {
      const seed = taskPixels[index];
      if (visited[seed] === 1)
        continue;
      const color = colorAt[seed];
      const start = out;
      const region = regionStarts.length;
      let head = 0;
      let tail = 0;
      queue[tail++] = seed;
      visited[seed] = 1;
      while (head < tail) {
        const pixel = queue[head++];
        result[out++] = pixel;
        member[pixel] = region;
        const x = pixel % width;
        const y = pixel / width | 0;
        if (y > 0) {
          const next = pixel - width;
          if (visited[next] === 0 && isTask[next] === 1 && colorAt[next] === color) {
            visited[next] = 1;
            queue[tail++] = next;
          }
        }
        if (x > 0) {
          const next = pixel - 1;
          if (visited[next] === 0 && isTask[next] === 1 && colorAt[next] === color) {
            visited[next] = 1;
            queue[tail++] = next;
          }
        }
        if (x < width - 1) {
          const next = pixel + 1;
          if (visited[next] === 0 && isTask[next] === 1 && colorAt[next] === color) {
            visited[next] = 1;
            queue[tail++] = next;
          }
        }
        if (y < height - 1) {
          const next = pixel + width;
          if (visited[next] === 0 && isTask[next] === 1 && colorAt[next] === color) {
            visited[next] = 1;
            queue[tail++] = next;
          }
        }
      }
      regionStarts.push(start);
      regionLengths.push(out - start);
      if (fillDirection === "EDGE_IN" /* EDGE_IN */)
        layerRegion(result, scratch, queue, member, layered, region, start, out, width, height);
    }
    if (regionOrder === "IN_ORDER" /* IN_ORDER */)
      return result;
    const order = regionStarts.map((_, index) => index);
    order.sort((a, b) => regionOrder === "LARGEST" /* LARGEST */ ? regionLengths[b] - regionLengths[a] : regionLengths[a] - regionLengths[b]);
    const sorted = new Uint32Array(LENGTH);
    let write = 0;
    for (let index = 0;index < order.length; index++) {
      const region = order[index];
      const start = regionStarts[region];
      const end = start + regionLengths[region];
      for (let read = start;read < end; read++)
        sorted[write++] = result[read];
    }
    return sorted;
  }
  function layerRegion(result, scratch, queue, member, layered, region, start, end, width, height) {
    for (let index = start;index < end; index++)
      scratch[index] = result[index];
    let head = 0;
    let tail = 0;
    for (let index = start;index < end; index++) {
      const pixel = scratch[index];
      const x = pixel % width;
      const y = pixel / width | 0;
      if (y === 0 || member[pixel - width] !== region || x === 0 || member[pixel - 1] !== region || x === width - 1 || member[pixel + 1] !== region || y === height - 1 || member[pixel + width] !== region) {
        layered[pixel] = region;
        queue[tail++] = pixel;
      }
    }
    let write = start;
    while (head < tail) {
      const pixel = queue[head++];
      result[write++] = pixel;
      const x = pixel % width;
      const y = pixel / width | 0;
      if (y > 0) {
        const next = pixel - width;
        if (member[next] === region && layered[next] !== region) {
          layered[next] = region;
          queue[tail++] = next;
        }
      }
      if (x > 0) {
        const next = pixel - 1;
        if (member[next] === region && layered[next] !== region) {
          layered[next] = region;
          queue[tail++] = next;
        }
      }
      if (x < width - 1) {
        const next = pixel + 1;
        if (member[next] === region && layered[next] !== region) {
          layered[next] = region;
          queue[tail++] = next;
        }
      }
      if (y < height - 1) {
        const next = pixel + width;
        if (member[next] === region && layered[next] !== region) {
          layered[next] = region;
          queue[tail++] = next;
        }
      }
    }
  }
  function outlineMask(colorAt, width, height) {
    const mask = new Uint8Array(width * height);
    for (let y = 0;y < height; y++)
      for (let x = 0;x < width; x++) {
        const pixel = y * width + x;
        if (colorAt[pixel] === 0)
          continue;
        mask[pixel] = y === 0 || colorAt[pixel - width] === 0 || x === 0 || colorAt[pixel - 1] === 0 || x === width - 1 || colorAt[pixel + 1] === 0 || y === height - 1 || colorAt[pixel + width] === 0 ? 1 : 0;
      }
    return mask;
  }
  function outlineFirstOrder(taskPixels, outline) {
    const result = new Uint32Array(taskPixels.length);
    let write = 0;
    for (let index = 0;index < taskPixels.length; index++) {
      const pixel = taskPixels[index];
      if (outline[pixel] === 1)
        result[write++] = pixel;
    }
    for (let index = 0;index < taskPixels.length; index++) {
      const pixel = taskPixels[index];
      if (outline[pixel] === 0)
        result[write++] = pixel;
    }
    return result;
  }
  function contrastOrder(taskPixels, colorAt, mapAt, width, height, distance) {
    const SIZE = width * height;
    const LENGTH = taskPixels.length;
    const result = new Uint32Array(LENGTH);
    if (LENGTH === 0)
      return result;
    let maxDistance = 0;
    for (let index = 0;index < distance.length; index++)
      if (distance[index] > maxDistance)
        maxDistance = distance[index];
    const adhesion = maxDistance * 2;
    const canvas = new Uint8Array(SIZE);
    canvas.set(mapAt);
    const painted = new Uint8Array(SIZE);
    const isTask = new Uint8Array(SIZE);
    const rank = new Int32Array(SIZE);
    for (let index = 0;index < LENGTH; index++) {
      isTask[taskPixels[index]] = 1;
      rank[taskPixels[index]] = index;
    }
    function gain(pixel) {
      const row = colorAt[pixel] * 64;
      let score = distance[row + canvas[pixel]];
      const x = pixel % width;
      const y = pixel / width | 0;
      let sum = 0;
      let neighbours = 0;
      let done = 0;
      if (y > 0) {
        const next = pixel - width;
        sum += distance[row + canvas[next]];
        neighbours++;
        done += painted[next];
      }
      if (x > 0) {
        const next = pixel - 1;
        sum += distance[row + canvas[next]];
        neighbours++;
        done += painted[next];
      }
      if (x < width - 1) {
        const next = pixel + 1;
        sum += distance[row + canvas[next]];
        neighbours++;
        done += painted[next];
      }
      if (y < height - 1) {
        const next = pixel + width;
        sum += distance[row + canvas[next]];
        neighbours++;
        done += painted[next];
      }
      if (neighbours !== 0)
        score += sum / neighbours;
      return score + adhesion * done / 4;
    }
    const current = new Float64Array(SIZE);
    const capacity = LENGTH * 5 + 8;
    const heapItem = new Uint32Array(capacity);
    const heapScore = new Float64Array(capacity);
    let heapSize = 0;
    function better(aScore, aItem, bScore, bItem) {
      return aScore === bScore ? rank[aItem] < rank[bItem] : aScore > bScore;
    }
    function push(item, score) {
      let child = heapSize++;
      heapItem[child] = item;
      heapScore[child] = score;
      while (child > 0) {
        const parent = child - 1 >> 1;
        if (!better(heapScore[child], heapItem[child], heapScore[parent], heapItem[parent]))
          break;
        const item2 = heapItem[parent];
        const score2 = heapScore[parent];
        heapItem[parent] = heapItem[child];
        heapScore[parent] = heapScore[child];
        heapItem[child] = item2;
        heapScore[child] = score2;
        child = parent;
      }
    }
    function popRoot() {
      heapSize--;
      heapItem[0] = heapItem[heapSize];
      heapScore[0] = heapScore[heapSize];
      let parent = 0;
      for (;; ) {
        const left = parent * 2 + 1;
        if (left >= heapSize)
          break;
        let best = left;
        const right = left + 1;
        if (right < heapSize && better(heapScore[right], heapItem[right], heapScore[left], heapItem[left]))
          best = right;
        if (!better(heapScore[best], heapItem[best], heapScore[parent], heapItem[parent]))
          break;
        const item2 = heapItem[parent];
        const score2 = heapScore[parent];
        heapItem[parent] = heapItem[best];
        heapScore[parent] = heapScore[best];
        heapItem[best] = item2;
        heapScore[best] = score2;
        parent = best;
      }
    }
    for (let index = 0;index < LENGTH; index++) {
      const pixel = taskPixels[index];
      const score = gain(pixel);
      current[pixel] = score;
      push(pixel, score);
    }
    let out = 0;
    while (out < LENGTH && heapSize > 0) {
      const pixel = heapItem[0];
      const score = heapScore[0];
      popRoot();
      if (painted[pixel] === 1 || score !== current[pixel])
        continue;
      result[out++] = pixel;
      canvas[pixel] = colorAt[pixel];
      painted[pixel] = 1;
      const x = pixel % width;
      const y = pixel / width | 0;
      if (y > 0)
        rescore(pixel - width);
      if (x > 0)
        rescore(pixel - 1);
      if (x < width - 1)
        rescore(pixel + 1);
      if (y < height - 1)
        rescore(pixel + width);
    }
    function rescore(pixel) {
      if (isTask[pixel] === 0 || painted[pixel] === 1)
        return;
      const score = gain(pixel);
      if (score === current[pixel])
        return;
      current[pixel] = score;
      push(pixel, score);
    }
    return result;
  }

  // src/coordinates.ts
  var WORLD_TILE_SIZE = 1000;
  var WORLD_TILES = 2048;
  var WORLD_PIXEL_SIZE = WORLD_TILE_SIZE * WORLD_TILES;

  // src/processing/tiles.ts
  var packTile = (tileX, tileY) => tileX << 11 | tileY;
  var toTile = (n) => n / WORLD_TILE_SIZE | 0;
  var toTilePosition = (n) => n % WORLD_TILE_SIZE;

  // src/processing/pipeline.ts
  function calculatePixels(request, maps, onProgress) {
    const {
      id,
      pixels: realPixels,
      width,
      height,
      unavailableColors,
      colorMetric,
      colors,
      disabledColors,
      drawColorsInOrder,
      strategy,
      regionOrder,
      fillDirection,
      outlineFirst,
      unownedColorStrategy,
      globalX,
      globalY,
      drawTransparentPixels
    } = request;
    validatePixelsRequest(request);
    const SIZE = width * height;
    const pixels = new Uint8Array(realPixels);
    const isSubstitute = unownedColorStrategy === "SUBSTITUTE" /* SUBSTITUTE */;
    const metricFn = metricFunction(colorMetric);
    const palette = colorMetric === "compuphase" ? COLORS_RGB_TRIPLES : COLORS;
    const replacements = new Map;
    const colorStat = new Map;
    let lastProgress = 0;
    for (let index = 0;index < SIZE; index++) {
      const progress = index / SIZE * 75 | 0;
      if (progress !== lastProgress) {
        lastProgress = progress;
        onProgress?.(0.15 + progress / 100);
      }
      const realColor = realPixels[index];
      let color = realColor;
      if (isSubstitute && realColor !== 0 && unavailableColors.has(realColor)) {
        const cached = replacements.get(realColor);
        if (cached !== undefined)
          color = cached;
        else {
          let minDelta = Infinity;
          for (let candidate = 1;candidate < 64; candidate++) {
            if (unavailableColors.has(candidate))
              continue;
            const delta = metricFn(palette[realColor], palette[candidate], 0);
            if (delta < minDelta) {
              minDelta = delta;
              color = candidate;
            }
          }
          if (minDelta === Infinity)
            throw new Error("No available replacement color");
          replacements.set(realColor, color);
        }
        pixels[index] = color;
      }
      const stat = colorStat.get(realColor);
      if (stat)
        stat.amount++;
      else
        colorStat.set(realColor, { color, amount: 1, left: 0, realColor });
    }
    const colorsOrderMap = new Map;
    for (let index = 0;index < colors.length; index++)
      colorsOrderMap.set(colors[index], index);
    const positions = strategyPosition(strategy, height, width);
    const tasks = [];
    const contrast = strategy === "CONTRAST" /* CONTRAST */;
    const floodFill = regionOrder !== "OFF" /* OFF */;
    const reorder = contrast || floodFill || outlineFirst;
    const taskPixels = reorder ? new Uint32Array(SIZE) : undefined;
    const taskOf = reorder ? new Int32Array(SIZE) : undefined;
    const mapAt = contrast ? new Uint8Array(SIZE) : undefined;
    lastProgress = 0;
    for (let index = 0;index < positions.length; index += 2) {
      const progress = index / positions.length * 10 | 0;
      if (progress !== lastProgress) {
        lastProgress = progress;
        onProgress?.(0.9 + progress / 100);
      }
      const dx = positions[index];
      const dy = positions[index + 1];
      const color = pixels[dy * width + dx];
      const gx = globalX + dx;
      const gy = globalY + dy;
      const map = maps.get(packTile(toTile(gx), toTile(gy)));
      const mapColor = map[toTilePosition(gy) * 1000 + toTilePosition(gx)];
      if (contrast)
        mapAt[dy * width + dx] = mapColor ?? 0;
      if (color === mapColor)
        continue;
      const realColor = realPixels[dy * width + dx];
      colorStat.get(realColor).left++;
      if (disabledColors.has(realColor) || unavailableColors.has(color) || !drawTransparentPixels && color === 0)
        continue;
      tasks.push({
        gx,
        gy,
        color,
        realColor
      });
      if (reorder) {
        const pixel = dy * width + dx;
        taskPixels[tasks.length - 1] = pixel;
        taskOf[pixel] = tasks.length - 1;
      }
    }
    let ordered = tasks;
    if (contrast || floodFill) {
      let order = taskPixels.subarray(0, tasks.length);
      if (contrast)
        order = contrastOrder(order, pixels, mapAt, width, height, contrastDistances(colorMetric));
      if (floodFill)
        order = floodOrder(order, pixels, width, height, regionOrder, fillDirection);
      ordered = Array.from({ length: order.length });
      for (let index = 0;index < order.length; index++)
        ordered[index] = tasks[taskOf[order[index]]];
    }
    if (drawColorsInOrder)
      ordered.sort((a, b) => (colorsOrderMap.get(a.realColor) ?? 0) - (colorsOrderMap.get(b.realColor) ?? 0));
    if (outlineFirst) {
      const current = new Uint32Array(ordered.length);
      for (let index = 0;index < ordered.length; index++) {
        const task = ordered[index];
        current[index] = (task.gy - globalY) * width + (task.gx - globalX);
      }
      const order = outlineFirstOrder(current, outlineMask(pixels, width, height));
      const outlined = Array.from({ length: order.length });
      for (let index = 0;index < order.length; index++)
        outlined[index] = tasks[taskOf[order[index]]];
      ordered = outlined;
    }
    const taskPositions = new Uint32Array(ordered.length * 2);
    for (let index = 0;index < ordered.length; index++) {
      const task = ordered[index];
      const dIndex = index * 2;
      taskPositions[dIndex] = task.gx;
      taskPositions[dIndex + 1] = task.gy;
    }
    return {
      id,
      taskPositions,
      colorStat,
      pixels
    };
  }
  function validatePixelsRequest(request) {
    const { pixels, width, height } = request;
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || !(pixels instanceof Uint8Array) || pixels.length !== width * height)
      throw new Error("Template pixel dimensions do not match its indexed image");
    for (let index = 0;index < pixels.length; index++)
      if (pixels[index] >= 64)
        throw new Error("Template contains an invalid palette index");
  }
  function contrastDistances(colorMetric) {
    const metricFn = metricFunction(colorMetric);
    const palette = colorMetric === "compuphase" ? COLORS_RGB_TRIPLES : COLORS;
    const table = new Float64Array(64 * 64);
    let max = 0;
    for (let a = 1;a < 64; a++)
      for (let b = 1;b < 64; b++) {
        const delta = metricFn(palette[a], palette[b], 0);
        table[a * 64 + b] = delta;
        if (delta > max)
          max = delta;
      }
    for (let index = 1;index < 64; index++) {
      table[index] = max;
      table[index * 64] = max;
    }
    return table;
  }

  // src/processing/tile-cache.ts
  async function fetchTile(tileX, tileY) {
    const response = await fetch(\`https://backend.wplace.live/files/s0/tiles/\${tileX}/\${tileY}.png\`);
    const bitmap = await createImageBitmap(await response.blob());
    try {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0);
      const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
      const pixels = new Uint8Array(bitmap.height * bitmap.width);
      for (let i = 0, pi = 0;i < data.length; i += 4, pi++) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        const key = r << 16 | g << 8 | b;
        pixels[pi] = a < 100 ? 0 : COLORS_RGB_MAP.get(key) ?? 0;
      }
      return pixels;
    } finally {
      bitmap.close();
    }
  }

  class TileCache {
    loadTile;
    tiles = new Map;
    constructor(loadTile = fetchTile) {
      this.loadTile = loadTile;
    }
    async load(globalX, globalY, width, height, progress) {
      const missing = [];
      const tileXEnd = toTile(globalX + width);
      const tileYStart = toTile(globalY);
      const tileYEnd = toTile(globalY + height);
      for (let tileX = toTile(globalX);tileX <= tileXEnd; tileX++)
        for (let tileY = tileYStart;tileY <= tileYEnd; tileY++)
          if (!this.tiles.has(packTile(tileX, tileY)))
            missing.push([tileX, tileY]);
      let done = 0;
      await Promise.all(missing.map(async ([tileX, tileY]) => {
        this.tiles.set(packTile(tileX, tileY), await this.loadTile(tileX, tileY));
        done++;
        progress?.(done / missing.length * 0.1);
      }));
      return this.tiles;
    }
    clear() {
      this.tiles.clear();
    }
  }

  // src/worker.ts
  var tiles = new TileCache;
  function send(response, transfer = []) {
    postMessage(response, transfer);
  }
  self.onmessage = async (e) => {
    if (e.data === "CLEAR_MAP_CACHE") {
      tiles.clear();
      return;
    }
    const request = e.data;
    const progress = (p) => {
      send({ id: request.id, progress: p });
    };
    try {
      validatePixelsRequest(request);
      const maps = await tiles.load(request.globalX, request.globalY, request.width, request.height, progress);
      const result = calculatePixels(request, maps, progress);
      send(result, [result.taskPositions.buffer, result.pixels.buffer]);
    } catch (error) {
      send({
        id: request.id,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };
})();
`], { type: "application/javascript" })), {
  type: "module"
});
var pending = new Map;
var nextId = 0;
worker.onmessage = (e) => {
  const data = pending.get(e.data.id);
  if (!data)
    return;
  if ("progress" in e.data)
    data.progress?.(e.data.progress);
  else {
    pending.delete(e.data.id);
    if ("error" in e.data)
      data.reject(new Error(e.data.error));
    else
      data.resolve(e.data);
  }
};
function rejectAll(message) {
  for (const request of pending.values())
    request.reject(new Error(message));
  pending.clear();
}
worker.onerror = (e) => {
  console.error("[WORKER ERRROR]", e);
  rejectAll(e.message || "Worker failed");
};
worker.onmessageerror = (e) => {
  console.error("[WORKER MESSAGE ERRROR]", e);
  rejectAll("Worker message could not be read");
};
function workerPixels(request, progress) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, progress, reject });
    worker.postMessage({ ...request, id });
  });
}
function workerClearMapCache() {
  worker.postMessage("CLEAR_MAP_CACHE");
}

// src/site/projection.ts
function toViewportPosition(map, globalX, globalY) {
  const point = map.project([
    worldToLongitude(globalX),
    worldToLatitude(globalY)
  ]);
  const rect = map.getCanvas().getBoundingClientRect();
  return { x: point.x + rect.left, y: point.y + rect.top };
}
function fromViewportPosition(map, point) {
  const rect = map.getCanvas().getBoundingClientRect();
  const position = map.unproject([point.x - rect.left, point.y - rect.top]);
  return {
    globalX: longitudeToWorld(position.lng),
    globalY: latitudeToWorld(position.lat)
  };
}

// src/world-position.ts
class WorldPosition {
  bot;
  static fromJSON(bot, data) {
    return new WorldPosition(bot, ...data);
  }
  static fromScreenPosition(bot, position) {
    const { globalX, globalY } = fromViewportPosition(bot.map, position);
    return new WorldPosition(bot, globalX | 0, globalY | 0);
  }
  globalX = 0;
  globalY = 0;
  get tileX() {
    return this.globalX / WORLD_TILE_SIZE | 0;
  }
  set tileX(value) {
    this.globalX = value * WORLD_TILE_SIZE + this.x;
  }
  get tileY() {
    return this.globalY / WORLD_TILE_SIZE | 0;
  }
  set tileY(value) {
    this.globalY = value * WORLD_TILE_SIZE + this.y;
  }
  get x() {
    return this.globalX % WORLD_TILE_SIZE;
  }
  set x(value) {
    this.globalX = this.tileX * WORLD_TILE_SIZE + value;
  }
  get y() {
    return this.globalY % WORLD_TILE_SIZE;
  }
  set y(value) {
    this.globalY = this.tileY * WORLD_TILE_SIZE + value;
  }
  get pixelSize() {
    return pixelSizeForZoom(this.bot.map.getZoom());
  }
  constructor(bot, tileorGlobalX, tileorGlobalY, x, y) {
    this.bot = bot;
    if (x === undefined || y === undefined) {
      this.globalX = tileorGlobalX;
      this.globalY = tileorGlobalY;
    } else {
      this.globalX = tileorGlobalX * WORLD_TILE_SIZE + x;
      this.globalY = tileorGlobalY * WORLD_TILE_SIZE + y;
    }
  }
  toScreenPosition() {
    return toViewportPosition(this.bot.map, this.globalX, this.globalY);
  }
  moveScreenTo(width, height) {
    const canvas = this.bot.map.getCanvas().getBoundingClientRect();
    const pixelSize = Math.min(canvas.width * 0.8 / Math.max(1, width), canvas.height * 0.8 / Math.max(1, height));
    this.bot.map.jumpTo({
      center: [
        worldToLongitude(this.globalX + width / 2),
        worldToLatitude(this.globalY + height / 2)
      ],
      zoom: zoomForPixelSize(pixelSize)
    });
  }
  clone() {
    return new WorldPosition(this.bot, this.tileX, this.tileY, this.x, this.y);
  }
  toJSON() {
    return [this.globalX, this.globalY];
  }
}

// src/image.ts
function etaText(bot, remaining, cashbackPixels) {
  const cooldownMs = bot.me?.charges.cooldownMs ?? 30000;
  const minutes = estimateEtaMinutes(remaining, bot.me?.charges.count ?? 0, bot.me?.charges.max ?? 0, cooldownMs, bot.lastMeAt === undefined ? 0 : Date.now() - bot.lastMeAt, bot.spendsOnCharges ? bot.me?.droplets ?? 0 : undefined, bot.colorsToBuy().length, cashbackPixels);
  return formatEta(minutes);
}

class BotImage extends Base2 {
  bot;
  template;
  pixels = new Uint8Array(0);
  colorsStat = new Map;
  error;
  tasks = new Uint32Array(0);
  thumbnail = document.createElement("canvas");
  position;
  controller;
  element = document.createElement("div");
  context;
  $colors;
  $drawColorsInOrder;
  $drawTransparent;
  $progressLine;
  $progressText;
  $strategy;
  $name;
  $unownedColorStrategyLabel;
  $unownedColorStrategy;
  $outlineFirst;
  $regionOrderLabel;
  $regionOrder;
  $fillDirectionLabel;
  $fillDirection;
  $sortColorsDesc;
  $sortColorsAsc;
  $dialog;
  constructor(bot, template, overrides = {}) {
    super();
    this.bot = bot;
    this.template = template;
    this.position = new WorldPosition(bot, ...template.position);
    this.controller = new ImageController(createImageSettings(overrides), {
      calculate: (progress) => this.calculate(progress),
      apply: (calculation, progress) => {
        this.applyCalculation(calculation, progress);
      },
      save: () => save(this.bot)
    });
    this.element.innerHTML = obfucsateHTML(image_default);
    addClass(this.element, "image");
    document.body.append(this.element);
    this.populateElementsWithSelector(this.element, {
      $colors: ".colors",
      $drawColorsInOrder: ".draw-colors-in-order",
      $drawTransparent: ".draw-transparent",
      $progressLine: ".progress div",
      $progressText: ".progress span",
      $strategy: ".strategy",
      $name: ".name",
      $unownedColorStrategyLabel: ".unowned-color-strategy",
      $outlineFirst: ".outline-first",
      $regionOrderLabel: ".region-order",
      $fillDirectionLabel: ".fill-direction",
      $sortColorsDesc: ".sort-colors-desc",
      $sortColorsAsc: ".sort-colors-asc",
      $dialog: "dialog"
    });
    this.context = this.thumbnail.getContext("2d");
    this.$unownedColorStrategy = this.$unownedColorStrategyLabel.querySelector("select");
    this.$regionOrder = this.$regionOrderLabel.querySelector("select");
    this.$fillDirection = this.$fillDirectionLabel.querySelector("select");
    this.$dialog.addEventListener("click", (event) => {
      if (event.target === this.$dialog)
        this.$dialog.close();
    });
    this.$unownedColorStrategy.addEventListener("change", () => {
      this.update({
        unownedColorStrategy: this.$unownedColorStrategy.value
      });
    });
    this.$strategy.addEventListener("change", () => {
      this.update({ strategy: this.$strategy.value });
    });
    this.$regionOrder.addEventListener("change", () => {
      this.update({
        regionOrder: this.$regionOrder.value
      });
    });
    this.$fillDirection.addEventListener("change", () => {
      this.update({
        fillDirection: this.$fillDirection.value
      });
    });
    this.$outlineFirst.addEventListener("click", () => {
      this.update({ outlineFirst: this.$outlineFirst.checked });
    });
    const sortColors = (ascending) => {
      const amounts = new Map;
      for (const stat of this.colorsStat.values())
        amounts.set(stat.realColor, stat.amount);
      return this.update({
        colors: sortColorsByAmount(this.colors, amounts, ascending)
      });
    };
    this.$sortColorsDesc.addEventListener("click", () => void sortColors(false));
    this.$sortColorsAsc.addEventListener("click", () => void sortColors(true));
    this.$drawTransparent.addEventListener("click", () => {
      this.update({
        drawTransparentPixels: this.$drawTransparent.checked
      });
    });
    this.$drawColorsInOrder.addEventListener("click", () => {
      this.update({ drawColorsInOrder: this.$drawColorsInOrder.checked });
    });
    this.updateUI();
  }
  get wplaceId() {
    return this.template.id;
  }
  get name() {
    return this.template.name;
  }
  get width() {
    return this.template.width;
  }
  get height() {
    return this.template.height;
  }
  get visible() {
    return !this.disabled && this.template.visible && !this.error;
  }
  get strategy() {
    return this.controller.settings.strategy;
  }
  get drawTransparentPixels() {
    return this.controller.settings.drawTransparentPixels;
  }
  get drawColorsInOrder() {
    return this.controller.settings.drawColorsInOrder;
  }
  get colors() {
    return this.controller.settings.colors;
  }
  get disabledColors() {
    return this.controller.settings.disabledColors;
  }
  get disabled() {
    return this.controller.settings.disabled;
  }
  get unownedColorStrategy() {
    return this.controller.settings.unownedColorStrategy;
  }
  get regionOrder() {
    return this.controller.settings.regionOrder;
  }
  get fillDirection() {
    return this.controller.settings.fillDirection;
  }
  get outlineFirst() {
    return this.controller.settings.outlineFirst;
  }
  openSettings() {
    this.updateUI();
    this.$dialog.showModal();
  }
  async update(changes) {
    await this.guarded(() => this.controller.update(changes));
    this.bot.widget.update();
  }
  toJSON() {
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
      outlineFirst: this.outlineFirst
    };
  }
  async applyTemplate(template) {
    const previous = this.template;
    this.template = template;
    if (template.contentKey === previous.contentKey) {
      if (template.name !== previous.name)
        this.updateUI();
      return template.revision !== previous.revision;
    }
    this.position = new WorldPosition(this.bot, ...template.position);
    await this.updatePixels();
    return true;
  }
  updatePixels(progress) {
    return this.guarded(() => this.controller.recompute(progress));
  }
  async guarded(run) {
    try {
      await run();
      this.error = undefined;
    } catch (error) {
      console.error(error);
      this.error = error instanceof Error ? error.message : String(error);
      this.tasks = new Uint32Array(0);
    }
    this.updateUI();
  }
  async calculate(progress) {
    const { template } = this;
    const templates = this.bot.templates;
    if (!templates)
      throw new Error("Wplace templates are unavailable");
    const pixels = await templates.pixels(template, this.bot.unavailableColors);
    const result = await workerPixels({
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
      unownedColorStrategy: this.unownedColorStrategy
    }, progress ?? ((p) => {
      this.bot.widget.status = `⌛ Loading ${formatPercent(p)}`;
    }));
    return { result, template };
  }
  applyCalculation({ result, template }, progress) {
    const { width, height } = template;
    this.colorsStat = result.colorStat;
    this.tasks = this.visible ? result.taskPositions : new Uint32Array(0);
    this.bot.fetchTileCountries([this]).then((learned) => {
      if (learned)
        this.bot.widget.updateProgress();
    });
    this.pixels = result.pixels;
    this.thumbnail.width = width;
    this.thumbnail.height = height;
    this.context.clearRect(0, 0, width, height);
    const rgbPixels = new Uint8ClampedArray(this.pixels.length * 4);
    for (let index = 0;index < this.pixels.length; index++) {
      const pixel = this.pixels[index];
      if (pixel === 0)
        continue;
      const qIndex = index * 4;
      const color = COLORS_RGB[pixel];
      rgbPixels[qIndex] = color >> 16;
      rgbPixels[qIndex + 1] = color >> 8 & 255;
      rgbPixels[qIndex + 2] = color & 255;
      rgbPixels[qIndex + 3] = 255;
    }
    this.context.putImageData(new ImageData(rgbPixels, width, height), 0, 0);
    this.updateUI();
    this.updateColors();
    if (!progress)
      this.bot.widget.status = "";
    this.bot.widget.update();
  }
  updateUI() {
    this.$name.textContent = this.name;
    this.$strategy.value = this.strategy;
    this.$unownedColorStrategy.value = this.unownedColorStrategy;
    this.$drawTransparent.checked = this.drawTransparentPixels;
    this.$drawColorsInOrder.checked = this.drawColorsInOrder;
    this.$outlineFirst.checked = this.outlineFirst;
    this.$regionOrder.value = this.regionOrder;
    this.$fillDirection.value = this.fillDirection;
    if (this.regionOrder === "OFF" /* OFF */)
      addClass(this.$fillDirectionLabel, "hidden");
    else
      removeClass(this.$fillDirectionLabel, "hidden");
    this.updateProgress();
  }
  get countedPixels() {
    const total = this.width * this.height;
    if (this.drawTransparentPixels)
      return total;
    return total - (this.colorsStat.get(0)?.amount ?? 0);
  }
  get progress() {
    const total = this.countedPixels;
    const done = total - this.tasks.length / 2;
    return { done, total, percent: total ? done / total : 0 };
  }
  updateProgress() {
    const { done, total, percent } = this.progress;
    this.$progressText.textContent = this.error ? `❌ ${this.error}` : `${done}/${total} ${formatPercent(percent)} ETA: ${etaText(this.bot, this.tasks.length / 2, this.bot.cashbackTasks(this))}`;
    this.$progressLine.style.transform = `scaleX(${this.error ? 0 : percent})`;
  }
  destroy() {
    this.controller.dispose();
    super.destroy();
    this.element.remove();
    removeFromArray(this.bot.images, this);
  }
  updateColors() {
    const LINE_HEIGHT = 20;
    if (this.bot.unavailableColors.size === 0)
      addClass(this.$unownedColorStrategyLabel, "hidden");
    this.$colors.innerHTML = "";
    let pixelsSum = 0;
    for (const stat of this.colorsStat.values())
      if (this.drawTransparentPixels || stat.realColor !== 0)
        pixelsSum += stat.amount;
    if (this.colors.length !== this.colorsStat.size || this.colors.some((x) => !this.colorsStat.has(x))) {
      this.controller.settings.colors = this.colorsStat.values().toArray().sort((a, b) => b.amount - a.amount).map((color) => color.realColor);
      save(this.bot);
    }
    this.$colors.style.height = `${LINE_HEIGHT * this.colors.length}px`;
    for (let index = 0;index < this.colors.length; index++) {
      const drawColor = this.colors[index];
      if (!this.drawTransparentPixels && drawColor === 0)
        continue;
      const css = (color) => color === 0 ? `repeating-linear-gradient(32deg, #ccc 0 8px, transparent 8px 16px)` : colorToCSS(color);
      const colorStat = this.colorsStat.get(drawColor);
      const $button = document.createElement("button");
      if (COLORS[drawColor][0] < 60)
        addClass($button, "dark");
      $button.title = "Drag to reorder. Click to disable.";
      $button.style.top = `${index * LINE_HEIGHT}px`;
      if (this.disabledColors.has(drawColor)) {
        const $warning = document.createElement("div");
        $warning.innerText = "❌";
        $warning.title = "Disabled and will be skipped.";
        $button.appendChild($warning);
      }
      switch (this.unownedColorStrategy) {
        case "SUBSTITUTE" /* SUBSTITUTE */:
          $button.style.background = css(colorStat.color);
          if (colorStat.color !== colorStat.realColor) {
            const $warning = document.createElement("button");
            $warning.style.backgroundColor = css(colorStat.realColor);
            $warning.title = "This is the best color. Click to buy.";
            $warning.addEventListener("click", async () => {
              await this.bot.updateColorsData();
              document.getElementById("color-" + colorStat.realColor)?.click();
            });
            $button.appendChild($warning);
          }
          break;
        case "BUY" /* BUY */:
          $button.style.background = css(colorStat.realColor);
          if (this.bot.unavailableColors.has(colorStat.realColor)) {
            const $warning = document.createElement("div");
            $warning.innerText = "⌛";
            $warning.title = "This color be automatically bought.";
            $button.appendChild($warning);
          }
          break;
        case "SKIP" /* SKIP */:
          $button.style.background = css(colorStat.realColor);
          if (this.bot.unavailableColors.has(colorStat.realColor)) {
            const $warning = document.createElement("div");
            $warning.innerText = "⏩";
            $warning.title = "Unowned colors will be skipped.";
            $button.appendChild($warning);
          }
          break;
      }
      const $percent = document.createElement("span");
      addClass($percent, "percent");
      const donePixels = colorStat.amount - colorStat.left;
      const donePercent = donePixels / colorStat.amount;
      const share = colorStat.amount / pixelsSum;
      $percent.innerText = `${donePixels}/${colorStat.amount}px ${formatPercent(donePercent)} (${formatPercent(share)})`;
      $percent.title = "Pixels drawn / total, drawn % (% of the image)";
      $button.appendChild($percent);
      this.$colors.append($button);
      let dragging = false;
      const startDrag = (startEvent) => {
        addClass($button, "dragging");
        dragging = false;
        let newIndex = index;
        const mouseMoveHandler = (event) => {
          newIndex = Math.min(this.colors.length - 1, Math.max(0, Math.round(index + (event.clientY - startEvent.clientY) / LINE_HEIGHT)));
          if (newIndex !== index)
            dragging = true;
          let childIndex = 0;
          for (const $child of this.$colors.children) {
            if ($child === $button)
              continue;
            if (childIndex === newIndex)
              childIndex++;
            $child.style.top = `${LINE_HEIGHT * childIndex}px`;
            childIndex++;
          }
          $button.style.top = `${LINE_HEIGHT * newIndex}px`;
        };
        document.addEventListener("mousemove", mouseMoveHandler, {
          passive: true
        });
        document.addEventListener("mouseup", () => {
          removeClass($button, "dragging");
          document.removeEventListener("mousemove", mouseMoveHandler);
          if (newIndex === index)
            return;
          const colors = [...this.colors];
          colors.splice(newIndex, 0, ...colors.splice(index, 1));
          setTimeout(() => {
            this.update({ colors });
          }, 200);
        }, { once: true, passive: true });
      };
      $button.addEventListener("mousedown", startDrag);
      $button.addEventListener("click", (event) => {
        event.stopPropagation();
        if (dragging)
          return;
        const disabledColors = new Set(this.disabledColors);
        if (disabledColors.has(drawColor))
          disabledColors.delete(drawColor);
        else
          disabledColors.add(drawColor);
        toggleClass($button, "color-disabled");
        this.update({ disabledColors });
      });
    }
  }
}

// src/map.ts
var CHUNK_PREFIX = `${location.origin}/_app/immutable/`;
var chunkUrls = new Set;
new PerformanceObserver((list) => {
  const entries = list.getEntries();
  for (let index = 0;index < entries.length; index++) {
    const { name } = entries[index];
    if (name.startsWith(CHUNK_PREFIX) && name.endsWith(".js"))
      chunkUrls.add(name);
  }
}).observe({ buffered: true, type: "resource" });
function loadedChunkUrls() {
  return [...chunkUrls];
}
var store;
function isStore(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) && "automatedClicks" in value && "map" in value;
}
async function findStore() {
  for (const url of chunkUrls) {
    let module;
    try {
      module = await import(url);
    } catch {
      continue;
    }
    const keys = Object.keys(module);
    for (let index = 0;index < keys.length; index++) {
      let value;
      try {
        value = module[keys[index]];
      } catch {
        continue;
      }
      if (isStore(value))
        return value;
    }
  }
  return;
}
async function findMap(bot, timeoutMs = 60000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    store ??= await findStore();
    if (store?.map)
      return store.map;
    await wait(100);
  }
  throw new NoMapError(bot);
}

// src/site/template-data.ts
function parseSiteTemplates(raw) {
  if (!Array.isArray(raw))
    throw new Error("Wplace template list is unreadable");
  const result = [];
  const ids = new Set;
  for (const value of raw) {
    if (!value || typeof value !== "object")
      throw new Error("Wplace template metadata is unreadable");
    const item = value;
    if (item.serverManaged || item.hasPlaced === false)
      continue;
    const { id, name, bounds } = item;
    if (typeof id !== "string" || !id || ids.has(id) || typeof name !== "string" || !bounds || ![bounds.west, bounds.east, bounds.north, bounds.south].every((n) => typeof n === "number" && Number.isFinite(n)))
      throw new Error("Wplace template metadata is unreadable");
    ids.add(id);
    const x1 = Math.round(longitudeToWorld(bounds.west));
    const x2 = Math.round(longitudeToWorld(bounds.east));
    const y1 = Math.round(latitudeToWorld(bounds.north));
    const y2 = Math.round(latitudeToWorld(bounds.south));
    const metric = item.colorMetric ?? "lab";
    const mode = item.colorPaletteMode ?? "all";
    if (!["lab", "ciede2000", "compuphase"].includes(metric) || !["all", "free", "template", "unlocked"].includes(mode))
      throw new Error("Unsupported Wplace template color settings");
    const palette = item.templateColorIdxs;
    if (palette !== undefined && (!Array.isArray(palette) || palette.some((n) => typeof n !== "number" || !Number.isInteger(n) || n < 1 || n >= COLORS_RGB.length)))
      throw new Error("Unsupported Wplace template palette");
    const template = {
      id,
      name,
      position: [Math.min(x1, x2), Math.min(y1, y2)],
      width: Math.max(1, Math.abs(x2 - x1)),
      height: Math.max(1, Math.abs(y2 - y1)),
      visible: item.visible !== false,
      colorMetric: metric,
      dithering: item.dithering === true,
      useLegacyColors: item.useLegacyColors === true,
      colorPaletteMode: mode,
      templateColorIdxs: palette,
      revision: "",
      contentKey: ""
    };
    if (!Number.isSafeInteger(template.width * template.height) || !template.position.every(Number.isFinite))
      throw new Error("Wplace template bounds are unreadable");
    template.revision = JSON.stringify([template, item.updatedAt ?? null]);
    template.contentKey = JSON.stringify([
      template.position,
      template.width,
      template.height,
      template.visible,
      template.colorMetric,
      template.dithering,
      template.colorPaletteMode,
      template.templateColorIdxs ?? null,
      item.updatedAt ?? null
    ]);
    result.push(template);
  }
  return result;
}
function allowedTemplateColors(template, unavailable) {
  switch (template.colorPaletteMode) {
    case "free":
      return Array.from({ length: 31 }, (_, i) => i + 1);
    case "unlocked":
      return Array.from({ length: COLORS_RGB.length - 1 }, (_, i) => i + 1).filter((i) => !unavailable.has(i));
    case "template":
    case "all":
      return;
  }
}
var paletteIndices = new Map(COLORS_RGB.map((rgb, index) => [rgb, index]));
function indexTemplatePixels(data, width, height) {
  if (data.length !== width * height * 4)
    throw new Error("Invalid Wplace pixel dimensions");
  const pixels = new Uint8Array(width * height);
  for (let i = 0;i < pixels.length; i++) {
    const offset = i * 4;
    if (data[offset + 3] < 16)
      continue;
    const index = paletteIndices.get(data[offset] << 16 | data[offset + 1] << 8 | data[offset + 2]);
    if (index === undefined || index === 0)
      throw new Error("Wplace returned an unsupported palette color");
    pixels[i] = index;
  }
  return pixels;
}
function usedPaletteIndices(data) {
  const used = new Set;
  for (let offset = 0;offset < data.length; offset += 4) {
    if (data[offset + 3] < 16)
      continue;
    const index = paletteIndices.get(data[offset] << 16 | data[offset + 1] << 8 | data[offset + 2]);
    if (index)
      used.add(index);
  }
  return [...used].sort((a, b) => a - b);
}
function planTemplateSync(imageIds, savedIds, templates) {
  const present = new Set(templates.map((template) => template.id));
  const shown = new Set(imageIds);
  const saved = new Set(savedIds);
  return {
    remove: imageIds.filter((id) => !present.has(id)),
    create: [
      ...savedIds.filter((id) => present.has(id) && !shown.has(id)),
      ...templates.map((template) => template.id).filter((id) => !shown.has(id) && !saved.has(id))
    ]
  };
}

// src/site/template-runtime.ts
function matchingExport(module, test) {
  const matches = Object.values(module).filter((value) => typeof value === "function" && test(Function.prototype.toString.call(value)));
  if (matches.length !== 1)
    throw new Error("Wplace template functions are incompatible; reload after updating the bot");
  return matches[0];
}
function resolveTemplateRuntime(storeModule, imageModule, resizeModule) {
  const stores = Object.values(storeModule).filter((value) => {
    if (!value || typeof value !== "object")
      return false;
    const store = value;
    return Array.isArray(store.templates) && typeof store.subscribeChange === "function";
  });
  if (stores.length !== 1)
    throw new Error("Wplace template store is unavailable");
  return {
    store: stores[0],
    decode: matchingExport(imageModule, (s) => s.includes("getImageData") && s.includes(".arrayBuffer(") && s.includes("finally")),
    quantize: matchingExport(imageModule, (s) => /^function\s*\*/.test(s) && s.includes("Float32Array") && s.includes("7/16")),
    subscribeImage: matchingExport(imageModule, (s) => s.length < 250 && s.includes(".add(") && s.includes(".delete(") && !s.includes("try")),
    resize: matchingExport(resizeModule, (s) => s.includes("copyWithin") && s.includes("timeSliceMs") && s.includes(".signal"))
  };
}
function referencedChunks(source, base) {
  const result = new Set;
  for (const match of source.matchAll(/["'`]((?:\.\.\/|\.\/)?(?:chunks\/|nodes\/)?[\w.-]+\.js)["'`]/g)) {
    const url = new URL(match[1], base);
    if (url.origin === new URL(base).origin && url.pathname.startsWith("/_app/immutable/"))
      result.add(url.href);
  }
  return [...result];
}
async function discoverTemplateRuntime(initialUrls) {
  const pending = [...new Set(initialUrls)];
  const seen = new Set(pending);
  let storeUrl;
  let imageUrl;
  let resizeUrl;
  for (let offset = 0;offset < pending.length && offset < 600; offset += 8) {
    await Promise.all(pending.slice(offset, offset + 8).map(async (url) => {
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(1e4)
        });
        if (!response.ok)
          return;
        const source = await response.text();
        if (source.includes("template-overlays") && source.includes("subscribeChange"))
          storeUrl = url;
        if (source.includes("wplace-templates") && source.includes("Template blob change listener failed."))
          imageUrl = url;
        if (source.includes("Image resize aborted.") && source.includes("timeSliceMs"))
          resizeUrl = url;
        for (const dependency of referencedChunks(source, url))
          if (!seen.has(dependency)) {
            seen.add(dependency);
            pending.push(dependency);
          }
      } catch {}
    }));
    if (storeUrl && imageUrl && resizeUrl) {
      const [storeModule, imageModule, resizeModule] = await Promise.all([
        import(storeUrl),
        import(imageUrl),
        import(resizeUrl)
      ]);
      return resolveTemplateRuntime(storeModule, imageModule, resizeModule);
    }
  }
  throw new Error("Wplace template integration is unavailable; reload after updating the bot");
}

// src/site/templates.ts
var TEMPLATES_DB = "wplace-templates";
var TEMPLATES_STORE = "images";
var SLICE_MS = 12;
function openSiteDatabase() {
  return new Promise((resolve) => {
    const request = indexedDB.open(TEMPLATES_DB);
    request.onupgradeneeded = () => {
      request.transaction?.abort();
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      resolve(undefined);
    };
  });
}
async function readSourceBlob(id) {
  const db = await openSiteDatabase();
  if (!db?.objectStoreNames.contains(TEMPLATES_STORE)) {
    db?.close();
    return;
  }
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(TEMPLATES_STORE, "readonly").objectStore(TEMPLATES_STORE).get(id);
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        reject(request.error ?? new Error("Wplace template image is unreadable"));
      };
    });
  } finally {
    db.close();
  }
}

class SiteTemplates {
  runtime;
  static async connect() {
    return new SiteTemplates(await discoverTemplateRuntime(loadedChunkUrls()));
  }
  constructor(runtime) {
    this.runtime = runtime;
  }
  list() {
    return parseSiteTemplates(this.runtime.store.templates);
  }
  subscribe(listener) {
    const unsubscribers = [
      this.runtime.store.subscribeChange(listener),
      this.runtime.subscribeImage(listener)
    ];
    return () => {
      for (const unsubscribe of unsubscribers)
        unsubscribe();
    };
  }
  async pixels(template, unavailableColors, signal) {
    const blob = await readSourceBlob(template.id);
    if (!blob)
      throw new Error("Wplace template image is missing");
    const source = await this.runtime.decode(blob);
    const { colorMetric, dithering } = template;
    let allowed = allowedTemplateColors(template, unavailableColors);
    if (template.colorPaletteMode === "template") {
      const probe = new ImageData(new Uint8ClampedArray(source.data), source.width, source.height);
      await this.quantize(probe, colorMetric, false, undefined);
      allowed = usedPaletteIndices(probe.data);
    }
    const scaled = await this.runtime.resize(source, template.width, template.height, { signal });
    await this.quantize(scaled, colorMetric, dithering, allowed);
    signal?.throwIfAborted();
    return indexTemplatePixels(scaled.data, scaled.width, scaled.height);
  }
  async quantize(image, metric, dithering, allowed) {
    const rows = this.runtime.quantize(image.data, image.width, image.height, metric, dithering, allowed, new Map);
    let sliceStart = performance.now();
    while (!rows.next().done)
      if (performance.now() - sliceStart >= SLICE_MS) {
        await wait(0);
        sliceStart = performance.now();
      }
  }
}

// src/style.css
var style_default = `/* stylelint-disable declaration-no-important */
/* stylelint-disable plugin/no-low-performance-animation-properties */
/* stylelint-disable no-descending-specificity */
@import 'https://fonts.googleapis.com/css2?family=Tiny5&display=swap';

:root {
  --text-invert: #fff;
  --text: #422e2c;
  --background: #fbe3cb;
  --background-hover: #f0d1b3;
  --background-disabled: #a37648;
  --main: #66bbb4;
  --main-hover: #48a19a;
}

/** LOCAL STYLES */

/** Widget */
.widget {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  width: 256px;
  height: 100dvh;
  border-right: var(--text) 2px solid;
  background-color: var(--background);
  color: var(--text);
  transition: transform 0.5s;
  transform: translateX(-100%);
}

.widget * {
  font-family: 'Tiny5', sans-serif;
}

.widget .title {
  display: block;
  width: 100%;
  border: none;
  border-bottom: var(--text) 2px solid;
  background-color: var(--main);
  color: var(--text);
  font-size: 32px;
  text-align: center;
}

.widget.open .open-button div {
  transform: rotate(180deg);
}

.widget.open {
  box-shadow: 8px 0 16px -8px var(--main);
  transform: translateX(0);
}

.widget .open-button div {
  transition: transform 0.5s;
}

.widget .open-button {
  position: absolute;
  top: calc(50% - 24px);
  right: -24px;
  width: 24px;
  height: 48px;
  border: var(--text) 2px solid;
  border-left: none;
  background-color: var(--background);
  color: var(--text);
  cursor: pointer;
}

.widget .images {
  display: block;
}

.widget .images .item {
  display: grid;
  grid-template-areas:
    'canvas name name settings'
    'canvas progress progress progress'
    'canvas toggle up down';
  grid-template-columns: 48px minmax(0, 1fr) 32px 32px;
  gap: 4px;
  width: 100%;
  min-height: 72px;
  margin-bottom: 8px;
  padding: 4px 4px 8px;
  border-top: var(--text) 2px solid;
}

.widget .images .item canvas {
  grid-area: canvas;
  image-rendering: pixelated;
  margin-right: 4px;
  cursor: pointer;
}

.widget .images .item .name {
  grid-area: name;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.widget .images .item .item-progress {
  grid-area: progress;
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.widget .images .item .toggle {
  display: flex;
  grid-area: toggle;
  gap: 4px;
  justify-content: flex-start;
  align-items: center;
  min-width: 0;
  font-size: 16px;
}

.widget .images .item .up {
  grid-area: up;
  font-weight: bolder;
  font-size: 24px;
  line-height: 100%;
}

.widget .images .item .down {
  grid-area: down;
  font-weight: bolder;
  font-size: 24px;
  line-height: 100%;
}

.widget .images .item .settings {
  grid-area: settings;
  width: 32px;
}

.widget .hint {
  font-size: 14px;
}

/** Image */
.image * {
  font-family: 'Tiny5', sans-serif;
}

dialog.form {
  width: clamp(256px, 60vh, 512px);
  height: 60vh;
  margin: auto;
  border: var(--text) 2px solid;
  background-color: var(--background);
  color: var(--text);
}

dialog.form::backdrop {
  background: rgb(0 0 0 / 70%);
}

/* Settings */
.form {
  flex-grow: 1;
  overflow-y: auto;
}

.form > * {
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  width: calc(100% - 8px);
  margin: 4px;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.form button,
.form input,
.form select,
.form textarea,
.form label:has(input[type='checkbox']) {
  padding: 0 8px;
  border: var(--text) 2px solid;
  cursor: pointer;
  transition: background-color 0.2s;
}

/* A select is sized by its widest option, and min-width: auto would let it
   push the label it sits next to out of the panel */
.form select {
  min-width: 0;
}

.form input[type='range'] {
  appearance: none;
  width: 100%;
  height: 32px;
  background: linear-gradient(
    to right,
    var(--main) var(--val),
    var(--background-disabled) var(--val)
  );
  cursor: ew-resize;
}

.form input[type='range']::-moz-range-thumb {
  width: 0;
  height: 0;
  opacity: 0;
}

.form button:hover,
.form input:hover {
  background-color: var(--background-hover);
}

.form button:disabled,
.form input:disabled {
  background-color: var(--background-disabled);
  cursor: no-drop;
}

.form label input:not([type='checkbox']) {
  width: inherit;
}

.form .progress {
  position: relative;
  width: 100%;
  margin: 0;
}

.form .progress div {
  position: absolute;
  width: 100%;
  height: 100%;
  background-color: var(--main);
  transform-origin: left;
}

.form .progress span {
  z-index: 0;
}

.form .colors {
  position: relative;
  display: block;
  width: 100%;
  margin: 0;
}

.form .colors > button {
  position: absolute;
  left: 0;
  z-index: 1;
  display: block;
  width: 100%;
  height: 20px;
  border: none;
  font-size: 16px;
  cursor: ns-resize;
  transition: 0.5s top ease;
}

.form .colors > button.dark {
  color: var(--text-invert);
}

.form .colors > button:hover {
  filter: brightness(0.6);
}

.form .colors > button * {
  float: left;
}

.form .colors > button .percent {
  float: right;
}

.form .colors > button.dragging {
  z-index: 100;
}

.form .colors > button > button {
  height: 100%;
}

/* Utility */
.p {
  padding: 0 8px;
}

.hidden {
  display: none;
}

/* A setting that only means something while its parent is on */
.form .nested {
  width: calc(100% - 36px);
  margin-left: 32px;
}

.colors-sort {
  gap: 4px;
}

.colors-sort button {
  flex: 1;
}
`;

// src/widget.html
var widget_default = `<button class="open-button">\r
  <div>></div>\r
</button>\r
<input class="title" type="text">\r
<div class="form">\r
  <div class="progress">\r
    <div></div><span></span>\r
  </div>\r
  <div class="p status"></div>\r
  <button class="draw" disabled>Draw</button>\r
  <button class="auto-draw" disabled>Auto-Draw</button>\r
  <label>Strategy:&nbsp;<select class="strategy">\r
      <option value="SEQUENTIAL" selected>Sequential</option>\r
      <option value="ALL">All</option>\r
      <option value="PERCENTAGE">Percentage</option>\r
    </select></label>\r
  <label\r
    title="Painted pixels earn droplets. 500 droplets buy 30 charges, 2000 buy a color. To keep the balance off colors entirely, set an image's Unowned Colors to Skip or Substitute">Droplets:&nbsp;<select\r
      class="droplet-strategy">\r
      <option value="COLORS" selected>Colors only</option>\r
      <option value="COLORS_FIRST">Colors first</option>\r
    </select></label>\r
  <!-- <button class="pumpkin-hunt" disabled>Pumpkin Hunt!</button> -->\r
  <div class="p hint"></div>\r
  <div class="images"></div>\r
</div>`;

// src/widget.ts
class Widget extends Base2 {
  bot;
  element = document.createElement("div");
  get status() {
    return this.$status.innerHTML;
  }
  set status(value) {
    this.$status.innerHTML = value;
  }
  get open() {
    return containsClass(this.element, "open");
  }
  set open(value) {
    if (value)
      addClass(this.element, "open");
    else
      removeClass(this.element, "open");
    this.bot.widgetOpen = value;
  }
  $settings;
  $status;
  $minimize;
  $topbar;
  $title;
  $draw;
  $strategy;
  $dropletStrategy;
  $progressLine;
  $progressText;
  $images;
  $hint;
  rowProgress = new Map;
  $openButton;
  $autoDraw;
  constructor(bot) {
    super();
    this.bot = bot;
    addClass(this.element, "widget");
    this.element.innerHTML = obfucsateHTML(widget_default);
    document.body.append(this.element);
    this.populateElementsWithSelector(this.element, {
      $openButton: ".open-button",
      $settings: ".form",
      $status: ".status",
      $minimize: ".minimize",
      $topbar: ".topbar",
      $title: ".title",
      $draw: ".draw",
      $strategy: ".strategy",
      $dropletStrategy: ".droplet-strategy",
      $progressLine: ".progress div",
      $progressText: ".progress span",
      $images: ".images",
      $hint: ".hint",
      $autoDraw: ".auto-draw"
    });
    this.$openButton.addEventListener("click", () => {
      const open = !this.open;
      this.bot.widgetOpen = open;
      save(this.bot, true);
      this.open = open;
    });
    this.$title.addEventListener("change", () => {
      this.bot.title = this.$title.value.trim();
      save(this.bot);
    });
    this.bot.fixSpaceInInput(this.$title);
    this.$draw.addEventListener("click", () => this.bot.draw());
    this.$strategy.addEventListener("change", () => {
      this.bot.strategy = this.$strategy.value;
    });
    this.$dropletStrategy.addEventListener("change", () => {
      this.bot.dropletStrategy = this.$dropletStrategy.value;
      this.updateProgress();
      save(this.bot);
    });
    this.$autoDraw.addEventListener("click", () => this.bot.autoDraw());
    this.update();
    setInterval(() => {
      this.updateProgress();
    }, 1000);
    this.open = this.bot.widgetOpen;
  }
  update() {
    this.$title.value = this.bot.title;
    this.$strategy.value = this.bot.strategy;
    this.$dropletStrategy.value = this.bot.dropletStrategy;
    this.updateProgress();
    this.$images.innerHTML = "";
    this.rowProgress.clear();
    this.$hint.textContent = this.hint();
    for (let index = 0;index < this.bot.images.length; index++) {
      const image = this.bot.images[index];
      const $image = document.createElement("div");
      this.$images.append($image);
      $image.className = SID + "item";
      $image.innerHTML = obfucsateHTML(`
<canvas></canvas>
<span class="name"></span>
<span class="item-progress"></span>
<label class="toggle">
  <input type="checkbox" class="enabled" ${image.disabled ? "" : "checked"}>
  <span>${image.disabled ? "Disabled" : "Enabled"}</span>
</label>
<button class="up" title="Move up" ${index === 0 ? "disabled" : ""}>▴</button>
<button class="down" title="Move down" ${index === this.bot.images.length - 1 ? "disabled" : ""}>▾</button>
<button class="settings" title="Drawing settings">⚙️</button>`);
      const $canvas = $image.querySelector("canvas");
      $canvas.width = 48;
      $canvas.height = 64;
      if (image.thumbnail.width > 0 && image.thumbnail.height > 0) {
        const scale = Math.min(48 / image.thumbnail.width, 64 / image.thumbnail.height);
        const w = image.thumbnail.width * scale;
        const h = image.thumbnail.height * scale;
        const context = $canvas.getContext("2d");
        context.imageSmoothingEnabled = false;
        context.drawImage(image.thumbnail, (48 - w) / 2, (64 - h) / 2, w, h);
      }
      $canvas.title = "Go to template";
      $canvas.addEventListener("click", () => {
        image.position.moveScreenTo(image.width, image.height);
      });
      const $name = querySelector($image, ".name");
      $name.textContent = image.name;
      $name.title = image.name;
      const $progress = querySelector($image, ".item-progress");
      this.rowProgress.set(image, $progress);
      this.paintRowProgress(image, $progress);
      const $enabled = querySelector($image, ".enabled");
      $enabled.addEventListener("change", () => {
        image.update({ disabled: !$enabled.checked });
      });
      querySelector($image, ".settings").addEventListener("click", () => {
        image.openSettings();
      });
      querySelector($image, ".up").addEventListener("click", () => {
        swap(this.bot.images, index, index - 1);
        this.update();
        save(this.bot);
      });
      querySelector($image, ".down").addEventListener("click", () => {
        swap(this.bot.images, index, index + 1);
        this.update();
        save(this.bot);
      });
    }
  }
  hint() {
    if (this.bot.images.length > 0)
      return "";
    const archived = this.bot.archivedImageCount;
    return [
      "Create and place a template in wplace's own template manager. It will show up here.",
      archived > 0 ? `${archived} older image${archived === 1 ? "" : "s"} not linked to wplace ${archived === 1 ? "was" : "were"} left out of drawing and kept in an archive.` : ""
    ].filter(Boolean).join(" ");
  }
  paintRowProgress(image, $progress) {
    if (image.error) {
      $progress.textContent = `❌ ${image.error}`;
      $progress.title = image.error;
      return;
    }
    const { done, total, percent } = image.progress;
    $progress.textContent = `${done}/${total} ${formatPercent(percent)}`;
    $progress.title = "";
  }
  updateProgress() {
    let maxTasks = 0;
    let totalTasks = 0;
    let cashbackTasks = 0;
    for (let index = 0;index < this.bot.images.length; index++) {
      const image = this.bot.images[index];
      if (image.disabled)
        continue;
      maxTasks += image.countedPixels;
      totalTasks += image.tasks.length / 2;
      cashbackTasks += this.bot.cashbackTasks(image);
    }
    const doneTasks = maxTasks - totalTasks;
    const percent = maxTasks ? doneTasks / maxTasks : 0;
    this.$progressText.textContent = `${doneTasks}/${maxTasks} ${formatPercent(percent)} ETA: ${etaText(this.bot, totalTasks, cashbackTasks)}`;
    this.$progressLine.style.transform = `scaleX(${percent})`;
    for (let index = 0;index < this.bot.images.length; index++) {
      const image = this.bot.images[index];
      image.updateProgress();
      const $progress = this.rowProgress.get(image);
      if ($progress)
        this.paintRowProgress(image, $progress);
    }
  }
  setDisabled(name, disabled) {
    querySelector(this.element, "." + name).disabled = disabled;
  }
  async run(status, run, fin, emoji = "⌛") {
    const originalStatus = this.status;
    try {
      const result = await run((p) => {
        this.status = `${emoji} ${status} ${formatPercent(p)}`;
      });
      this.status = originalStatus;
      return result;
    } catch (error) {
      if (!(error instanceof WPlaceBotError)) {
        console.error(error);
        this.status = `❌ ${status}`;
      }
      throw error;
    } finally {
      await fin?.();
    }
  }
  minimize() {
    toggleClass(this.$settings, "hidden");
  }
}

// src/bot.ts
class WPlaceBot {
  title = "";
  unavailableColors = new Set;
  mapsCacheKeys = new Uint32Array(0);
  mapsCache = new Uint8Array(0);
  me;
  lastMeAt;
  map;
  strategy = "SEQUENTIAL" /* SEQUENTIAL */;
  dropletStrategy = "COLORS_FIRST" /* COLORS_FIRST */;
  get spendsOnCharges() {
    return this.dropletStrategy !== "COLORS" /* COLORS */;
  }
  images = [];
  templates;
  dormant = new Map;
  archivedImageCount = 0;
  drawInvalidated = false;
  templateSignature = "";
  syncChain = Promise.resolve();
  syncTimer;
  tileCountries = new Map;
  pendingTiles = new Set;
  cashbackCache = new WeakMap;
  originalFetch = globalThis.fetch.bind(globalThis);
  autoDrawInterval;
  drawing = false;
  widgetOpen = true;
  widget;
  markerPixelPositionResolvers = [];
  lastColor;
  paintResolver;
  constructor(save) {
    if (save) {
      this.strategy = save.strategy;
      this.dropletStrategy = save.dropletStrategy;
      this.title = save.title;
      this.widgetOpen = save.widgetOpen;
      this.tileCountries = new Map(save.tileCountries);
      this.archivedImageCount = save.archivedImageCount ?? 0;
      for (const image of save.images)
        this.dormant.set(image.wplaceId, image);
    } else {
      this.title = "WPlace-bot";
    }
    this.widget = new Widget(this);
    this.registerFetchInterceptor();
    const style = document.createElement("style");
    style.textContent = obfuscateCSS(style_default);
    document.head.append(style);
    this.widget.run("Initializing", async (progress) => {
      await this.waitForElement(".avatar.center-absolute.absolute");
      progress(0.01);
      await this.waitForElement(".btn.btn-primary.btn-lg.relative.z-30 canvas");
      progress(0.02);
      await this.waitForElement(".maplibregl-canvas-container");
      progress(0.03);
      this.map = await findMap(this);
      await wait(500);
      progress(0.04);
      await this.updateColorsData();
      progress(0.05);
      const templateError = await this.syncTemplates((p) => {
        progress(0.05 + p * 0.95);
      });
      this.watchTemplates();
      this.widget.setDisabled("draw", false);
      this.widget.setDisabled("auto-draw", false);
      return templateError;
    }).then((templateError) => {
      if (templateError)
        this.widget.status = `❌ ${templateError}`;
    }).catch(async () => {
      if (window.confirm(`WPlace-bot couldn't load!
Do you want to CLEAR ALL DATA to fix it?

Hint for next time: Create backup's with \uD83D\uDCE4 button.`)) {
        try {
          const a = document.createElement("a");
          document.body.append(a);
          a.href = URL.createObjectURL(new Blob([JSON.stringify(await loadSave())], {
            type: "application/json"
          }));
          a.download = `Wplace-Bot-Broken-Save.txt`;
          a.click();
          window.alert(`Wplace-Bot-Broken-Save.txt is your broken save. If you ACTUALLY need data from this save, create issue on https://github.com/CleverWild/wplace-bot/issues

Developer will try to fix your save. Be vary that github issues are public, and save file contains your images and their positions in world.`);
          await deleteAllData();
        } catch {
          await deleteAllData().catch(() => {
            return;
          });
        } finally {
          document.location.reload();
        }
      }
    });
  }
  draw(submit = false, dropletsBeforePurchase = Infinity) {
    this.widget.setDisabled("draw", true);
    this.widget.status = "";
    const $canvas = document.querySelector(".maplibregl-canvas");
    const prevent = (event) => {
      if (!event.shiftKey)
        event.stopPropagation();
    };
    return this.widget.run("Drawing", async (progress) => {
      const syncError = await this.syncTemplates();
      if (syncError)
        throw new WPlaceBotError(`❌ ${syncError}`, this);
      const firstImage = this.images[0];
      if (!firstImage)
        return;
      this.drawing = true;
      this.drawInvalidated = false;
      globalThis.addEventListener("mousemove", prevent, true);
      $canvas.addEventListener("wheel", prevent, true);
      this.zoomIn(4);
      await this.widget.run("Loading", (progress) => Promise.all([
        this.updateColorsData().then(async () => {
          workerClearMapCache();
          await wait(100);
          const batchSize = 1 / this.images.length;
          for (let index = 0;index < this.images.length; index++)
            await this.images[index].updatePixels((p) => {
              progress(index * batchSize + p * batchSize);
            });
        }),
        fetch("https://backend.wplace.live/me", {
          credentials: "include"
        }).then((x) => x.json()).then((x) => {
          this.me = x;
        }),
        this.fetchTileCountries(this.images)
      ]));
      const initialCharges = Math.floor(this.me.charges.count);
      let charges = initialCharges;
      let tasksLength = 0;
      let cashbackLength = 0;
      for (let index = 0;index < this.images.length; index++) {
        const image = this.images[index];
        if (!image.visible)
          continue;
        tasksLength += image.tasks.length / 2;
        cashbackLength += this.cashbackTasks(image);
      }
      const colorToBuy = this.colorsToBuy()[0];
      if (this.me.droplets >= DROPLETS_PER_COLOR && colorToBuy !== undefined) {
        document.getElementById("color-" + colorToBuy)?.click();
        await wait(500);
        document.querySelector(".modal-box .flex.w-max.flex-col button")?.click();
        await wait(1000);
        await this.closeAll();
        await wait(500);
        return this.draw(submit);
      }
      const wantsCharges = this.dropletStrategy === "COLORS_FIRST" /* COLORS_FIRST */ && colorToBuy === undefined;
      if (wantsCharges && this.me.droplets < dropletsBeforePurchase) {
        const packs = Math.min(Math.ceil((tasksLength - cashbackLength / FLAG_CASHBACK_PIXELS - initialCharges) / CHARGES_PER_PACK_WITH_PAYBACK), Math.floor(this.me.droplets / DROPLETS_PER_PACK), Math.floor((this.me.charges.max - initialCharges) / CHARGES_PER_PACK));
        const droplets = this.me.droplets;
        if (packs > 0 && await this.buyChargePacks(packs))
          return this.draw(submit, droplets);
      }
      const indexes = new Map;
      const drawTask = async (image) => {
        if (this.drawInvalidated) {
          charges = 0;
          return;
        }
        let index = indexes.get(image);
        if (index === undefined)
          indexes.set(image, index = 0);
        const dIndex = index * 2;
        if (dIndex === image.tasks.length)
          return;
        const worldPosition = new WorldPosition(this, image.tasks[dIndex], image.tasks[dIndex + 1]);
        const color = image.pixels[(worldPosition.globalY - image.position.globalY) * image.width + (worldPosition.globalX - image.position.globalX)];
        if (this.lastColor !== color) {
          document.getElementById("color-" + color).click();
          this.lastColor = color;
        }
        const halfPixel = worldPosition.pixelSize / 2;
        const position = worldPosition.toScreenPosition();
        document.documentElement.dispatchEvent(new MouseEvent("mousemove", {
          bubbles: true,
          clientX: position.x + halfPixel,
          clientY: position.y + halfPixel,
          shiftKey: true
        }));
        document.documentElement.dispatchEvent(new KeyboardEvent("keydown", {
          key: " ",
          code: "Space",
          keyCode: 32,
          which: 32,
          bubbles: true,
          cancelable: true
        }));
        document.documentElement.dispatchEvent(new KeyboardEvent("keyup", {
          key: " ",
          code: "Space",
          keyCode: 32,
          which: 32,
          bubbles: true,
          cancelable: true
        }));
        indexes.set(image, index + 1);
        charges--;
        progress((initialCharges - charges) / initialCharges);
        await wait(1);
        return true;
      };
      switch (this.strategy) {
        case "ALL" /* ALL */: {
          while (charges > 0) {
            let end = true;
            for (let imageIndex = 0;imageIndex < this.images.length; imageIndex++) {
              const image = this.images[imageIndex];
              if (!image.visible)
                continue;
              if (await drawTask(image))
                end = false;
            }
            if (end)
              break;
          }
          break;
        }
        case "PERCENTAGE" /* PERCENTAGE */: {
          for (let taskIndex = 0;taskIndex < tasksLength && charges > 0; taskIndex++) {
            let minPercent = 1;
            let minImage;
            for (let imageIndex = 0;imageIndex < this.images.length; imageIndex++) {
              const image = this.images[imageIndex];
              if (!image.visible)
                continue;
              const percent = 1 - image.tasks.length / 2 / image.countedPixels;
              if (percent < minPercent) {
                minPercent = percent;
                minImage = image;
              }
            }
            if (minImage)
              await drawTask(minImage);
          }
          break;
        }
        case "SEQUENTIAL" /* SEQUENTIAL */: {
          for (let imageIndex = 0;imageIndex < this.images.length; imageIndex++) {
            const image = this.images[imageIndex];
            if (!image.visible)
              continue;
            for (let i = 0;i < image.tasks.length / 2 && charges > 0; i++)
              await drawTask(image);
          }
        }
      }
      if (this.drawIsStale()) {
        if (this.autoDrawInterval)
          this.autoDraw();
        throw new WPlaceBotError("⚠ A template changed during drawing. Clear the pixels already staged on the map, then draw again", this);
      }
      const queued = initialCharges - charges;
      const meBeforePaint = this.lastMeAt;
      const painted = submit && queued > 0 ? await this.submitPaint(queued) : 0;
      let paintedCashback = 0;
      const cashbackTiles = this.cashbackTiles();
      if (painted >= queued)
        for (const [image, value] of indexes) {
          paintedCashback += countCashbackTasks(image.tasks.subarray(0, value * 2), cashbackTiles);
          image.tasks = image.tasks.subarray(value * 2);
        }
      this.widget.update();
      if (this.lastMeAt === meBeforePaint) {
        this.me.charges.count = Math.max(0, this.me.charges.count - painted) + cashbackCharges(paintedCashback);
        this.me.droplets += painted * DROPLETS_PER_PIXEL;
        this.lastMeAt = Date.now();
      }
      const refunded = cashbackCharges(paintedCashback) > 0 && Math.floor(this.me.charges.count) > 0;
      if (painted > 0 && (wantsCharges && this.me.droplets >= DROPLETS_PER_PACK || refunded) && this.images.some((image) => image.visible && image.tasks.length > 0))
        return this.draw(submit);
    }, () => {
      this.drawing = false;
      if (this.drawInvalidated)
        this.scheduleSync(0);
      globalThis.removeEventListener("mousemove", prevent, true);
      $canvas.removeEventListener("wheel", prevent, true);
      this.widget.setDisabled("draw", false);
    });
  }
  submitPaint(queued) {
    const PAINT_BUTTON = ".absolute.bottom-0  .btn.btn-lg.relative.btn-primary";
    const $paint = document.querySelector(PAINT_BUTTON);
    if (!$paint || $paint.disabled) {
      console.warn(`wbot: no usable ${PAINT_BUTTON}, nothing was painted`);
      return Promise.resolve(0);
    }
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.paintResolver = undefined;
        resolve(0);
      }, 15000);
      this.paintResolver = (painted) => {
        clearTimeout(timeout);
        resolve(painted ?? queued);
      };
      $paint.click();
    });
  }
  msUntilNextDraw() {
    const DRAW_BASE_MS = 2000;
    const DRAW_MS_PER_PIXEL = 5;
    const cooldownMs = this.me?.charges.cooldownMs ?? 30000;
    const maxCharges = this.me?.charges.max ?? 100;
    let tasks = 0;
    let cashback = 0;
    for (let index = 0;index < this.images.length; index++) {
      const image = this.images[index];
      if (!image.visible)
        continue;
      tasks += image.tasks.length / 2;
      cashback += this.cashbackTasks(image);
    }
    if (tasks === 0)
      return maxCharges * cooldownMs;
    const buysCharges = this.spendsOnCharges && this.colorsToBuy().length === 0;
    const bought = buysCharges ? Math.floor((this.me?.droplets ?? 0) / DROPLETS_PER_PACK) * CHARGES_PER_PACK : 0;
    const painting = Math.min(tasks, maxCharges);
    const refund = painting * cashback / tasks / FLAG_CASHBACK_PIXELS;
    const missing = painting - refund - (this.me?.charges.count ?? 0) - bought;
    const lead = DRAW_BASE_MS + painting * DRAW_MS_PER_PIXEL;
    return Math.max(cooldownMs, missing * cooldownMs - lead);
  }
  autoDraw() {
    if (this.autoDrawInterval) {
      this.widget.$autoDraw.innerText = "Auto-Draw";
      clearInterval(this.autoDrawInterval);
      this.autoDrawInterval = undefined;
      return false;
    }
    this.widget.$autoDraw.innerText = "Auto-Draw is starting...";
    let errorCount = 0;
    let drawTime = 0;
    this.autoDrawInterval = setInterval(async () => {
      if (this.drawing) {
        this.widget.$autoDraw.innerText = "Auto-Draw is drawing...";
        return;
      }
      const deltaTime = drawTime - Date.now();
      if (deltaTime > 0) {
        this.widget.$autoDraw.innerText = `Auto-Draw in (${formatEta(Math.ceil(deltaTime / 60000))})!`;
        return;
      }
      try {
        await this.draw(true);
        errorCount = 0;
      } catch {
        errorCount++;
        if (errorCount === 4)
          throw new Error("Error");
      } finally {
        drawTime = Date.now() + this.msUntilNextDraw();
      }
    }, 1000);
    return true;
  }
  toJSON() {
    return Promise.resolve({
      version: SAVE_VERSION,
      images: [
        ...this.images.map((image) => image.toJSON()),
        ...this.dormant.values()
      ],
      strategy: this.strategy,
      dropletStrategy: this.dropletStrategy,
      title: this.title,
      widgetOpen: this.widgetOpen,
      tileCountries: [...this.tileCountries]
    });
  }
  syncTemplates(progress) {
    const run = this.syncChain.then(() => this.runSync(progress));
    this.syncChain = run;
    return run;
  }
  async runSync(progress) {
    let list;
    try {
      if (!this.templates) {
        const templates = await SiteTemplates.connect();
        templates.subscribe(this.onTemplatesChanged);
        this.templates = templates;
      }
      list = this.templates.list();
    } catch (error) {
      console.error(error);
      return error instanceof Error ? error.message : String(error);
    }
    const byId = new Map(list.map((template) => [template.id, template]));
    const plan = planTemplateSync(this.images.map((image) => image.wplaceId), [...this.dormant.keys()], list);
    let changed = plan.remove.length > 0 || plan.create.length > 0;
    for (const image of [...this.images]) {
      const template = byId.get(image.wplaceId);
      if (template) {
        if (await image.applyTemplate(template))
          changed = true;
      } else {
        this.dormant.set(image.wplaceId, image.toJSON());
        image.destroy();
      }
    }
    for (let index = 0;index < plan.create.length; index++) {
      const id = plan.create[index];
      const saved = this.dormant.get(id);
      this.dormant.delete(id);
      const image = new BotImage(this, byId.get(id), saved && { ...saved, disabledColors: new Set(saved.disabledColors) });
      this.images.push(image);
      await image.updatePixels((p) => {
        progress?.((index + p) / plan.create.length);
      });
    }
    this.templateSignature = list.map((template) => template.revision).join();
    if (changed) {
      this.widget.update();
      await save(this, true);
    }
    return;
  }
  scheduleSync(delayMs = 250) {
    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => {
      this.syncTemplates().then((error) => {
        if (error && !this.drawing)
          this.widget.status = `❌ ${error}`;
      });
    }, delayMs);
  }
  drawIsStale() {
    return this.drawInvalidated;
  }
  onTemplatesChanged = () => {
    if (!this.drawing)
      this.scheduleSync();
    else if (this.drawnTemplatesChanged())
      this.drawInvalidated = true;
  };
  drawnTemplatesChanged() {
    try {
      const byId = new Map(this.templates.list().map((template) => [template.id, template]));
      return this.images.some((image) => {
        const template = byId.get(image.wplaceId);
        return template?.contentKey !== image.template.contentKey;
      });
    } catch {
      return false;
    }
  }
  watchTemplates() {
    setInterval(() => {
      if (this.drawing || !this.templates)
        return;
      try {
        const signature = this.templates.list().map((template) => template.revision).join();
        if (signature !== this.templateSignature)
          this.scheduleSync();
      } catch {}
    }, 5000);
    const onVisible = () => {
      if (document.visibilityState === "visible" && !this.drawing)
        this.scheduleSync(0);
    };
    document.addEventListener("visibilitychange", onVisible);
    globalThis.addEventListener("focus", onVisible);
  }
  colorsToBuy() {
    const amounts = new Map;
    for (let index = 0;index < this.images.length; index++) {
      const image = this.images[index];
      if (!image.visible || image.unownedColorStrategy !== "BUY" /* BUY */)
        continue;
      for (let i = 0;i < image.colors.length; i++) {
        const color = image.colors[i];
        if (image.disabledColors.has(color) || !this.unavailableColors.has(color))
          continue;
        amounts.set(color, (amounts.get(color) ?? 0) + image.colorsStat.get(color).amount);
      }
    }
    return [...amounts.entries()].sort((a, b) => b[1] - a[1]).map(([color]) => color);
  }
  async updateColorsData() {
    await this.openColors();
    this.unavailableColors.clear();
    for (const $button of document.querySelectorAll("button.btn.relative.w-full"))
      if ($button.children.length !== 0)
        this.unavailableColors.add(Math.abs(Number.parseInt($button.id.slice(6))));
  }
  async buyChargePacks(packs) {
    const STORE_BUTTON = 'button[title="Store"]';
    const PACK_LABEL = "+30 Paint Charges";
    await this.closeAll();
    const $store = document.querySelector(STORE_BUTTON);
    if (!$store) {
      console.warn(`wbot: no ${STORE_BUTTON} on the page, charges not bought`);
      return false;
    }
    $store.click();
    let $card = null;
    for (let attempt = 0;attempt < 10 && !$card; attempt++) {
      await wait(200);
      $card = [...document.querySelectorAll("p")].find((p) => p.textContent.trim() === PACK_LABEL)?.parentElement ?? null;
    }
    if (!$card) {
      console.warn(`wbot: no "${PACK_LABEL}" card in the store`);
      await this.closeAll();
      return false;
    }
    const $amount = $card.querySelector('input[type="number"]');
    if ($amount) {
      $amount.value = Math.min(packs, Number($amount.max) || 1).toString();
      $amount.dispatchEvent(new Event("input", { bubbles: true }));
      await wait(100);
    }
    const $buy = $card.querySelector("button.btn-primary");
    if (!$buy || $buy.disabled) {
      console.warn("wbot: the charges card has no buy button to click");
      await this.closeAll();
      return false;
    }
    $buy.click();
    await wait(1000);
    await this.closeAll();
    await wait(500);
    return true;
  }
  moveMap(delta) {
    this.map.panBy([delta.x, delta.y], { duration: 0 });
  }
  fixSpaceInInput(input) {
    input.addEventListener("focus", () => this.closeAll());
  }
  async openColors() {
    this.lastColor = undefined;
    document.querySelector(".flex.gap-2.px-3 > .btn-circle")?.click();
    await wait(1);
    document.querySelector(".btn.btn-primary.btn-lg.relative.z-30")?.click();
    await wait(1);
    const unfoldColors = document.querySelector("button.bottom-0");
    if (unfoldColors?.innerHTML === '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" class="size-5"><path d="M480-120 300-300l58-58 122 122 122-122 58 58-180 180ZM358-598l-58-58 180-180 180 180-58 58-122-122-122 122Z"></path></svg><!---->') {
      unfoldColors.click();
      await wait(1);
    }
  }
  async closeAll() {
    for (const button of document.querySelectorAll("button")) {
      if (button.innerHTML === "✕" || button.innerHTML === `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor" class="size-4"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"></path></svg><!---->`) {
        button.click();
        await wait(1);
      }
    }
  }
  waitForElement(selector) {
    return new Promise((resolve) => {
      const existing = document.querySelector(selector);
      if (existing) {
        resolve(existing);
        return;
      }
      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector);
        if (element) {
          observer.disconnect();
          resolve(element);
        }
      });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    });
  }
  cashbackTiles() {
    const tiles = new Set;
    const flags = this.me?.flagsBitmap;
    if (!flags)
      return tiles;
    for (const [key, countryId] of this.tileCountries)
      if (ownsFlag(flags, countryId))
        tiles.add(key);
    return tiles;
  }
  cashbackTasks(image) {
    const stamp = `${this.me?.flagsBitmap ?? ""}|${this.tileCountries.size}`;
    const cached = this.cashbackCache.get(image.tasks);
    if (cached?.stamp === stamp)
      return cached.count;
    const count = countCashbackTasks(image.tasks, this.cashbackTiles());
    this.cashbackCache.set(image.tasks, { stamp, count });
    return count;
  }
  async fetchTileCountries(images) {
    const missing = new Set;
    for (const image of images) {
      if (!image.visible)
        continue;
      for (const key of coveredTiles(image.position.globalX, image.position.globalY, image.width, image.height))
        if (!this.tileCountries.has(key) && !this.pendingTiles.has(key))
          missing.add(key);
    }
    let learned = false;
    for (const key of missing) {
      this.pendingTiles.add(key);
      const [tileX, tileY] = tileFromKey(key);
      try {
        const response = await this.originalFetch(`https://backend.wplace.live/s0/pixel/${tileX}/${tileY}?x=500&y=500`, { credentials: "include" });
        if (response.ok && this.learnTileCountry(tileX, tileY, await response.json()))
          learned = true;
      } catch {} finally {
        this.pendingTiles.delete(key);
      }
    }
    if (learned)
      save(this);
    return learned;
  }
  learnTileCountry(tileX, tileY, info) {
    const countryId = info?.region?.countryId;
    if (typeof countryId !== "number")
      return false;
    const key = tileKey(tileX, tileY);
    if (this.tileCountries.get(key) === countryId)
      return false;
    this.tileCountries.set(key, countryId);
    return true;
  }
  zoomIn(pixelSize) {
    const zoom = zoomForPixelSize(pixelSize);
    if (this.map.getZoom() < zoom)
      this.map.jumpTo({ zoom });
  }
  registerFetchInterceptor() {
    const originalFetch = this.originalFetch;
    const pixelRegExp = /https:\/\/backend.wplace.live\/s\d+\/pixel\/(-?\d+)\/(-?\d+)\?x=(-?\d+)&y=(-?\d+)/;
    const paintRegExp = /^https:\/\/backend\.wplace\.live\/paint(?:\?|$)/;
    globalThis.fetch = async (request, options) => {
      const response = await originalFetch(request, options);
      const cloned = response.clone();
      let url = "";
      if (typeof request == "string")
        url = request;
      else if (request instanceof Request)
        url = request.url;
      else if (request instanceof URL)
        url = request.href;
      const method = request instanceof Request ? request.method : options?.method ?? "GET";
      if (method.toUpperCase() === "POST" && paintRegExp.test(url)) {
        const result = await cloned.json().catch(() => {
          return;
        });
        const resolve = this.paintResolver;
        this.paintResolver = undefined;
        resolve?.(response.ok ? result?.painted : 0);
      }
      if (response.url === "https://backend.wplace.live/me") {
        this.me = await cloned.json();
        this.lastMeAt = Date.now();
      }
      const pixelMatch = pixelRegExp.exec(url);
      if (pixelMatch) {
        cloned.json().then((info) => {
          this.learnTileCountry(+pixelMatch[1], +pixelMatch[2], info);
        }).catch(() => {
          return;
        });
        for (let index = 0;index < this.markerPixelPositionResolvers.length; index++)
          this.markerPixelPositionResolvers[index](new WorldPosition(this, +pixelMatch[1], +pixelMatch[2], +pixelMatch[3], +pixelMatch[4]));
        this.markerPixelPositionResolvers.length = 0;
      }
      return response;
    };
  }
}
globalThis.wbot = new WPlaceBot(await loadSave());
{
  WPlaceBot
};
