import { randomUUID } from "node:crypto";

export interface GenerationTask<T> {
  conversationId: string;
  clientRequestId: string;
  queuedAt: number;
  payload: T;
}

export interface ActiveGeneration<T> {
  generationId: string;
  task: GenerationTask<T>;
  controller: AbortController;
  completion: Promise<void>;
}

export interface GenerationCoordinatorOptions<T> {
  getLimit: () => number;
  run: (generationId: string, task: GenerationTask<T>, signal: AbortSignal) => Promise<void>;
  onStarted?: (generationId: string, task: GenerationTask<T>) => void;
  onQueued?: (task: GenerationTask<T>, position: number) => void;
  onSettled?: (generationId: string, task: GenerationTask<T>) => void;
}

export class GenerationCoordinator<T> {
  private readonly queues = new Map<string, GenerationTask<T>[]>();
  private readonly activeById = new Map<string, ActiveGeneration<T>>();
  private readonly activeByConversation = new Map<string, string>();
  private shuttingDown = false;

  constructor(private readonly options: GenerationCoordinatorOptions<T>) {}

  enqueue(task: GenerationTask<T>, front = false): void {
    if (this.shuttingDown) {
      throw new Error("Generation coordinator is shutting down");
    }
    const queue = this.queues.get(task.conversationId) ?? [];
    if (front) {
      queue.unshift(task);
    } else {
      queue.push(task);
    }
    this.queues.set(task.conversationId, queue);
    this.options.onQueued?.(task, queue.indexOf(task) + 1);
    this.schedule();
  }

  interrupt(generationId: string): boolean {
    const active = this.activeById.get(generationId);
    if (!active) {
      return false;
    }
    active.controller.abort();
    return true;
  }

  getActive(generationId: string): ActiveGeneration<T> | undefined {
    return this.activeById.get(generationId);
  }

  getActiveForConversation(conversationId: string): ActiveGeneration<T> | undefined {
    const generationId = this.activeByConversation.get(conversationId);
    return generationId ? this.activeById.get(generationId) : undefined;
  }

  getQueue(conversationId: string): readonly GenerationTask<T>[] {
    return this.queues.get(conversationId) ?? [];
  }

  clearQueue(conversationId: string): void {
    this.queues.delete(conversationId);
  }

  getActiveGenerations(): readonly ActiveGeneration<T>[] {
    return [...this.activeById.values()];
  }

  async shutdown(timeoutMs = 1500): Promise<void> {
    this.shuttingDown = true;
    for (const active of this.activeById.values()) {
      active.controller.abort();
    }
    const completions = Promise.allSettled([...this.activeById.values()].map((active) => active.completion));
    await Promise.race([completions, new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))]);
  }

  private schedule(): void {
    if (this.shuttingDown) {
      return;
    }
    const limit = Math.min(16, Math.max(1, this.options.getLimit()));
    while (this.activeById.size < limit) {
      const task = this.nextTask();
      if (!task) {
        return;
      }
      this.start(task);
    }
  }

  private nextTask(): GenerationTask<T> | undefined {
    let selected: GenerationTask<T> | undefined;
    for (const [conversationId, queue] of this.queues) {
      if (queue.length === 0 || this.activeByConversation.has(conversationId)) {
        continue;
      }
      if (!selected || queue[0].queuedAt < selected.queuedAt) {
        selected = queue[0];
      }
    }
    if (!selected) {
      return undefined;
    }
    const queue = this.queues.get(selected.conversationId)!;
    queue.shift();
    if (queue.length === 0) {
      this.queues.delete(selected.conversationId);
    }
    return selected;
  }

  private start(task: GenerationTask<T>): void {
    const generationId = randomUUID();
    const controller = new AbortController();
    const active: ActiveGeneration<T> = {
      generationId,
      task,
      controller,
      completion: Promise.resolve(),
    };
    this.activeById.set(generationId, active);
    this.activeByConversation.set(task.conversationId, generationId);
    this.options.onStarted?.(generationId, task);
    active.completion = this.options.run(generationId, task, controller.signal)
      .catch(() => undefined)
      .finally(() => {
        if (this.activeByConversation.get(task.conversationId) === generationId) {
          this.activeByConversation.delete(task.conversationId);
        }
        this.activeById.delete(generationId);
        this.options.onSettled?.(generationId, task);
        this.schedule();
      });
  }
}
