import {
  type WorkerPixelsRequest,
  type WorkerPixelsResponse,
  type WorkerResponse,
} from './processing/protocol'

export const worker = new Worker(
  URL.createObjectURL(
    new Blob([`<WORKER_SOURCE_CODE>`], { type: 'application/javascript' }),
  ),
  {
    type: 'module',
  },
)
const pending = new Map<
  number,
  {
    resolve: (data: WorkerPixelsResponse) => void
    reject: (error: Error) => void
    progress?: (percent: number) => void
  }
>()
let nextId = 0

worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
  const data = pending.get(e.data.id)
  if (!data) return
  if ('progress' in e.data) data.progress?.(e.data.progress)
  else {
    pending.delete(e.data.id)
    if ('error' in e.data) data.reject(new Error(e.data.error))
    else data.resolve(e.data)
  }
}

/** A crashed worker answers nothing, so nobody waiting would ever settle */
function rejectAll(message: string) {
  for (const request of pending.values()) request.reject(new Error(message))
  pending.clear()
}

worker.onerror = (e) => {
  console.error('[WORKER ERRROR]', e)
  rejectAll(e.message || 'Worker failed')
}

worker.onmessageerror = (e) => {
  console.error('[WORKER MESSAGE ERRROR]', e)
  rejectAll('Worker message could not be read')
}

export function workerPixels(
  request: Omit<WorkerPixelsRequest, 'id'>,
  progress?: (percent: number) => void,
): Promise<WorkerPixelsResponse> {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, progress, reject })
    worker.postMessage({ ...request, id } satisfies WorkerPixelsRequest)
  })
}

export function workerClearMapCache() {
  worker.postMessage('CLEAR_MAP_CACHE')
}
