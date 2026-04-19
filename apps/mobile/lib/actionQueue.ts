// ============================================================
// VARS — Offline action queue (AsyncStorage-backed)
// Stores fetch calls that failed due to connectivity so they
// can be replayed automatically when the device comes back online.
// ============================================================
import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = 'vars_action_queue';

export interface QueuedAction {
  id: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
  enqueuedAt: number;
}

async function readQueue(): Promise<QueuedAction[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedAction[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueuedAction[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function enqueueAction(
  action: Omit<QueuedAction, 'id' | 'enqueuedAt'>,
): Promise<void> {
  const queue = await readQueue();
  queue.push({
    ...action,
    id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
    enqueuedAt: Date.now(),
  });
  await writeQueue(queue);
}

export async function removeFromQueue(id: string): Promise<void> {
  const queue = await readQueue();
  await writeQueue(queue.filter((a) => a.id !== id));
}

export async function getQueue(): Promise<QueuedAction[]> {
  return readQueue();
}

/**
 * Replay all queued actions in order. Removes each action on success;
 * leaves it in the queue if the request still fails (no rethrow).
 * Returns the number of actions successfully flushed.
 */
export async function flushQueue(): Promise<number> {
  const queue = await readQueue();
  let flushed = 0;
  for (const action of queue) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8_000);
      const res = await fetch(action.url, {
        method: action.method,
        headers: action.headers,
        body: action.body,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        await removeFromQueue(action.id);
        flushed++;
      }
    } catch {
      // Leave in queue for next flush cycle
    }
  }
  return flushed;
}
