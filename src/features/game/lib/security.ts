/**
 * Security validation utilities for game events
 * These functions provide additional validation to prevent exploits
 */

import { GameEvent } from "../events";
import { GameState } from "../types/game";
import { FarmActivityName } from "../types/farmActivity";

/**
 * Maximum allowed time skew between client and server (5 seconds)
 */
export const MAX_TIME_SKEW_MS = 5000;

/**
 * Maximum number of events allowed in a single batch
 */
export const MAX_EVENTS_PER_BATCH = 100;

/**
 * Validates that client timestamp is within acceptable range of server time
 * @param clientTime - Timestamp provided by client
 * @param serverTime - Current server timestamp
 * @throws Error if time skew exceeds maximum allowed
 */
export function validateTimestamp(
  clientTime: number,
  serverTime: number,
): void {
  const diff = Math.abs(clientTime - serverTime);

  if (diff > MAX_TIME_SKEW_MS) {
    throw new Error(
      `Time skew too large: ${diff}ms (max: ${MAX_TIME_SKEW_MS}ms)`,
    );
  }
}

/**
 * Validates that event batch size doesn't exceed maximum
 * @param events - Array of game events
 * @throws Error if batch exceeds maximum size
 */
export function validateEventBatchSize(events: GameEvent[]): void {
  if (events.length > MAX_EVENTS_PER_BATCH) {
    throw new Error(
      `Too many events in batch: ${events.length} (max: ${MAX_EVENTS_PER_BATCH})`,
    );
  }
}

/**
 * Validates that PRNG counter matches server state
 * This prevents clients from manipulating counters to influence RNG outcomes
 * @param activityName - Name of the farm activity
 * @param clientCounter - Counter value provided by client
 * @param serverState - Authoritative server game state
 * @throws Error if counter doesn't match server state
 */
export function validatePrngCounter(
  activityName: FarmActivityName,
  clientCounter: number,
  serverState: GameState,
): void {
  const serverCounter = serverState.farmActivity[activityName] ?? 0;

  if (clientCounter !== serverCounter) {
    throw new Error(
      `PRNG counter mismatch for ${activityName}: expected ${serverCounter}, got ${clientCounter}`,
    );
  }
}

/**
 * Validates that a crop is ready to harvest based on plant time
 * @param plantedAt - Timestamp when crop was planted
 * @param harvestSeconds - Required seconds for crop to grow
 * @param currentTime - Current timestamp
 * @throws Error if crop is not ready
 */
export function validateCropReadiness(
  plantedAt: number,
  harvestSeconds: number,
  currentTime: number,
): void {
  const requiredTime = harvestSeconds * 1000;
  const elapsed = currentTime - plantedAt;

  if (elapsed < requiredTime) {
    const remaining = Math.ceil((requiredTime - elapsed) / 1000);
    throw new Error(
      `Crop not ready: ${remaining}s remaining (requires ${harvestSeconds}s)`,
    );
  }
}

/**
 * Validates that an animal is awake and can be fed
 * @param awakeAt - Timestamp when animal will wake up
 * @param currentTime - Current timestamp
 * @param state - Current animal state
 * @throws Error if animal is still asleep
 */
export function validateAnimalAwake(
  awakeAt: number,
  currentTime: number,
  state: string,
): void {
  if (currentTime < awakeAt && state !== "sick") {
    const remaining = Math.ceil((awakeAt - currentTime) / 1000 / 60);
    throw new Error(`Animal is asleep: ${remaining} minutes remaining`);
  }
}

/**
 * Validates event sequence to prevent replay attacks
 * Note: This requires server-side sequence tracking
 * @param eventSequence - Sequence number from event
 * @param expectedSequence - Expected sequence number from server
 * @throws Error if sequence number doesn't match
 */
export function validateEventSequence(
  eventSequence: number,
  expectedSequence: number,
): void {
  if (eventSequence !== expectedSequence) {
    throw new Error(
      `Invalid event sequence: expected ${expectedSequence}, got ${eventSequence}`,
    );
  }
}

/**
 * Validates that a plot exists and has required coordinates
 * @param plotId - Plot identifier
 * @param plots - All plots in game state
 * @throws Error if plot doesn't exist or isn't placed
 */
export function validatePlotPlacement(
  plotId: string,
  plots: Record<string, { x?: number; y?: number }>,
): void {
  const plot = plots[plotId];

  if (!plot) {
    throw new Error(`Plot ${plotId} does not exist`);
  }

  if (plot.x === undefined || plot.y === undefined) {
    throw new Error(`Plot ${plotId} is not placed`);
  }
}

/**
 * Validates resource sufficiency before consumption
 * @param resourceName - Name of the resource
 * @param required - Amount required
 * @param available - Amount available in inventory
 * @throws Error if insufficient resources
 */
export function validateResourceSufficiency(
  resourceName: string,
  required: number,
  available: number,
): void {
  if (available < required) {
    throw new Error(
      `Insufficient ${resourceName}: have ${available}, need ${required}`,
    );
  }
}
