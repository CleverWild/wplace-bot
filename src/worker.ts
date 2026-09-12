import { calculatePixels } from './processing/pipeline'
import {
  type WorkerPixelsRequest,
  type WorkerResponse,
} from './processing/protocol'
import { TileCache } from './processing/tile-cache'

const tiles = new TileCache()

function send(response: WorkerResponse, transfer: ArrayBuffer[] = []) {
  postMessage(response, transfer)
}

self.onmessage = async (
  e: MessageEvent<WorkerPixelsRequest | 'CLEAR_MAP_CACHE'>,
) => {
  if (e.data === 'CLEAR_MAP_CACHE') {
    tiles.clear()
    return
  }
  const request = e.data
  const progress = (p: number) => {
    send({ id: request.id, progress: p })
  }
  try {
    const maps = await tiles.load(
      request.globalX,
      request.globalY,
      request.width,
      request.height,
      progress,
    )
    const result = calculatePixels(request, maps, progress)
    send(result, [result.taskPositions.buffer, result.pixels.buffer])
  } catch (error) {
    send({
      id: request.id,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
