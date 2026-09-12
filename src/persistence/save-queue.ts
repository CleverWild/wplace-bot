type Waiter = {
  resolve: () => void
  reject: (error: unknown) => void
}

export class SaveQueue<T> {
  private snapshot?: () => Promise<T>
  private waiters: Waiter[] = []
  private timer?: ReturnType<typeof setTimeout>
  private tail: Promise<void> = Promise.resolve()

  public constructor(
    private readonly write: (value: T) => Promise<void>,
    private readonly delayMs = 1000,
  ) {}

  public save(snapshot: () => Promise<T>, immediate = false): Promise<void> {
    this.snapshot = snapshot
    clearTimeout(this.timer)
    const result = new Promise<void>((resolve, reject) => {
      this.waiters.push({ resolve, reject })
    })
    if (immediate) void this.flush().catch(() => undefined)
    else
      this.timer = setTimeout(() => {
        void this.flush().catch(() => undefined)
      }, this.delayMs)
    return result
  }

  public flush(): Promise<void> {
    clearTimeout(this.timer)
    this.timer = undefined
    const snapshot = this.snapshot
    if (!snapshot) return this.tail
    const waiters = this.waiters
    this.snapshot = undefined
    this.waiters = []
    // Encoding may finish out of order; serialize it with the storage write.
    const job = this.tail
      .catch(() => undefined)
      .then(async () => {
        await this.write(await snapshot())
      })
    this.tail = job
    void job.then(
      () => {
        for (const waiter of waiters) waiter.resolve()
      },
      (error: unknown) => {
        for (const waiter of waiters) waiter.reject(error)
      },
    )
    return job
  }
}
