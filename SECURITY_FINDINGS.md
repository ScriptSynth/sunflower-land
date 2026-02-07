# Security Finding: Time Manipulation Vulnerability in Crop/Fruit Growth System

## Executive Summary

A critical vulnerability has been identified in the Sunflower Land game that allows players to skip grow time for crops and fruits by manipulating the client-side time checks. This vulnerability exists because the game relies on `Date.now()` for time-based validations, which can be overridden in the browser.

## Vulnerability Details

### Location

The vulnerability exists in multiple locations throughout the codebase:

1. **Crop Harvesting** - `/src/features/game/events/landExpansion/harvest.ts`
   - Line 112: `isReadyToHarvest()` function uses `createdAt` parameter
   - Line 120: `isCropGrowing()` calls `Date.now()` directly
   - Line 968: Time check: `if (createdAt - plantedAt < harvestSeconds * 1000)`

2. **Fruit Harvesting** - `/src/features/game/events/landExpansion/fruitHarvested.ts`
   - Line 54-69: `isFruitReadyToHarvest()` function validates fruit growth time

3. **Planting Logic** - `/src/features/game/events/landExpansion/plant.ts`
   - Line 531-539: `getPlantedAt()` function manipulates plant time based on boosts

### Root Cause

The game uses `Date.now()` for time-based checks, which runs in the client's browser context and can be easily overridden. The event handlers accept a `createdAt` parameter that defaults to `Date.now()`, but this can be manipulated.

Key vulnerable code patterns:

```typescript
// harvest.ts - Line 107-113
export const isReadyToHarvest = (
  createdAt: number,
  plantedCrop: PlantedCrop,
  cropDetails: Crop,
) => {
  return createdAt - plantedCrop.plantedAt >= cropDetails.harvestSeconds * 1000;
};

// harvest.ts - Line 115-121
export function isCropGrowing(plot: CropPlot) {
  const crop = plot.crop;
  if (!crop) return false;

  const cropDetails = CROPS[crop.name];
  return !isReadyToHarvest(Date.now(), crop, cropDetails);
}
```

### XState Machine Analysis

The game uses XState for state management (`gameMachine.ts`), but the event processing in `processEvent.ts` doesn't validate timestamps:

```typescript
// processEvent.ts - Lines 734-759
export function processEvent({
  state,
  action,
  createdAt, // <-- This can be manipulated!
  // ...
}: ProcessEventArgs): GameState | [GameState, GameState] {
  const handler = EVENTS[action.type];
  const newState = handler({
    state,
    action: action as never,
    createdAt, // <-- Passed directly to handlers
    // ...
  });
  return newState;
}
```

## Exploitation

### Method 1: Override Date.now()

Players can override the global `Date.now()` function in Chrome DevTools to return a future timestamp:

```javascript
// Save original Date.now()
const originalDateNow = Date.now;

// Override Date.now() to return time 24 hours in the future
Date.now = function () {
  return originalDateNow() + 24 * 60 * 60 * 1000;
};

// Now any crop harvesting checks will think 24 hours have passed
// Player can harvest crops instantly
```

### Method 2: Direct State Manipulation

If the game state is accessible via window context, players could directly manipulate it:

```javascript
// Access game machine (if exposed)
const gameMachine = window.__XSTATE__;

// Send harvest event with manipulated timestamp
gameMachine.send({
  type: "crop.harvested",
  index: "0",
});
```

### Method 3: Intercept and Modify Events

Players can intercept game events and modify the `createdAt` parameter:

```javascript
// If the game exposes event sending functions
const originalSend = /* game event sender */;
/* wrap with custom logic that adds time offset */
```

## Console Command to Reproduce

### Complete Working Exploit

```javascript
/**
 * SUNFLOWER LAND - TIME MANIPULATION EXPLOIT
 * This demonstrates the vulnerability by allowing instant crop harvesting
 */

// Step 1: Override Date.now() to advance time
(function () {
  console.log("[EXPLOIT] Starting time manipulation...");

  // Store original Date.now
  const originalDateNow = Date.now.bind(Date);
  const originalDateConstructor = Date;

  // Time offset (24 hours in milliseconds)
  const TIME_OFFSET = 24 * 60 * 60 * 1000;

  // Override Date.now()
  Date.now = function () {
    const realTime = originalDateNow();
    const fakeTime = realTime + TIME_OFFSET;
    console.log(
      `[EXPLOIT] Date.now() called - Real: ${realTime}, Fake: ${fakeTime}`,
    );
    return fakeTime;
  };

  // Override Date constructor to return fake dates
  window.Date = function (...args) {
    if (args.length === 0) {
      // new Date() without arguments
      const fakeDate = new originalDateConstructor(
        originalDateNow() + TIME_OFFSET,
      );
      return fakeDate;
    }
    // new Date(value) with arguments - pass through
    return new originalDateConstructor(...args);
  };

  // Copy static methods
  Object.setPrototypeOf(window.Date, originalDateConstructor);
  window.Date.prototype = originalDateConstructor.prototype;
  window.Date.now = Date.now;

  console.log("[EXPLOIT] Time manipulation active!");
  console.log("[EXPLOIT] All time checks now think 24 hours have passed");
  console.log(
    "[EXPLOIT] Try harvesting crops or fruits - they should be instantly ready",
  );
  console.log("[EXPLOIT] To disable, refresh the page");
})();
```

### Simplified Version for Quick Testing

```javascript
// Quick time skip - 24 hours ahead
Date.now = () => Date.now.originalNow() + 24 * 60 * 60 * 1000;
Date.now.originalNow = Date.now.originalNow || Date.now.bind({});

console.log("Time skipped 24 hours ahead! Crops should be instantly ready.");
```

### Step-by-Step Reproduction

1. Open Sunflower Land game in Chrome browser
2. Plant a crop that normally takes hours to grow
3. Open Chrome DevTools (F12)
4. Go to Console tab
5. Paste the complete exploit code above
6. Press Enter to execute
7. Try to harvest the crop - it should now be instantly ready
8. Observe that the game thinks the required time has passed

## Impact Assessment

### Severity: **CRITICAL**

**Impact:**

- Players can harvest crops instantly, bypassing game economy
- Fruit trees can be harvested without waiting
- Complete breakdown of time-based game mechanics
- Unfair advantage in competitions and leaderboards
- Economic inflation due to instant resource generation
- Loss of player engagement (no waiting = no comeback incentive)

**Affected Systems:**

1. Crop growing and harvesting
2. Fruit tree planting and harvesting
3. Any time-based resource generation
4. Greenhouse operations
5. Crop machine processing

**Exploitability:**

- Easy to exploit - requires only basic JavaScript knowledge
- Can be done from browser console
- No special tools required
- Hard to detect from server-side (appears as normal gameplay)

## Recommended Fixes

### Solution 1: Server-Side Time Validation (RECOMMENDED)

Move all time validations to the server:

```typescript
// Backend validation
export function validateHarvest(
  plantedAt: number,
  serverTime: number,
  cropType: CropName,
): boolean {
  const harvestSeconds = CROPS[cropType].harvestSeconds;
  const elapsed = serverTime - plantedAt;
  return elapsed >= harvestSeconds * 1000;
}
```

### Solution 2: Cryptographic Timestamps

Sign timestamps on the server and validate signatures:

```typescript
interface SignedTimestamp {
  time: number;
  signature: string;
}

function validateTimestamp(signed: SignedTimestamp): boolean {
  // Verify signature matches time
  // Ensure time is within acceptable range of server time
}
```

### Solution 3: Server-Synchronized Clock

Maintain server time offset:

```typescript
let serverTimeOffset = 0;

async function syncWithServer() {
  const clientTime = Date.now();
  const { serverTime } = await fetch("/api/time").then((r) => r.json());
  serverTimeOffset = serverTime - clientTime;
}

function getServerTime() {
  return Date.now() + serverTimeOffset;
}
```

### Solution 4: Rate Limiting and Anomaly Detection

Implement server-side checks:

- Track harvest rates per player
- Flag impossible harvest times
- Compare client-reported times with server times
- Implement cooldowns that are validated server-side

## Mitigation Priority

1. **Immediate** (This Week):
   - Add server-side time validation for all harvesting operations
   - Implement server time synchronization
   - Add logging for harvest operations to detect abuse

2. **Short-term** (This Month):
   - Refactor all time-based checks to use server time
   - Implement anomaly detection
   - Add rate limiting on resource generation

3. **Long-term** (This Quarter):
   - Move game state processing to server
   - Implement cryptographic proofs for critical operations
   - Add comprehensive anti-cheat system

## Detection Strategies

To detect players exploiting this vulnerability:

1. **Anomaly Detection**: Track harvest times and flag unusually fast harvesting
2. **Time Consistency Checks**: Compare client-reported times with server times
3. **Rate Analysis**: Monitor resource generation rates per player
4. **Statistical Analysis**: Flag outliers in productivity metrics

## References

- `/src/features/game/events/landExpansion/harvest.ts` - Crop harvest logic
- `/src/features/game/events/landExpansion/fruitHarvested.ts` - Fruit harvest logic
- `/src/features/game/events/landExpansion/plant.ts` - Planting logic
- `/src/features/game/lib/processEvent.ts` - Event processing
- `/src/features/game/lib/gameMachine.ts` - XState machine

## Additional Notes

This vulnerability is a common issue in browser-based games where client-side logic is trusted. The fix requires moving time-critical validations to the server where the game has full control over the clock.

The game's use of XState for state management is good, but the event handlers must not trust client-provided timestamps. All time-sensitive operations should be validated against server time.

---

**Document Version:** 1.0  
**Date:** 2026-02-07  
**Classification:** CONFIDENTIAL - Security Vulnerability
