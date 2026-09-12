/** How draw calls are distributed between images */
export enum BotStrategy {
  ALL = 'ALL',
  PERCENTAGE = 'PERCENTAGE',
  SEQUENTIAL = 'SEQUENTIAL',
}

/**
 * What the one droplet balance is spent on. There is no "charges only": an
 * image that should not eat the balance on colors says so itself, through its
 * own `UnownedColorStrategy`
 */
export enum DropletStrategy {
  /** Colors only, as wplace-bot always did. Charges are never bought */
  COLORS = 'COLORS',
  /** Save up for a needed color first, buy charges the rest of the time */
  COLORS_FIRST = 'COLORS_FIRST',
}
