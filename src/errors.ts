import { WPlaceBot } from './bot'

export class WPlaceBotError extends Error {
  public override name = 'WPlaceBotError'
  public constructor(message: string, bot: WPlaceBot) {
    super(message)
    bot.widget.status = message
  }
}

export class NoMapError extends WPlaceBotError {
  public override name = 'NoMapError'
  public constructor(bot: WPlaceBot) {
    super("❌ Couldn't find wplace's map. The site has probably changed.", bot)
  }
}
