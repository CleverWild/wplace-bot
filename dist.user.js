// ==UserScript==
// @name         wplace-bot
// @namespace    https://github.com/SoundOfTheSky
// @version      5.1.7
// @description  Bot to automate painting on website https://wplace.live
// @author       SoundOfTheSky
// @license      MPL-2.0
// @homepageURL  https://github.com/SoundOfTheSky/wplace-bot
// @updateURL    https://raw.githubusercontent.com/SoundOfTheSky/wplace-bot/refs/heads/main/dist.user.js
// @downloadURL  https://raw.githubusercontent.com/SoundOfTheSky/wplace-bot/refs/heads/main/dist.user.js
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
function promisifyEventSource(target, resolveEvents, rejectEvents = ["error"], subName = "addEventListener") {
  return new Promise((resolve, reject) => {
    for (let index = 0;index < resolveEvents.length; index++)
      target[subName]?.(resolveEvents[index], resolve);
    for (let index = 0;index < rejectEvents.length; index++)
      target[subName]?.(rejectEvents[index], reject);
  });
}
// node_modules/@softsky/utils/dist/signals.js
var effectsMap = new WeakMap;
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
function querySelectorAll(el, selector) {
  return el.querySelectorAll(obfuscateLocalCSS(selector));
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

// src/ordering.ts
function sortColorsByAmount(colors, amounts, ascending) {
  return [...colors].sort((a, b) => ascending ? (amounts.get(a) ?? 0) - (amounts.get(b) ?? 0) : (amounts.get(b) ?? 0) - (amounts.get(a) ?? 0));
}

// src/image/model.ts
function createImageSettings(overrides = {}) {
  const settings = {
    width: 1,
    brightness: 0,
    colorMetric: "lab",
    strategy: "SPIRAL_TO_CENTER" /* SPIRAL_TO_CENTER */,
    opacity: 50,
    drawTransparentPixels: false,
    drawColorsInOrder: true,
    colors: [],
    disabledColors: new Set,
    lock: false,
    disabled: false,
    name: "",
    unownedColorStrategy: "BUY" /* BUY */,
    siteDisabled: false,
    regionOrder: "OFF" /* OFF */,
    fillDirection: "SEED_OUT" /* SEED_OUT */,
    outlineFirst: false
  };
  for (const [key, value] of Object.entries(overrides))
    if (value !== undefined)
      Object.assign(settings, { [key]: value });
  settings.colors = [...settings.colors];
  settings.disabledColors = new Set(settings.disabledColors);
  return settings;
}

// src/image.html
var image_default = `<div class="topbar">
  <input type="text" class="name">
  <button class="open-settings" title="Open settings">✏️</button>
  <button class="export" title="Export image">📤</button>
  <button class="lock" title="Lock/unlock image movement">🔓</button>
  <button class="delete" title="Remove image from bot">❌</button>
</div>
<div class="wrapper">
  <canvas></canvas>
  <div class="resize n"></div>
  <div class="resize e"></div>
  <div class="resize s"></div>
  <div class="resize w"></div>
</div>
<dialog class="form">
    <div class="progress">
      <div></div>
      <span></span>
    </div>
    <label class="unowned-color-strategy" title="What to do with unonwned colors">
      Unowned Colors:&nbsp;<select>
        <option value="BUY" selected>Buy</option>
        <option value="SKIP">Skip</option>
        <option value="SUBSTITUTE">Substitute</option>
      </select>
    </label>
    <label>Opacity:&nbsp;<input class="opacity" type="range" min="0" max="100"/></label>
    <label>Brightness:&nbsp;<input class="brightness" type="number" step="0.1"/></label>
    <label title="How colors are matched. Match this to your wplace template">
      Color metric:&nbsp;<select class="color-metric">
        <option value="lab" selected>Lab (wplace default)</option>
        <option value="ciede2000">CIEDE2000</option>
        <option value="compuphase">Compuphase</option>
      </select>
    </label>
    <label color="How to draw">
      Strategy:&nbsp;<select class="strategy">
        <option value="RANDOM">Random</option>
        <option value="CONTRAST">Maximum contrast</option>
        <option value="DOWN">Top to Bottom</option>
        <option value="UP">Bottom to Top</option>
        <option value="LEFT">Right to Left</option>
        <option value="RIGHT">Left to Right</option>
        <option value="SPIRAL_FROM_CENTER">Spiral out</option>
        <option value="SPIRAL_TO_CENTER" selected>Spiral in</option>
      </select>
    </label>
    <button class="reset-size">Reset size [<span></span>px]</button>
    <button class="reset-aspect">Reset aspect ratio</button>
    <label>
      <input type="checkbox" class="draw-transparent" />&nbsp;Erase transparent pixels
    </label>
    <label>
      <input type="checkbox" class="draw-colors-in-order" />&nbsp;Draw colors in order
    </label>
    <label title="The silhouette, meaning whatever touches transparency or the image edge, before everything it encloses">
      <input type="checkbox" class="outline-first" />&nbsp;Outline first
    </label>
    <label class="region-order" title="Finish one blob of a color before starting the next, and which blob goes first">
      Fill regions:&nbsp;<select>
        <option value="OFF" selected>Off</option>
        <option value="IN_ORDER">In drawing order</option>
        <option value="LARGEST">Largest first</option>
        <option value="SMALLEST">Smallest first</option>
      </select>
    </label>
    <label class="nested fill-direction" title="How a single blob is filled in">
      Fill:&nbsp;<select>
        <option value="SEED_OUT" selected>From seed outward</option>
        <option value="EDGE_IN">From edge inward</option>
      </select>
    </label>
    <div class="colors-sort">
      <button class="sort-colors-desc" title="Order colors by pixel count, most first">↓ Most</button>
      <button class="sort-colors-asc" title="Order colors by pixel count, fewest first">↑ Fewest</button>
    </div>
    <div class="colors"></div>
  </dialog>
  <dialog class="export-dialog">
    <button class="export-wbot">Save .wbot (restorable)</button>
    <button class="export-wplace">Export .wplace (wplace template)</button>
    <button class="export-image">Export image (.webp)</button>
  </dialog>
`;

// src/persistence/schema.ts
var SAVE_VERSION = 8;

// src/persistence/migrations.ts
function isFields(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function versionOf(fields) {
  return typeof fields.version === "number" ? fields.version : 0;
}
function migrateImage(old) {
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
  if (typeof image.url !== "string")
    throw new Error("Saved image has no source url");
  return image;
}
function migrate(old) {
  if (!isFields(old))
    throw new Error("Save is not an object");
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
  if (!Array.isArray(save.images))
    throw new Error("Save has no image list");
  return {
    ...save,
    version: SAVE_VERSION,
    images: save.images.map(migrateImage)
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
    const job = this.tail.catch(() => {
      return;
    }).then(async () => {
      await this.write(await snapshot());
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
async function loadSave() {
  try {
    await migrateSaveFromLS();
    const raw = await idbGet(SAVE_KEY);
    if (typeof raw !== "object" || raw === null)
      return;
    return migrate(raw);
  } catch {
    return;
  }
}
function save(bot, immediate = false) {
  return queue.save(() => bot.toJSON(), immediate);
}
async function migrateSaveFromLS() {
  let legacyKey = "";
  for (let index = 0;index < localStorage.length; index++) {
    legacyKey = localStorage.key(index);
    if (legacyKey.endsWith(SAVE_KEY))
      break;
  }
  if (legacyKey.endsWith(SAVE_KEY)) {
    const json = localStorage.getItem(legacyKey);
    if (json) {
      try {
        const parsed = JSON.parse(json);
        if (typeof parsed === "object")
          await idbSet(SAVE_KEY, parsed);
      } catch {}
    }
    localStorage.removeItem(legacyKey);
  }
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
function estimateEtaMinutes(remaining, charges, maxCharges, cooldownMs, elapsedMs, droplets, colorsToBuy = 0) {
  if (cooldownMs <= 0)
    return 0;
  const regeneratedCharges = Math.max(0, elapsedMs) / cooldownMs;
  const availableCharges = Math.min(Math.max(0, maxCharges), Math.max(0, charges) + regeneratedCharges);
  let needed = Math.max(0, remaining);
  if (droplets !== undefined) {
    const earned = Math.max(0, droplets) + needed * DROPLETS_PER_PIXEL;
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
        for (let index2 = SIZE - 1;index2 >= 0; index2--) {
          const randIndex = Math.floor(Math.random() * (index2 + 1)) * 2;
          const realIndex = index2 * 2;
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
      data,
      nativeWidth,
      nativeHeight,
      width,
      height,
      unavailableColors,
      brightness,
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
    let lastProgress = 0;
    let scaled;
    if (nativeWidth === width && nativeHeight === height)
      scaled = data;
    else {
      scaled = new Uint8ClampedArray(width * height * 4);
      const xRatio = nativeWidth / width;
      const yRatio = nativeHeight / height;
      for (let y = 0;y < height; y++) {
        const sy = Math.min(nativeHeight - 1, Math.floor(y * yRatio));
        for (let x = 0;x < width; x++) {
          const sx = Math.min(nativeWidth - 1, Math.floor(x * xRatio));
          const si = (sy * nativeWidth + sx) * 4;
          const di = (y * width + x) * 4;
          scaled[di] = data[si];
          scaled[di + 1] = data[si + 1];
          scaled[di + 2] = data[si + 2];
          scaled[di + 3] = data[si + 3];
        }
        const progress = y / height * 5 | 0;
        if (progress !== lastProgress) {
          lastProgress = progress;
          onProgress?.(0.1 + progress / 100);
        }
      }
    }
    const SIZE = width * height;
    const metricFn = metricFunction(colorMetric);
    const isRgbMetric = colorMetric === "compuphase";
    const palette = isRgbMetric ? COLORS_RGB_TRIPLES : COLORS;
    const pixels = new Uint8Array(SIZE);
    const isSubstitute = unownedColorStrategy === "SUBSTITUTE" /* SUBSTITUTE */;
    const realPixels = isSubstitute ? new Uint8Array(SIZE) : pixels;
    const colorStat = new Map;
    const colorCache = new Map;
    for (let index = 1;index < 64; index++)
      if (!unavailableColors.has(index))
        colorCache.set(COLORS_RGB[index], [index, index]);
    let i = 0;
    let pi = 0;
    lastProgress = 0;
    for (let y = 0;y < height; y++) {
      for (let x = 0;x < width; x++) {
        const progress = pi / SIZE * 75 | 0;
        if (progress !== lastProgress) {
          lastProgress = progress;
          onProgress?.(0.15 + progress / 100);
        }
        const r = scaled[i];
        const g = scaled[i + 1];
        const b = scaled[i + 2];
        const a = scaled[i + 3];
        const key = r << 16 | g << 8 | b;
        let min;
        let minReal;
        if (a < 100)
          min = minReal = 0;
        else if (colorCache.has(key))
          [min, minReal] = colorCache.get(key);
        else {
          const source = isRgbMetric ? [r, g, b] : rgbToLab(r, g, b);
          let minDelta = Infinity;
          let minDeltaReal = Infinity;
          for (let colorIndex = 1;colorIndex < 64; colorIndex++) {
            const delta = metricFn(source, palette[colorIndex], brightness);
            if (!unavailableColors.has(colorIndex) && delta < minDelta) {
              minDelta = delta;
              min = colorIndex;
            }
            if (delta < minDeltaReal) {
              minDeltaReal = delta;
              minReal = colorIndex;
            }
          }
          colorCache.set(key, [min, minReal]);
        }
        pixels[pi] = isSubstitute ? min : minReal;
        if (isSubstitute)
          realPixels[pi] = minReal;
        const stat = colorStat.get(minReal);
        if (stat)
          stat.amount++;
        else
          colorStat.set(minReal, {
            color: min,
            amount: 1,
            left: 0,
            realColor: minReal
          });
        i += 4;
        pi++;
      }
    }
    const skipColors = new Set;
    const colorsOrderMap = new Map;
    for (let index = 0;index < colors.length; index++) {
      const drawColor = colors[index];
      if (disabledColors.has(drawColor) || unavailableColors.has(drawColor))
        skipColors.add(drawColor);
      colorsOrderMap.set(drawColor, index);
    }
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
      if (skipColors.has(color) || !drawTransparentPixels && color === 0)
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
      ordered.sort((a, b) => (colorsOrderMap.get(a.color) ?? 0) - (colorsOrderMap.get(b.color) ?? 0));
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
  moveScreenTo() {
    const { x, y } = this.toScreenPosition();
    this.bot.moveMap({
      x: x - window.innerWidth / 3,
      y: y - window.innerHeight / 3
    });
  }
  clone() {
    return new WorldPosition(this.bot, this.tileX, this.tileY, this.x, this.y);
  }
  toJSON() {
    return [this.globalX, this.globalY];
  }
}

// src/wplace-file.ts
function placement(template) {
  const bounds = template.bounds;
  if (!bounds || [bounds.north, bounds.south, bounds.west, bounds.east].some((x) => typeof x !== "number" || !Number.isFinite(x)))
    throw new Error("Template has no usable bounds");
  const globalX = Math.round(longitudeToWorld(bounds.west));
  const globalY = Math.round(latitudeToWorld(bounds.north));
  return {
    position: [globalX, globalY],
    width: Math.max(1, Math.round(longitudeToWorld(bounds.east)) - globalX),
    height: Math.max(1, Math.round(latitudeToWorld(bounds.south)) - globalY),
    opacity: typeof template.opacity === "number" ? Math.round(template.opacity * 100) : undefined,
    lock: template.locked,
    disabled: template.visible === false,
    name: template.name
  };
}
function fromWplaceFile(raw) {
  const file = raw;
  if (typeof file.image?.dataUrl !== "string")
    throw new Error("Not a valid .wplace template");
  return { ...placement(file), url: file.image.dataUrl };
}
var OVERLAYS_KEY = "template-overlays";
var TEMPLATES_DB = "wplace-templates";
var TEMPLATES_STORE = "images";
function readSiteTemplates() {
  let overlays;
  try {
    overlays = JSON.parse(localStorage.getItem(OVERLAYS_KEY) ?? "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(overlays))
    return [];
  const templates = [];
  for (let index = 0;index < overlays.length; index++) {
    const overlay = overlays[index];
    if (typeof overlay?.id !== "string")
      continue;
    try {
      templates.push({ id: overlay.id, data: placement(overlay) });
    } catch {}
  }
  return templates;
}
async function readSiteTemplateImage(id) {
  const db = await new Promise((resolve) => {
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
  if (!db?.objectStoreNames.contains(TEMPLATES_STORE)) {
    db?.close();
    return;
  }
  const blob = await new Promise((resolve) => {
    const request = db.transaction(TEMPLATES_STORE, "readonly").objectStore(TEMPLATES_STORE).get(id);
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      resolve(undefined);
    };
  });
  db.close();
  if (!blob)
    return;
  return new Promise((resolve) => {
    const reader = new FileReader;
    reader.onload = () => {
      resolve(reader.result);
    };
    reader.onerror = () => {
      resolve(undefined);
    };
    reader.readAsDataURL(blob);
  });
}
function toWplaceFile(image, order = 0) {
  const { globalX, globalY } = image;
  return {
    id: crypto.randomUUID(),
    schemaVersion: "1",
    name: image.name,
    opacity: image.opacity / 100,
    image: {
      dataUrl: image.dataUrl,
      width: image.width,
      height: image.height
    },
    bounds: {
      north: worldToLatitude(globalY),
      south: worldToLatitude(globalY + image.height),
      west: worldToLongitude(globalX),
      east: worldToLongitude(globalX + image.width)
    },
    colorMetric: "ciede2000",
    dithering: false,
    useLegacyColors: false,
    colorPaletteMode: "all",
    order,
    locked: image.lock,
    hasPlaced: false,
    visible: image.visible
  };
}

// src/image.ts
function etaText(bot, remaining) {
  const cooldownMs = bot.me?.charges.cooldownMs ?? 30000;
  const minutes = estimateEtaMinutes(remaining, bot.me?.charges.count ?? 0, bot.me?.charges.max ?? 0, cooldownMs, bot.lastMeAt === undefined ? 0 : Date.now() - bot.lastMeAt, bot.spendsOnCharges ? bot.me?.droplets ?? 0 : undefined, bot.colorsToBuy().length);
  return formatEta(minutes);
}

class BotImage extends Base2 {
  bot;
  image;
  static async fromJSON(bot, data, progress) {
    const image = new Image;
    image.src = data.url.startsWith("http") ? await fetch(data.url, { cache: "no-store" }).then((x) => x.blob()).then((x) => URL.createObjectURL(x)) : data.url;
    await promisifyEventSource(image, ["load"], ["error"]);
    const canvas = new OffscreenCanvas(image.naturalWidth, image.naturalHeight);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, 0);
    const botImage = new BotImage(bot, canvas, {
      ...data,
      disabledColors: data.disabledColors && new Set(data.disabledColors),
      position: data.position && WorldPosition.fromJSON(bot, data.position)
    });
    await botImage.updatePixels(progress);
    return botImage;
  }
  pixels = new Uint8Array(0);
  resolution;
  colorsStat = new Map;
  get height() {
    return this.heightOverride ?? this.width / this.resolution | 0;
  }
  set height(value) {
    this.heightOverride = value;
  }
  get visible() {
    return !this.disabled && !this.siteDisabled;
  }
  tasks = new Uint32Array(0);
  moveInfo;
  imageData;
  element = document.createElement("div");
  $canvas;
  context;
  $brightness;
  $colors;
  $delete;
  $drawColorsInOrder;
  $drawTransparent;
  $export;
  $lock;
  $opacity;
  $progressLine;
  $progressText;
  $resetSize;
  $resetAspect;
  $resetSizeSpan;
  $settings;
  $strategy;
  $exportDialog;
  $colorMetric;
  $topbar;
  $wrapper;
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
  $openSettings;
  $dialog;
  position;
  width;
  heightOverride;
  brightness;
  colorMetric;
  strategy;
  opacity;
  drawTransparentPixels;
  drawColorsInOrder;
  colors;
  disabledColors;
  lock;
  disabled;
  name;
  unownedColorStrategy;
  wplaceId;
  siteDisabled;
  regionOrder;
  fillDirection;
  outlineFirst;
  constructor(bot, image, {
    position,
    ...overrides
  } = {}) {
    super();
    this.bot = bot;
    this.image = image;
    const settings = createImageSettings({
      width: image.width,
      name: `${image.width}x${image.height}`,
      ...overrides
    });
    this.position = position ?? WorldPosition.fromScreenPosition(bot, { x: 256, y: 32 });
    this.width = settings.width;
    this.heightOverride = settings.height;
    this.brightness = settings.brightness;
    this.colorMetric = settings.colorMetric;
    this.strategy = settings.strategy;
    this.opacity = settings.opacity;
    this.drawTransparentPixels = settings.drawTransparentPixels;
    this.drawColorsInOrder = settings.drawColorsInOrder;
    this.colors = settings.colors;
    this.disabledColors = settings.disabledColors;
    this.lock = settings.lock;
    this.disabled = settings.disabled;
    this.name = settings.name;
    this.unownedColorStrategy = settings.unownedColorStrategy;
    this.wplaceId = settings.wplaceId;
    this.siteDisabled = settings.siteDisabled;
    this.regionOrder = settings.regionOrder;
    this.fillDirection = settings.fillDirection;
    this.outlineFirst = settings.outlineFirst;
    this.bot.images.push(this);
    this.resolution = image.width / image.height;
    this.imageData = this.image.getContext("2d").getImageData(0, 0, image.width, image.height).data;
    this.element.innerHTML = obfucsateHTML(image_default);
    addClass(this.element, "image");
    document.body.append(this.element);
    this.populateElementsWithSelector(this.element, {
      $brightness: ".brightness",
      $colors: ".colors",
      $delete: ".delete",
      $drawColorsInOrder: ".draw-colors-in-order",
      $drawTransparent: ".draw-transparent",
      $export: ".export",
      $lock: ".lock",
      $opacity: ".opacity",
      $progressLine: ".progress div",
      $progressText: ".progress span",
      $resetSize: ".reset-size",
      $resetAspect: ".reset-aspect",
      $settings: ".form",
      $strategy: ".strategy",
      $exportDialog: ".export-dialog",
      $colorMetric: ".color-metric",
      $topbar: ".topbar",
      $wrapper: ".wrapper",
      $name: ".name",
      $unownedColorStrategyLabel: ".unowned-color-strategy",
      $outlineFirst: ".outline-first",
      $regionOrderLabel: ".region-order",
      $fillDirectionLabel: ".fill-direction",
      $sortColorsDesc: ".sort-colors-desc",
      $sortColorsAsc: ".sort-colors-asc",
      $openSettings: ".open-settings",
      $dialog: "dialog",
      $canvas: "canvas"
    });
    this.context = this.$canvas.getContext("2d");
    this.$unownedColorStrategy = this.$unownedColorStrategyLabel.querySelector("select");
    this.$regionOrder = this.$regionOrderLabel.querySelector("select");
    this.$fillDirection = this.$fillDirectionLabel.querySelector("select");
    this.$resetSizeSpan = this.$resetSize.querySelector("span");
    this.$openSettings.addEventListener("click", () => {
      this.$dialog.showModal();
    });
    this.$dialog.addEventListener("click", (event) => {
      if (event.target === this.$dialog)
        this.$dialog.close();
    });
    this.$unownedColorStrategy.addEventListener("change", () => {
      this.unownedColorStrategy = this.$unownedColorStrategy.value;
      this.updateColors();
      save(this.bot);
    });
    this.$colorMetric.addEventListener("change", async () => {
      this.colorMetric = this.$colorMetric.value;
      await this.updatePixels();
      await save(this.bot);
    });
    this.$strategy.addEventListener("change", async () => {
      this.strategy = this.$strategy.value;
      await this.updatePixels();
      await save(this.bot);
    });
    this.$regionOrder.addEventListener("change", async () => {
      this.regionOrder = this.$regionOrder.value;
      await this.updatePixels();
      await save(this.bot);
    });
    this.$fillDirection.addEventListener("change", async () => {
      this.fillDirection = this.$fillDirection.value;
      await this.updatePixels();
      await save(this.bot);
    });
    this.$outlineFirst.addEventListener("click", async () => {
      this.outlineFirst = this.$outlineFirst.checked;
      await this.updatePixels();
      await save(this.bot);
    });
    const sortColors = async (ascending) => {
      const amounts = new Map;
      for (const stat of this.colorsStat.values())
        amounts.set(stat.realColor, stat.amount);
      this.colors = sortColorsByAmount(this.colors, amounts, ascending);
      await this.updatePixels();
      await save(this.bot);
    };
    this.$sortColorsDesc.addEventListener("click", () => void sortColors(false));
    this.$sortColorsAsc.addEventListener("click", () => void sortColors(true));
    this.$opacity.addEventListener("input", () => {
      this.opacity = this.$opacity.valueAsNumber;
      this.$opacity.style.setProperty("--val", this.opacity + "%");
      this.updateUI();
      save(this.bot);
    });
    this.$opacity.style.setProperty("--val", this.opacity + "%");
    let timeout;
    this.$brightness.addEventListener("change", () => {
      clearTimeout(timeout);
      timeout = setTimeout(async () => {
        this.brightness = this.$brightness.valueAsNumber;
        await this.updatePixels();
        await save(this.bot);
      }, 1000);
    });
    this.$resetSize.addEventListener("click", async () => {
      this.width = this.image.width;
      this.heightOverride = undefined;
      await this.updatePixels();
      await save(this.bot);
    });
    this.$resetAspect.addEventListener("click", async () => {
      this.heightOverride = undefined;
      await this.updatePixels();
      await save(this.bot);
    });
    this.$drawTransparent.addEventListener("click", async () => {
      this.drawTransparentPixels = this.$drawTransparent.checked;
      await this.updatePixels();
      await save(this.bot);
    });
    this.$drawColorsInOrder.addEventListener("click", async () => {
      this.drawColorsInOrder = this.$drawColorsInOrder.checked;
      await this.updatePixels();
      await save(this.bot);
    });
    this.$lock.addEventListener("click", () => {
      this.lock = !this.lock;
      this.updateUI();
      save(this.bot);
    });
    this.$delete.addEventListener("click", this.destroy.bind(this));
    this.$export.addEventListener("click", () => {
      this.$exportDialog.showModal();
    });
    this.$exportDialog.addEventListener("click", (event) => {
      if (event.target === this.$exportDialog)
        this.$exportDialog.close();
    });
    for (const [selector, format] of [
      [".export-wbot", "wbot"],
      [".export-wplace", "wplace"],
      [".export-image", "image"]
    ])
      querySelector(this.$exportDialog, selector).addEventListener("click", () => this.exportAs(format));
    this.$name.addEventListener("change", () => {
      this.name = this.$name.value;
      this.updateUI();
      this.bot.widget.update();
      save(this.bot);
    });
    this.bot.fixSpaceInInput(this.$name);
    if (this.wplaceId) {
      addClass(this.element, "managed");
      this.$name.readOnly = true;
    } else
      this.$canvas.addEventListener("mousedown", this.moveStart.bind(this));
    this.$wrapper.addEventListener("wheel", (event) => document.querySelector(".maplibregl-canvas").dispatchEvent(new WheelEvent("wheel", {
      bubbles: true,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      deltaZ: event.deltaZ,
      clientX: event.clientX,
      clientY: event.clientY
    })));
    this.registerEvent(document, "mouseup", this.moveStop.bind(this));
    this.registerEvent(document, "mousemove", this.move.bind(this));
    if (!this.wplaceId)
      for (const $resize of querySelectorAll(this.element, ".resize"))
        $resize.addEventListener("mousedown", this.resizeStart.bind(this));
  }
  async toJSON() {
    const blob = await this.image.convertToBlob({
      type: "image/webp",
      quality: 1
    });
    const url = await new Promise((resolve, reject) => {
      const reader = new FileReader;
      reader.onload = () => {
        resolve(reader.result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return {
      url,
      width: this.width,
      height: this.heightOverride,
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
      version: SAVE_VERSION
    };
  }
  async applySiteTemplate(data) {
    const [globalX, globalY] = data.position;
    const disabled = data.disabled;
    const moved = this.position.globalX !== globalX || this.position.globalY !== globalY || this.width !== data.width || this.height !== data.height;
    const redraw = moved || this.siteDisabled !== disabled;
    if (!redraw && this.name === (data.name ?? this.name) && this.lock === (data.lock ?? this.lock))
      return false;
    this.position.globalX = globalX;
    this.position.globalY = globalY;
    this.width = data.width;
    this.height = data.height;
    this.siteDisabled = disabled;
    if (data.name !== undefined)
      this.name = data.name;
    if (data.lock !== undefined)
      this.lock = data.lock;
    if (redraw)
      await this.updatePixels();
    else
      this.updateUI();
    return true;
  }
  async updatePixels(progress) {
    const progress2 = progress ?? ((p) => {
      this.bot.widget.status = `⌛ Loading ${formatPercent(p)}`;
    });
    const height = this.height;
    const width = this.width;
    const result = await workerPixels({
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
      unownedColorStrategy: this.unownedColorStrategy
    }, progress2);
    this.colorsStat = result.colorStat;
    this.tasks = this.visible ? result.taskPositions : new Uint32Array(0);
    this.pixels = result.pixels;
    this.$canvas.width = width;
    this.$canvas.height = height;
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
    const { x, y } = this.position.toScreenPosition();
    this.element.style.transform = `translate(${x}px, ${y}px)`;
    this.element.style.width = `${this.position.pixelSize * this.width}px`;
    this.$canvas.style.height = `${this.position.pixelSize * this.height}px`;
    this.$canvas.style.opacity = `${this.opacity}%`;
    if (this.visible)
      removeClass(this.element, "hidden");
    else
      addClass(this.element, "hidden");
    this.$resetSizeSpan.textContent = `${this.width}x${this.height}`;
    this.$brightness.valueAsNumber = this.brightness;
    this.$strategy.value = this.strategy;
    this.$colorMetric.value = this.colorMetric;
    this.$opacity.valueAsNumber = this.opacity;
    this.$drawTransparent.checked = this.drawTransparentPixels;
    this.$drawColorsInOrder.checked = this.drawColorsInOrder;
    this.$outlineFirst.checked = this.outlineFirst;
    this.$regionOrder.value = this.regionOrder;
    this.$fillDirection.value = this.fillDirection;
    if (this.regionOrder === "OFF" /* OFF */)
      addClass(this.$fillDirectionLabel, "hidden");
    else
      removeClass(this.$fillDirectionLabel, "hidden");
    this.$name.value = this.name;
    this.updateProgress();
    if (this.lock)
      addClass(this.$wrapper, "no-pointer-events");
    else
      removeClass(this.$wrapper, "no-pointer-events");
    this.$lock.textContent = this.lock ? "\uD83D\uDD12" : "\uD83D\uDD13";
  }
  get countedPixels() {
    const total = this.width * this.height;
    if (this.drawTransparentPixels)
      return total;
    return total - (this.colorsStat.get(0)?.amount ?? 0);
  }
  updateProgress() {
    const maxTasks = this.countedPixels;
    const doneTasks = maxTasks - this.tasks.length / 2;
    const percent = maxTasks ? doneTasks / maxTasks : 0;
    this.$progressText.textContent = `${doneTasks}/${maxTasks} ${formatPercent(percent)} ETA: ${etaText(this.bot, this.tasks.length / 2)}`;
    this.$progressLine.style.transform = `scaleX(${percent})`;
  }
  destroy() {
    super.destroy();
    this.element.remove();
    removeFromArray(this.bot.images, this);
    this.bot.widget.update();
    save(this.bot);
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
      this.colors = this.colorsStat.values().toArray().sort((a, b) => b.amount - a.amount).map((color) => color.realColor);
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
        this.registerEvent(document, "mousemove", mouseMoveHandler);
        this.registerEvent(document, "mouseup", () => {
          removeClass($button, "dragging");
          document.removeEventListener("mousemove", mouseMoveHandler);
          $button.removeEventListener("mousedown", startDrag);
          if (newIndex === index)
            return;
          this.colors.splice(newIndex, 0, ...this.colors.splice(index, 1));
          setTimeout(() => {
            this.updatePixels().then(() => save(this.bot));
          }, 200);
        }, {
          once: true
        });
      };
      $button.addEventListener("mousedown", startDrag);
      $button.addEventListener("click", async (event) => {
        event.stopPropagation();
        if (dragging)
          return;
        if (this.disabledColors.has(drawColor))
          this.disabledColors.delete(drawColor);
        else
          this.disabledColors.add(drawColor);
        toggleClass($button, "color-disabled");
        await this.updatePixels();
        await save(this.bot);
      });
    }
  }
  moveStart(event) {
    if (!this.lock)
      this.moveInfo = {
        globalX: this.position.globalX,
        globalY: this.position.globalY,
        clientX: event.clientX,
        clientY: event.clientY
      };
  }
  async moveStop() {
    if (this.moveInfo) {
      this.moveInfo = undefined;
      await this.updatePixels();
    }
  }
  move(event) {
    if (!this.moveInfo)
      return;
    const deltaX = Math.round((event.clientX - this.moveInfo.clientX) / this.position.pixelSize);
    const deltaY = Math.round((event.clientY - this.moveInfo.clientY) / this.position.pixelSize);
    if (this.moveInfo.globalX !== undefined) {
      this.position.globalX = deltaX + this.moveInfo.globalX;
      if (this.moveInfo.width !== undefined)
        this.width = Math.max(1, this.moveInfo.width - deltaX);
    } else if (this.moveInfo.width !== undefined)
      this.width = Math.max(1, deltaX + this.moveInfo.width);
    if (this.moveInfo.globalY !== undefined) {
      this.position.globalY = deltaY + this.moveInfo.globalY;
      if (this.moveInfo.height !== undefined)
        this.height = Math.max(1, this.moveInfo.height - deltaY);
    } else if (this.moveInfo.height !== undefined)
      this.height = Math.max(1, deltaY + this.moveInfo.height);
    this.updateUI();
    save(this.bot);
  }
  resizeStart(event) {
    this.moveInfo = {
      clientX: event.clientX,
      clientY: event.clientY
    };
    const $resize = event.target;
    if (containsClass($resize, "n")) {
      this.moveInfo.height = this.height;
      this.moveInfo.globalY = this.position.globalY;
    }
    if (containsClass($resize, "e"))
      this.moveInfo.width = this.width;
    if (containsClass($resize, "s"))
      this.moveInfo.height = this.height;
    if (containsClass($resize, "w")) {
      this.moveInfo.width = this.width;
      this.moveInfo.globalX = this.position.globalX;
    }
  }
  async exportAs(format) {
    this.$exportDialog.close();
    const a = document.createElement("a");
    document.body.append(a);
    const download = (href, name) => {
      a.href = href;
      a.download = name;
      a.click();
      URL.revokeObjectURL(href);
    };
    const json = (data) => URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
    switch (format) {
      case "wplace": {
        download(json(toWplaceFile({
          dataUrl: this.$canvas.toDataURL("image/png"),
          globalX: this.position.globalX,
          globalY: this.position.globalY,
          width: this.width,
          height: this.height,
          name: this.name,
          opacity: this.opacity,
          lock: this.lock,
          visible: this.visible
        }, this.bot.images.indexOf(this))), `${this.name}.wplace`);
        break;
      }
      case "image": {
        download(this.$canvas.toDataURL("image/webp", 1), `${this.name}.webp`);
        break;
      }
      default: {
        download(json(await this.toJSON()), `${this.name}.wbot`);
      }
    }
    a.remove();
  }
}

// src/errors.ts
class WPlaceBotError extends Error {
  name = "WPlaceBotError";
  constructor(message, bot) {
    super(message);
    bot.widget.status = message;
  }
}

class NoImageError extends WPlaceBotError {
  name = "NoImageError";
  constructor(bot) {
    super("❌ No image is selected", bot);
  }
}

class NoMapError extends WPlaceBotError {
  name = "NoMapError";
  constructor(bot) {
    super("❌ Couldn't find wplace's map. The site has probably changed.", bot);
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

// src/style.css
var style_default = `/* stylelint-disable declaration-no-important */
/* stylelint-disable plugin/no-low-performance-animation-properties */
/* stylelint-disable no-descending-specificity */
@import 'https://fonts.googleapis.com/css2?family=Tiny5&display=swap';

:root {
  --text-invert: #fff;
  --resize: 8px;
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
    'canvas name name name'
    'canvas toggle up down';
  grid-template-columns: 48px 1fr auto auto; /* canvas fixed, name flexible, up/down auto */
  gap: 4px;
  width: 100%;
  height: 64px;
  margin-bottom: 4px;
}

.widget .images .item canvas {
  grid-area: canvas;
  margin-right: 4px;
  cursor: pointer;
}

.widget .images .item .name {
  display: block;
  grid-area: name;
}

.widget .images .item .toggle {
  display: flex;
  grid-area: toggle;
  gap: 4px;
  justify-content: center;
  align-items: center;
  font-size: 18px;
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

/** Image */
.image {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 9;
}

.image * {
  font-family: 'Tiny5', sans-serif;
}

.image canvas {
  image-rendering: pixelated;
  width: 100%;
  box-shadow: inset var(--text) 0 0 0 2px;
  cursor: all-scroll;
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

dialog.export-dialog {
  margin: auto;
  border: var(--text) 2px solid;
  background-color: var(--background);
  color: var(--text);
}

dialog.export-dialog::backdrop {
  background: rgb(0 0 0 / 70%);
}

.export-dialog[open] {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
}

.export-dialog button {
  padding: 8px 12px;
  border: var(--text) 2px solid;
  background-color: var(--background);
  color: var(--text);
  cursor: pointer;
  transition: background-color 0.2s;
}

.export-dialog button:hover {
  background-color: var(--background-hover);
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

/* Topbar */
.topbar {
  position: absolute;
  top: -24px;
  left: 0;
  display: flex;
  align-items: center;
  width: 100%;
  min-width: min-content;
  min-width: 256px;
  border: var(--text) 2px solid;
  background-color: var(--main);
  color: var(--text-invert);
  cursor: all-scroll;
}

.topbar .name {
  width: 100%;
  height: 100%;
  padding: 0 4px;
}

.topbar button {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 24px;
  height: 24px;
}

.topbar button:hover {
  background-color: var(--main-hover);
}

/* Resize */
.resize {
  position: absolute;
  width: calc(100% - var(--resize) - var(--resize));
  height: calc(100% - var(--resize) - var(--resize));
}

.resize.n {
  top: 0;
  left: var(--resize);
  height: var(--resize);
  cursor: n-resize;
}

.resize.e {
  top: var(--resize);
  right: 0;
  width: var(--resize);
  cursor: e-resize;
}

.resize.s {
  bottom: 0;
  left: var(--resize);
  height: var(--resize);
  cursor: s-resize;
}

.resize.w {
  top: var(--resize);
  left: 0;
  width: var(--resize);
  cursor: w-resize;
}

/* Utility */
.p {
  padding: 0 8px;
}

.hidden {
  display: none;
}

.no-pointer-events {
  height: 1px;
  pointer-events: none;
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

/** Site-managed templates: the site owns placement, so hide our editors */
.image.managed .resize,
.image.managed .lock,
.image.managed .delete,
.image.managed .reset-size,
.image.managed .reset-aspect {
  display: none;
}

.image.managed canvas {
  cursor: default;
}
`;

// src/widget.html
var widget_default = `<button class="open-button">
  <div>></div>
</button>
<input class="title" type="text">
<div class="form">
  <div class="progress">
    <div></div><span></span>
  </div>
  <div class="p status"></div>
  <button class="draw" disabled>Draw</button>
  <button class="auto-draw" disabled>Auto-Draw</button>
  <label>Strategy:&nbsp;<select class="strategy">
      <option value="SEQUENTIAL" selected>Sequential</option>
      <option value="ALL">All</option>
      <option value="PERCENTAGE">Percentage</option>
    </select></label>
  <label
    title="Painted pixels earn droplets. 500 droplets buy 30 charges, 2000 buy a color. To keep the balance off colors entirely, set an image's Unowned Colors to Skip or Substitute">Droplets:&nbsp;<select
      class="droplet-strategy">
      <option value="COLORS" selected>Colors only</option>
      <option value="COLORS_FIRST">Colors first</option>
    </select></label>
  <button class="add-image" disabled>Add image</button>
  <!-- <button class="pumpkin-hunt" disabled>Pumpkin Hunt!</button> -->
  <div class="images"></div>
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
  }
  $settings;
  $status;
  $minimize;
  $topbar;
  $title;
  $draw;
  $addImage;
  $strategy;
  $dropletStrategy;
  $progressLine;
  $progressText;
  $images;
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
      $addImage: ".add-image",
      $strategy: ".strategy",
      $dropletStrategy: ".droplet-strategy",
      $progressLine: ".progress div",
      $progressText: ".progress span",
      $images: ".images",
      $autoDraw: ".auto-draw"
    });
    this.$openButton.addEventListener("click", () => this.open = !this.open);
    this.$title.addEventListener("change", () => {
      this.bot.title = this.$title.value.trim();
      save(this.bot);
    });
    this.bot.fixSpaceInInput(this.$title);
    this.$draw.addEventListener("click", () => this.bot.draw());
    this.$addImage.addEventListener("click", () => this.addImage());
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
    this.open = true;
  }
  addImage() {
    this.setDisabled("add-image", true);
    return this.run("Adding image", async () => {
      await this.bot.updateColorsData();
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*,.wbot,.wplace";
      input.click();
      await promisifyEventSource(input, ["change"], ["cancel", "error"]);
      const file = input.files?.[0];
      if (!file)
        throw new NoImageError(this.bot);
      if (file.name.endsWith(".wplace")) {
        let data;
        try {
          data = fromWplaceFile(JSON.parse(await file.text()));
        } catch {
          throw new WPlaceBotError("❌ Broken .wplace template", this.bot);
        }
        await BotImage.fromJSON(this.bot, data);
      } else if (file.name.endsWith(".wbot")) {
        await BotImage.fromJSON(this.bot, migrateImage(JSON.parse(await file.text())));
      } else {
        const reader = new FileReader;
        reader.readAsDataURL(file);
        await promisifyEventSource(reader, ["load"], ["error"]);
        await BotImage.fromJSON(this.bot, {
          url: reader.result
        });
      }
      await save(this.bot, true);
      document.location.reload();
    }, () => {
      this.setDisabled("add-image", false);
    });
  }
  update() {
    this.$title.value = this.bot.title;
    this.$strategy.value = this.bot.strategy;
    this.$dropletStrategy.value = this.bot.dropletStrategy;
    this.updateProgress();
    this.$images.innerHTML = "";
    for (let index = 0;index < this.bot.images.length; index++) {
      const image = this.bot.images[index];
      const $image = document.createElement("div");
      this.$images.append($image);
      $image.className = SID + "item";
      $image.innerHTML = obfucsateHTML(`
<canvas></canvas>
<input type="text" class="name">
<label class="toggle">
  <input type="checkbox" class="enabled" ${image.disabled ? "" : "checked"}>
  <span>${image.disabled ? "Disabled" : "Enabled"}</span>
</label>
<button class="up" title="Move up" ${index === 0 ? "disabled" : ""}>▴</button>
<button class="down" title="Move down" ${index === this.bot.images.length - 1 ? "disabled" : ""}>▾</button>`);
      const $canvas = $image.querySelector("canvas");
      $canvas.width = 48;
      $canvas.height = 64;
      const scale = Math.min(48 / image.width, 64 / image.height);
      const w = image.width * scale;
      const h = image.height * scale;
      $canvas.getContext("2d").drawImage(image.$canvas, (48 - w) / 2, (64 - h) / 2, w, h);
      $canvas.addEventListener("click", () => {
        image.position.moveScreenTo();
      });
      const $name = querySelector($image, ".name");
      $name.value = image.name;
      $name.addEventListener("change", () => {
        image.name = $name.value;
        image.updateUI();
        this.update();
        save(this.bot);
      });
      const $enabled = querySelector($image, ".enabled");
      if (image.wplaceId)
        $name.readOnly = true;
      $enabled.addEventListener("change", async () => {
        image.disabled = !$enabled.checked;
        await image.updatePixels();
        await save(this.bot);
      });
      this.bot.fixSpaceInInput($name);
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
  updateProgress() {
    let maxTasks = 0;
    let totalTasks = 0;
    for (let index = 0;index < this.bot.images.length; index++) {
      const image = this.bot.images[index];
      if (image.disabled)
        continue;
      maxTasks += image.countedPixels;
      totalTasks += image.tasks.length / 2;
    }
    const doneTasks = maxTasks - totalTasks;
    const percent = maxTasks ? doneTasks / maxTasks : 0;
    this.$progressText.textContent = `${doneTasks}/${maxTasks} ${formatPercent(percent)} ETA: ${etaText(this.bot, totalTasks)}`;
    this.$progressLine.style.transform = `scaleX(${percent})`;
    for (let index = 0;index < this.bot.images.length; index++) {
      const image = this.bot.images[index];
      image.updateProgress();
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
  autoDrawInterval;
  drawing = false;
  widget = new Widget(this);
  markerPixelPositionResolvers = [];
  lastColor;
  paintResolver;
  constructor(save2) {
    if (save2) {
      this.strategy = save2.strategy;
      this.dropletStrategy = save2.dropletStrategy;
      this.title = save2.title;
    } else {
      this.title = "WPlace-bot";
    }
    const known = new Set(save2?.images.map((image) => image.wplaceId));
    const newTemplates = readSiteTemplates().filter((template) => !known.has(template.id));
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
      const redraw = () => {
        for (let index = 0;index < this.images.length; index++)
          this.images[index].updateUI();
      };
      this.map.on("move", redraw);
      this.map.on("resize", redraw);
      await wait(500);
      progress(0.04);
      await this.updateColorsData();
      progress(0.05);
      if (save2) {
        const batchSize = 1 / save2.images.length;
        for (let index = 0;index < save2.images.length; index++) {
          await BotImage.fromJSON(this, save2.images[index], (p) => {
            progress(0.05 + (index * batchSize + p * batchSize) * 0.95);
          });
        }
      }
      await this.importSiteTemplates(newTemplates);
      await this.syncSiteTemplates();
      this.watchSiteTemplates();
      this.widget.setDisabled("draw", false);
      this.widget.setDisabled("auto-draw", false);
      this.widget.setDisabled("add-image", false);
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
          window.alert(`Wplace-Bot-Broken-Save.txt is your broken save. If you ACTUALLY need data from this save, create issue on https://github.com/SoundOfTheSky/wplace-bot/issues

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
      const firstImage = this.images[0];
      if (!firstImage)
        return;
      this.drawing = true;
      globalThis.addEventListener("mousemove", prevent, true);
      $canvas.addEventListener("wheel", prevent, true);
      this.zoomIn(4);
      await this.widget.run("Loading", (progress2) => Promise.all([
        this.updateColorsData().then(async () => {
          workerClearMapCache();
          await wait(100);
          const batchSize = 1 / this.images.length;
          for (let index = 0;index < this.images.length; index++)
            await this.images[index].updatePixels((p) => {
              progress2(index * batchSize + p * batchSize);
            });
        }),
        fetch("https://backend.wplace.live/me", {
          credentials: "include"
        }).then((x) => x.json()).then((x) => {
          this.me = x;
        })
      ]));
      const initialCharges = Math.floor(this.me.charges.count);
      let charges = initialCharges;
      let tasksLength = 0;
      for (let index = 0;index < this.images.length; index++) {
        const image = this.images[index];
        if (!image.visible)
          continue;
        tasksLength += image.tasks.length / 2;
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
        const packs = Math.min(Math.ceil((tasksLength - initialCharges) / CHARGES_PER_PACK_WITH_PAYBACK), Math.floor(this.me.droplets / DROPLETS_PER_PACK), Math.floor((this.me.charges.max - initialCharges) / CHARGES_PER_PACK));
        const droplets = this.me.droplets;
        if (packs > 0 && await this.buyChargePacks(packs))
          return this.draw(submit, droplets);
      }
      const indexes = new Map;
      const drawTask = async (image) => {
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
      const queued = initialCharges - charges;
      const meBeforePaint = this.lastMeAt;
      const painted = submit && queued > 0 ? await this.submitPaint(queued) : 0;
      if (painted >= queued)
        for (const [image, value] of indexes)
          image.tasks = image.tasks.subarray(value * 2);
      this.widget.update();
      if (this.lastMeAt === meBeforePaint) {
        this.me.charges.count = Math.max(0, this.me.charges.count - painted);
        this.me.droplets += painted * DROPLETS_PER_PIXEL;
        this.lastMeAt = Date.now();
      }
      if (wantsCharges && painted > 0 && this.me.droplets >= DROPLETS_PER_PACK && this.images.some((image) => image.visible && image.tasks.length > 0))
        return this.draw(submit);
    }, () => {
      this.drawing = false;
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
    for (let index = 0;index < this.images.length; index++) {
      const image = this.images[index];
      if (image.visible)
        tasks += image.tasks.length / 2;
    }
    if (tasks === 0)
      return maxCharges * cooldownMs;
    const buysCharges = this.spendsOnCharges && this.colorsToBuy().length === 0;
    const bought = buysCharges ? Math.floor((this.me?.droplets ?? 0) / DROPLETS_PER_PACK) * CHARGES_PER_PACK : 0;
    const painting = Math.min(tasks, maxCharges);
    const missing = painting - (this.me?.charges.count ?? 0) - bought;
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
  async toJSON() {
    return {
      version: SAVE_VERSION,
      images: await Promise.all(this.images.map((x) => x.toJSON())),
      strategy: this.strategy,
      dropletStrategy: this.dropletStrategy,
      title: this.title
    };
  }
  async importSiteTemplates(templates) {
    if (templates.length === 0)
      return;
    await this.widget.run("Importing templates", async (progress) => {
      const batchSize = 1 / templates.length;
      for (let index = 0;index < templates.length; index++) {
        const template = templates[index];
        const url = await readSiteTemplateImage(template.id);
        if (!url)
          continue;
        await BotImage.fromJSON(this, {
          ...template.data,
          opacity: 0,
          url,
          wplaceId: template.id,
          disabled: false,
          siteDisabled: template.data.disabled
        }, (p) => {
          progress(index * batchSize + p * batchSize);
        });
      }
    });
    await save(this, true);
  }
  watchSiteTemplates() {
    let snapshot = localStorage.getItem(OVERLAYS_KEY);
    let syncing = false;
    setInterval(() => {
      if (this.drawing || syncing)
        return;
      const current = localStorage.getItem(OVERLAYS_KEY);
      if (current === snapshot)
        return;
      snapshot = current;
      syncing = true;
      this.syncSiteTemplates().finally(() => {
        syncing = false;
      });
    }, 1000);
  }
  async syncSiteTemplates() {
    const templates = new Map(readSiteTemplates().map((template) => [template.id, template.data]));
    let changed = false;
    for (let index = this.images.length - 1;index >= 0; index--) {
      const image = this.images[index];
      if (!image.wplaceId)
        continue;
      const data = templates.get(image.wplaceId);
      if (data) {
        templates.delete(image.wplaceId);
        if (await image.applySiteTemplate(data))
          changed = true;
      } else {
        image.destroy();
        changed = true;
      }
    }
    if (templates.size !== 0) {
      const fresh = [...templates].map(([id, data]) => ({ id, data }));
      await this.importSiteTemplates(fresh);
      changed = true;
    }
    if (changed) {
      this.widget.update();
      await save(this, true);
    }
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
  zoomIn(pixelSize) {
    const zoom = zoomForPixelSize(pixelSize);
    if (this.map.getZoom() < zoom)
      this.map.jumpTo({ zoom });
  }
  registerFetchInterceptor() {
    const originalFetch = globalThis.fetch;
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
