export interface Clock {
  now(): number;
}

export interface IdGenerator {
  next(): string;
}

export interface GenerationEventSink<TEvent = unknown> {
  publish(event: TEvent): Promise<void> | void;
}

export const systemClock: Clock = { now: () => Date.now() };
