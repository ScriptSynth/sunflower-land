# Security Integration Guide

## Overview

This guide demonstrates how to integrate the new security validation utilities into existing game event handlers. The validation functions provide defense-in-depth protection against common exploit attempts.

## Available Validation Functions

All functions are available from `src/features/game/lib/security.ts`:

- `validateTimestamp()` - Prevents time manipulation exploits
- `validateEventBatchSize()` - Prevents DoS via large event batches
- `validatePrngCounter()` - Ensures PRNG counter integrity
- `validateCropReadiness()` - Validates crop growth time
- `validateAnimalAwake()` - Validates animal sleep state
- `validateEventSequence()` - Prevents event replay attacks
- `validatePlotPlacement()` - Validates plot existence and placement
- `validateResourceSufficiency()` - Validates resource availability

## Integration Examples

### Example 1: Enhanced Plant Event Validation

**File**: `src/features/game/events/landExpansion/plant.ts`

```typescript
import {
  validateTimestamp,
  validatePlotPlacement,
  validateResourceSufficiency,
} from "../../lib/security";

export function plant({
  state,
  action,
  createdAt = Date.now(),
  farmId,
}: Options): GameState {
  return produce(state, (stateCopy) => {
    // SECURITY: Validate timestamp against server time
    if (CONFIG.API_URL) {
      // Only validate when using server
      const serverTime = Date.now();
      validateTimestamp(createdAt, serverTime);
    }

    // SECURITY: Validate plot placement
    validatePlotPlacement(action.index, stateCopy.crops);

    // SECURITY: Validate seed availability
    const seedAmount = stateCopy.inventory[action.item]?.toNumber() ?? 0;
    validateResourceSufficiency(action.item, 1, seedAmount);

    // Original plant logic continues...
    const { crops: plots } = stateCopy;
    // ... rest of plant function
  });
}
```

### Example 2: Enhanced Harvest Event Validation

**File**: `src/features/game/events/landExpansion/harvest.ts`

```typescript
import { validateTimestamp, validateCropReadiness } from "../../lib/security";
import { CROPS } from "../../types/crops";

export function harvestCropFromPlot({
  plotId,
  game,
  createdAt,
  farmId,
}: {
  plotId: string;
  game: GameState;
  createdAt: number;
  farmId: number;
}): {
  updatedPlot: CropPlot;
  amount: number;
  aoe: AOE;
  boostsUsed: BoostName[];
  cropName: CropName;
} {
  // SECURITY: Validate timestamp
  if (CONFIG.API_URL) {
    const serverTime = Date.now();
    validateTimestamp(createdAt, serverTime);
  }

  const plot = game.crops[plotId];
  if (!plot?.crop) {
    throw new Error("Nothing was planted");
  }

  const { name: cropName, plantedAt } = plot.crop;
  const cropDetails = CROPS[cropName];

  // SECURITY: Validate crop is ready to harvest
  validateCropReadiness(plantedAt, cropDetails.harvestSeconds, createdAt);

  // Original harvest logic continues...
  // ... rest of harvestCropFromPlot function
}
```

### Example 3: Enhanced Feed Animal Event Validation

**File**: `src/features/game/events/landExpansion/feedAnimal.ts`

```typescript
import {
  validateTimestamp,
  validateAnimalAwake,
  validateResourceSufficiency,
} from "../../lib/security";

export function feedAnimal({
  state,
  action,
  createdAt = Date.now(),
}: Options): GameState {
  return produce(state, (copy) => {
    // SECURITY: Validate timestamp
    if (CONFIG.API_URL) {
      const serverTime = Date.now();
      validateTimestamp(createdAt, serverTime);
    }

    const buildingKey = makeAnimalBuildingKey(buildingRequired);
    const animal = copy[buildingKey].animals[action.id];

    if (!animal) {
      throw new Error(`Animal ${action.id} not found`);
    }

    // SECURITY: Validate animal is awake
    validateAnimalAwake(animal.awakeAt, createdAt, animal.state);

    // Handle feeding logic...
    if (action.item && action.item !== "Barn Delight") {
      const foodAmount = copy.inventory[action.item]?.toNumber() ?? 0;
      const requiredFood = REQUIRED_FOOD_QTY[action.animal];

      // SECURITY: Validate food availability
      validateResourceSufficiency(action.item, requiredFood, foodAmount);
    }

    // Original feeding logic continues...
    // ... rest of feedAnimal function
  });
}
```

### Example 4: Server-Side Autosave Validation

**File**: `src/features/game/lib/autosave.ts` (server-side)

```typescript
import {
  validateTimestamp,
  validateEventBatchSize,
  validatePrngCounter,
} from "./security";

export async function processAutosave(
  request: AutosaveRequest,
): Promise<AutosaveResponse> {
  const serverTime = Date.now();

  // SECURITY: Validate request timestamp
  validateTimestamp(request.createdAt, serverTime);

  // SECURITY: Validate event batch size
  validateEventBatchSize(request.actions);

  // Load server state
  const serverState = await loadFarmState(request.farmId);

  // Process each event
  for (const action of request.actions) {
    // SECURITY: Validate PRNG counters for harvest events
    if (action.type === "crop.harvested") {
      const cropName = serverState.crops[action.index]?.crop?.name;
      if (cropName) {
        const activityName = `${cropName} Harvested` as FarmActivityName;
        const counter = serverState.farmActivity[activityName] ?? 0;
        validatePrngCounter(activityName, counter, serverState);
      }
    }

    // Process event with validated state
    serverState = processEvent({
      state: serverState,
      action,
      createdAt: serverTime, // Use server time, not client time
      farmId: request.farmId,
    });
  }

  // Save updated state
  await saveFarmState(request.farmId, serverState);

  return { farm: serverState };
}
```

### Example 5: Event Sequence Validation (Advanced)

For preventing replay attacks, implement sequence tracking:

```typescript
// In game state
interface GameState {
  // ... existing fields
  eventSequence?: number; // Add sequence tracking
}

// In processEvent
export function processEvent({
  state,
  action,
  createdAt,
  farmId,
}: ProcessEventArgs): GameState {
  // SECURITY: Validate event sequence (if enabled)
  if (state.eventSequence !== undefined) {
    const actionWithSequence = action as any;
    if (actionWithSequence.sequence !== undefined) {
      validateEventSequence(
        actionWithSequence.sequence,
        state.eventSequence + 1,
      );
    }
  }

  // Process event
  const newState = EVENTS[action.type]({
    state,
    action: action as never,
    createdAt,
    farmId,
  });

  // Increment sequence
  if (newState.eventSequence !== undefined) {
    newState.eventSequence += 1;
  }

  return newState;
}
```

## Server-Side Implementation Checklist

When implementing these validations server-side:

1. ✅ **Use server time** - Override `createdAt` with `Date.now()` on server
2. ✅ **Validate all timestamps** - Call `validateTimestamp()` before processing
3. ✅ **Validate batch sizes** - Call `validateEventBatchSize()` on event arrays
4. ✅ **Validate PRNG counters** - Ensure client counters match server state
5. ✅ **Log validation failures** - Track potential exploit attempts
6. ✅ **Rate limit failures** - Temporarily ban IPs with repeated failures
7. ✅ **Monitor metrics** - Alert on unusual validation failure rates

## Testing Security Validations

Run the security test suite:

```bash
yarn test security.test.ts
```

All 40 tests should pass, covering:

- Timestamp validation (5 tests)
- Batch size validation (4 tests)
- PRNG counter validation (4 tests)
- Crop readiness validation (4 tests)
- Animal awake validation (4 tests)
- Event sequence validation (4 tests)
- Plot placement validation (5 tests)
- Resource sufficiency validation (5 tests)
- Integration scenarios (5 tests)

## Performance Considerations

These validation functions are designed to be lightweight:

- **validateTimestamp**: O(1) - Simple arithmetic
- **validateEventBatchSize**: O(1) - Array length check
- **validatePrngCounter**: O(1) - Object property lookup
- **validateCropReadiness**: O(1) - Simple arithmetic
- **validateAnimalAwake**: O(1) - Simple comparison
- **validateEventSequence**: O(1) - Simple comparison
- **validatePlotPlacement**: O(1) - Object property lookup
- **validateResourceSufficiency**: O(1) - Simple comparison

**Total overhead**: < 0.1ms per event (negligible)

## Configuration

Control validation behavior via environment variables:

```typescript
// Enable/disable server-side validation
const ENABLE_TIMESTAMP_VALIDATION =
  process.env.ENABLE_TIMESTAMP_VALIDATION !== "false";
const ENABLE_SEQUENCE_VALIDATION =
  process.env.ENABLE_SEQUENCE_VALIDATION === "true";

// Adjust validation parameters
const MAX_TIME_SKEW_MS = parseInt(process.env.MAX_TIME_SKEW_MS || "5000");
const MAX_EVENTS_PER_BATCH = parseInt(
  process.env.MAX_EVENTS_PER_BATCH || "100",
);
```

## Monitoring and Alerting

Set up monitoring for security events:

```typescript
// Log validation failures
function logSecurityEvent(event: {
  type: string;
  farmId: number;
  error: string;
  timestamp: number;
}) {
  console.warn("[SECURITY]", event);

  // Send to monitoring service
  monitoring.track("security.validation_failed", {
    type: event.type,
    farmId: event.farmId,
    error: event.error,
  });

  // Alert if rate exceeds threshold
  const recentFailures = getRecentFailures(event.farmId);
  if (recentFailures > 10) {
    alert.send({
      severity: "HIGH",
      message: `Farm ${event.farmId} has ${recentFailures} validation failures`,
    });
  }
}
```

## Common Pitfalls

### ❌ Don't: Trust Client Time

```typescript
// BAD: Using client-provided time for validation
export function harvest({ createdAt }: Options) {
  const elapsed = createdAt - plantedAt; // Client can manipulate this!
  if (elapsed < harvestSeconds * 1000) {
    throw new Error("Not ready");
  }
}
```

### ✅ Do: Use Server Time

```typescript
// GOOD: Using server time for validation
export function harvest({ createdAt }: Options) {
  const serverTime = Date.now();
  validateTimestamp(createdAt, serverTime);

  const elapsed = serverTime - plantedAt; // Server-controlled
  if (elapsed < harvestSeconds * 1000) {
    throw new Error("Not ready");
  }
}
```

### ❌ Don't: Trust Client Counters

```typescript
// BAD: Using client counter for PRNG without validation
const prngValue = prng({
  farmId,
  itemId,
  counter: clientCounter, // Client can manipulate!
});
```

### ✅ Do: Validate Counters

```typescript
// GOOD: Validate counter against server state
validatePrngCounter(activityName, clientCounter, serverState);

const prngValue = prng({
  farmId,
  itemId,
  counter: serverState.farmActivity[activityName] ?? 0,
});
```

## Additional Resources

- [SECURITY_ANALYSIS.md](./SECURITY_ANALYSIS.md) - Complete security analysis
- [security.ts](../src/features/game/lib/security.ts) - Validation function implementations
- [security.test.ts](../src/features/game/lib/security.test.ts) - Comprehensive test suite
- [SECURITY.md](../SECURITY.md) - Security policy and reporting

## Support

For questions or concerns about security:

- Review the [security policy](../SECURITY.md)
- Contact the team in `#coders-chat` on Discord
- Report vulnerabilities responsibly per the security policy
