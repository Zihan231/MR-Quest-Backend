export class Semaphore {
  private active = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active += 1;
      return;
    }

    await new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
    this.active += 1;
  }

  release(): void {
    this.active -= 1;
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }
}

export const mediaSemaphore = new Semaphore(2);
export const geminiSemaphore = new Semaphore(3);