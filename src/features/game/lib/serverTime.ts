/**
 * Server Time Synchronization Module
 *
 * This module provides a mechanism to synchronize client time with server time
 * to prevent time manipulation exploits.
 */

interface ServerTimeResponse {
  serverTime: number;
  serverTimestamp: string;
}

interface TimeSync {
  offset: number;
  lastSync: number;
  syncInterval: number;
}

const TIME_SYNC_STATE: TimeSync = {
  offset: 0,
  lastSync: 0,
  syncInterval: 5 * 60 * 1000, // Re-sync every 5 minutes
};

/**
 * Initialize time synchronization with server
 * Should be called once when the game loads
 */
export async function initializeTimeSync(apiUrl: string): Promise<void> {
  try {
    await syncWithServer(apiUrl);

    // Set up periodic re-sync
    setInterval(() => {
      syncWithServer(apiUrl).catch((error) => {
        if (process.env.NODE_ENV === "development") {
          // eslint-disable-next-line no-console
          console.warn("[TimeSync] Failed to re-sync time:", error);
        }
      });
    }, TIME_SYNC_STATE.syncInterval);

    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.log("[TimeSync] Time synchronization initialized");
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.error("[TimeSync] Failed to initialize time sync:", error);
    }
    // Fallback to local time if server sync fails
    TIME_SYNC_STATE.offset = 0;
  }
}

/**
 * Synchronize with server time
 */
async function syncWithServer(apiUrl: string): Promise<void> {
  const clientRequestTime = Date.now();

  try {
    const response = await fetch(`${apiUrl}/time`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Server time request failed: ${response.status}`);
    }

    const data: ServerTimeResponse = await response.json();
    const clientResponseTime = Date.now();

    // Calculate network latency and adjust for round-trip time
    const networkLatency = (clientResponseTime - clientRequestTime) / 2;
    const adjustedServerTime = data.serverTime + networkLatency;

    // Calculate offset
    TIME_SYNC_STATE.offset = adjustedServerTime - clientResponseTime;
    TIME_SYNC_STATE.lastSync = clientResponseTime;

    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.log(
        `[TimeSync] Synced - Offset: ${TIME_SYNC_STATE.offset}ms, Latency: ${networkLatency}ms`,
      );
    }
  } catch (error) {
    throw new Error(`Failed to sync with server: ${error}`);
  }
}

/**
 * Get the current server-synchronized time
 * This should be used instead of Date.now() for all game logic
 */
export function getServerTime(): number {
  // If we've never synced, fall back to local time
  if (TIME_SYNC_STATE.lastSync === 0) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.warn(
        "[TimeSync] Not initialized yet, using local time (vulnerable to manipulation)",
      );
    }
    return Date.now();
  }

  // Check if we need to warn about stale sync
  const timeSinceSync = Date.now() - TIME_SYNC_STATE.lastSync;
  if (timeSinceSync > TIME_SYNC_STATE.syncInterval * 2) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.warn(
        `[TimeSync] Time sync is stale (${Math.floor(timeSinceSync / 1000)}s old)`,
      );
    }
  }

  return Date.now() + TIME_SYNC_STATE.offset;
}

/**
 * Get the current time offset from server
 * Positive values mean client is ahead of server
 * Negative values mean client is behind server
 */
export function getTimeOffset(): number {
  return TIME_SYNC_STATE.offset;
}

/**
 * Check if time sync is healthy
 */
export function isTimeSyncHealthy(): boolean {
  if (TIME_SYNC_STATE.lastSync === 0) {
    return false;
  }

  const timeSinceSync = Date.now() - TIME_SYNC_STATE.lastSync;
  return timeSinceSync < TIME_SYNC_STATE.syncInterval * 2;
}

/**
 * Get time sync status for debugging
 */
export function getTimeSyncStatus(): TimeSync & { healthy: boolean } {
  return {
    ...TIME_SYNC_STATE,
    healthy: isTimeSyncHealthy(),
  };
}

/**
 * Validate that a timestamp is reasonable
 * Prevents clients from submitting timestamps too far in the past or future
 */
export function validateTimestamp(
  timestamp: number,
  maxDriftMs: number = 60000, // Allow 1 minute drift by default
): { valid: boolean; reason?: string } {
  const serverTime = getServerTime();
  const diff = Math.abs(timestamp - serverTime);

  if (diff > maxDriftMs) {
    return {
      valid: false,
      reason: `Timestamp drift too large: ${diff}ms (max: ${maxDriftMs}ms)`,
    };
  }

  return { valid: true };
}

/**
 * Force a time sync (useful after network issues)
 */
export async function forceTimeSync(apiUrl: string): Promise<void> {
  if (process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.log("[TimeSync] Forcing time synchronization...");
  }
  await syncWithServer(apiUrl);
}

// Export the state for testing purposes
export const __TEST_ONLY__ = {
  getState: () => TIME_SYNC_STATE,
  setState: (state: Partial<TimeSync>) => {
    Object.assign(TIME_SYNC_STATE, state);
  },
};
