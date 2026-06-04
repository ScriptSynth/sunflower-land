# Security Remediation Guide

This guide provides concrete implementation examples for fixing the identified vulnerabilities in Sunflower Land.

---

## Table of Contents

1. [Server-Side Architecture Changes](#1-server-side-architecture-changes)
2. [Fix: Reward Box RNG (CVE-001)](#2-fix-reward-box-rng-cve-001)
3. [Fix: Bot Detection (CVE-003)](#3-fix-bot-detection-cve-003)
4. [Fix: Session Token Security (CVE-004)](#4-fix-session-token-security-cve-004)
5. [Fix: Inventory Validation (CVE-005)](#5-fix-inventory-validation-cve-005)
6. [Fix: PRNG Security (CVE-009)](#6-fix-prng-security-cve-009)
7. [General Security Improvements](#7-general-security-improvements)

---

## 1. Server-Side Architecture Changes

### Current vs Proposed Architecture

**Current (Vulnerable):**
```
Client (Browser)
  ├─ Game Logic Execution ❌
  ├─ State Mutations ❌
  ├─ RNG Generation ❌
  └─ Validation ❌
       ↓
  Autosave to Server
```

**Proposed (Secure):**
```
Client (Browser)
  ├─ UI/UX Only
  ├─ Input Collection
  └─ State Display
       ↓
  API Request
       ↓
Server
  ├─ Authentication ✓
  ├─ Authorization ✓
  ├─ Game Logic Execution ✓
  ├─ State Mutations ✓
  ├─ RNG Generation ✓
  └─ Validation ✓
       ↓
  Response with New State
```

### Implementation Steps

1. **Create Server Action Handlers:**
```typescript
// server/handlers/gameActions.ts
export async function handleGameAction(
  farmId: number,
  action: GameAction,
  token: string
): Promise<GameState> {
  // 1. Authenticate
  const user = await authenticateToken(token);
  if (!user || user.farmId !== farmId) {
    throw new UnauthorizedError();
  }
  
  // 2. Load current state from DB
  const currentState = await loadGameState(farmId);
  
  // 3. Validate action is legal
  await validateAction(currentState, action);
  
  // 4. Execute action server-side
  const newState = await executeAction(currentState, action);
  
  // 5. Save new state
  await saveGameState(farmId, newState);
  
  // 6. Return new state
  return newState;
}
```

2. **Client Becomes Thin Client:**
```typescript
// client/features/game/actions/performAction.ts
export async function performAction(action: GameAction): Promise<void> {
  // Show optimistic UI update
  dispatch({ type: "ACTION_PENDING", action });
  
  try {
    // Send to server
    const response = await fetch(`${API_URL}/game/action`, {
      method: "POST",
      credentials: "include", // Send httpOnly cookie
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    
    if (!response.ok) {
      throw new Error(await response.text());
    }
    
    // Server returns new authoritative state
    const newState = await response.json();
    
    // Update client state
    dispatch({ type: "STATE_UPDATED", state: newState });
    
  } catch (error) {
    // Revert optimistic update
    dispatch({ type: "ACTION_FAILED", action, error });
    throw error;
  }
}
```

---

## 2. Fix: Reward Box RNG (CVE-001)

### Vulnerable Code
```typescript
// src/features/game/events/landExpansion/openRewardBox.ts
// CLIENT-SIDE RNG - VULNERABLE
let randomValue = Math.random() * totalWeight;
```

### Fixed Implementation

**Server-Side:**
```typescript
// server/services/rewardBox.ts
import crypto from "crypto";

interface RewardOption {
  item: string;
  amount: number;
  weighting: number;
}

export async function openRewardBox(
  farmId: number,
  boxType: string
): Promise<{ item: string; amount: number }> {
  // 1. Validate player has the box
  const inventory = await getInventory(farmId);
  if (!inventory[`${boxType} Box`] || inventory[`${boxType} Box`] < 1) {
    throw new Error("You don't have this reward box");
  }
  
  // 2. Get reward options for this box type
  const rewards = getRewardOptions(boxType);
  
  // 3. Use cryptographically secure RNG
  const totalWeight = rewards.reduce((sum, r) => sum + r.weighting, 0);
  const randomBytes = crypto.randomBytes(4);
  const randomValue = (randomBytes.readUInt32BE(0) / 0xFFFFFFFF) * totalWeight;
  
  // 4. Select reward
  let selected: RewardOption | null = null;
  let accumulatedWeight = 0;
  
  for (const reward of rewards) {
    accumulatedWeight += reward.weighting;
    if (randomValue <= accumulatedWeight) {
      selected = reward;
      break;
    }
  }
  
  if (!selected) {
    selected = rewards[rewards.length - 1]; // Fallback
  }
  
  // 5. Update inventory atomically
  await db.query(`
    UPDATE game_state 
    SET 
      inventory = jsonb_set(
        jsonb_set(
          inventory,
          '{${boxType} Box}',
          (COALESCE((inventory->>'${boxType} Box')::int, 0) - 1)::text::jsonb
        ),
        '{${selected.item}}',
        (COALESCE((inventory->>'${selected.item}')::int, 0) + ${selected.amount})::text::jsonb
      )
    WHERE farm_id = $1
  `, [farmId]);
  
  // 6. Log for audit trail
  await logRewardBoxOpen(farmId, boxType, selected);
  
  return { item: selected.item, amount: selected.amount };
}
```

**Client-Side (Thin):**
```typescript
// src/features/game/events/landExpansion/openRewardBox.ts
export async function openRewardBox(
  state: GameState,
  action: OpenRewardBoxAction
): Promise<GameState> {
  // Client just makes API call
  const response = await fetch(`${API_URL}/reward-box/open`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ boxType: action.boxType }),
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }
  
  const { item, amount, newState } = await response.json();
  
  // Show reward animation
  showRewardAnimation(item, amount);
  
  // Return server-authoritative state
  return newState;
}
```

---

## 3. Fix: Bot Detection (CVE-003)

### Vulnerable Code
```typescript
// Client-side storage - VULNERABLE
localStorage.setItem("goblin.swarm", timestamp);
```

### Fixed Implementation

**Server-Side:**
```typescript
// server/middleware/antiCheat.ts
import Redis from "redis";

const redis = Redis.createClient();

interface ActionMetrics {
  count: number;
  timestamps: number[];
  lastAction: number;
}

export async function detectBotBehavior(
  farmId: number,
  action: GameAction
): Promise<boolean> {
  const key = `actions:${farmId}`;
  const now = Date.now();
  
  // Get recent actions
  const metrics: ActionMetrics = await redis.get(key).then(data => 
    data ? JSON.parse(data) : { count: 0, timestamps: [], lastAction: 0 }
  );
  
  // 1. Check action rate (max 10 actions per minute)
  const recentActions = metrics.timestamps.filter(t => now - t < 60000);
  if (recentActions.length >= 10) {
    await flagBotActivity(farmId, "HIGH_ACTION_RATE");
    return true;
  }
  
  // 2. Check for impossibly fast actions (< 100ms between actions)
  if (now - metrics.lastAction < 100) {
    await flagBotActivity(farmId, "IMPOSSIBLE_SPEED");
    return true;
  }
  
  // 3. Check for repetitive patterns
  if (isRepetitivePattern(metrics.timestamps)) {
    await flagBotActivity(farmId, "REPETITIVE_PATTERN");
    return true;
  }
  
  // 4. Check for suspicious timing (exact intervals)
  if (hasExactIntervals(metrics.timestamps)) {
    await flagBotActivity(farmId, "EXACT_INTERVALS");
    return true;
  }
  
  // Update metrics
  metrics.count++;
  metrics.timestamps.push(now);
  metrics.lastAction = now;
  
  // Keep only last 100 timestamps
  if (metrics.timestamps.length > 100) {
    metrics.timestamps = metrics.timestamps.slice(-100);
  }
  
  await redis.setex(key, 3600, JSON.stringify(metrics)); // 1 hour TTL
  
  return false;
}

async function flagBotActivity(farmId: number, reason: string): Promise<void> {
  // Log to database
  await db.query(`
    INSERT INTO bot_detections (farm_id, reason, detected_at)
    VALUES ($1, $2, NOW())
  `, [farmId, reason]);
  
  // Apply cooldown
  const cooldownKey = `cooldown:${farmId}`;
  await redis.setex(cooldownKey, 3600, "1"); // 1 hour cooldown
}

export async function isInCooldown(farmId: number): Promise<boolean> {
  const cooldownKey = `cooldown:${farmId}`;
  return (await redis.get(cooldownKey)) !== null;
}

function isRepetitivePattern(timestamps: number[]): boolean {
  if (timestamps.length < 5) return false;
  
  const intervals = [];
  for (let i = 1; i < timestamps.length; i++) {
    intervals.push(timestamps[i] - timestamps[i - 1]);
  }
  
  // Check if all intervals are similar (within 10ms)
  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const variance = intervals.reduce((sum, interval) => 
    sum + Math.pow(interval - avgInterval, 2), 0
  ) / intervals.length;
  
  return variance < 100; // Very low variance = bot
}

function hasExactIntervals(timestamps: number[]): boolean {
  if (timestamps.length < 3) return false;
  
  const intervals = [];
  for (let i = 1; i < timestamps.length; i++) {
    intervals.push(timestamps[i] - timestamps[i - 1]);
  }
  
  // Check for exact intervals (common in automated scripts)
  const exactMatches = intervals.filter(interval => 
    intervals.filter(i => i === interval).length > 2
  );
  
  return exactMatches.length > intervals.length / 2;
}
```

**Express Middleware:**
```typescript
// server/middleware/antiCheat.middleware.ts
export const antiCheatMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const farmId = req.user?.farmId;
  
  if (!farmId) {
    return next();
  }
  
  // Check cooldown
  if (await isInCooldown(farmId)) {
    return res.status(429).json({
      error: "Bot behavior detected. Please wait before trying again.",
      cooldownUntil: await getCooldownExpiry(farmId),
    });
  }
  
  // Check current action
  const isBot = await detectBotBehavior(farmId, req.body.action);
  
  if (isBot) {
    return res.status(429).json({
      error: "Bot behavior detected. Action blocked.",
    });
  }
  
  next();
};

// Apply to all game action routes
app.post("/game/action", antiCheatMiddleware, handleGameAction);
```

---

## 4. Fix: Session Token Security (CVE-004)

### Vulnerable Code
```typescript
// Tokens in localStorage - VULNERABLE
localStorage.setItem("session", JSON.stringify({ token, farmId }));
```

### Fixed Implementation

**Server-Side:**
```typescript
// server/auth/session.ts
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_EXPIRY = "24h";

export function generateSessionToken(farmId: number, address: string): string {
  return jwt.sign(
    {
      farmId,
      address,
      type: "session",
    },
    JWT_SECRET,
    {
      expiresIn: JWT_EXPIRY,
      issuer: "sunflower-land",
      audience: "game-client",
    }
  );
}

export async function login(
  req: Request,
  res: Response
): Promise<void> {
  const { signature, address } = req.body;
  
  // Verify signature
  const isValid = await verifySignature(signature, address);
  if (!isValid) {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }
  
  // Get or create farm
  const farm = await getOrCreateFarm(address);
  
  // Generate session token
  const token = generateSessionToken(farm.id, address);
  
  // Set httpOnly cookie (XSS-safe)
  res.cookie("session", token, {
    httpOnly: true,      // Cannot be accessed by JavaScript
    secure: true,        // HTTPS only
    sameSite: "strict",  // CSRF protection
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    path: "/",
  });
  
  // Return farm data (NOT the token)
  res.json({
    farmId: farm.id,
    address: farm.address,
    // Token is in httpOnly cookie, not in response
  });
}

export function authenticateMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const token = req.cookies.session;
  
  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  
  try {
    const payload = jwt.verify(token, JWT_SECRET) as {
      farmId: number;
      address: string;
    };
    
    req.user = payload;
    next();
  } catch (error) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
```

**Client-Side:**
```typescript
// src/features/auth/actions/login.ts
export async function login(
  signature: string,
  address: string
): Promise<{ farmId: number; address: string }> {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    credentials: "include", // Include cookies in request
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signature, address }),
  });
  
  if (!response.ok) {
    throw new Error("Login failed");
  }
  
  // Token is in httpOnly cookie, we only get farm data
  const data = await response.json();
  
  // Store non-sensitive data in localStorage
  localStorage.setItem("farmId", data.farmId.toString());
  localStorage.setItem("address", data.address);
  
  return data;
}

// All API calls now use credentials: "include"
export async function apiCall(endpoint: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${API_URL}${endpoint}`, {
    ...options,
    credentials: "include", // Always include httpOnly cookie
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
}
```

---

## 5. Fix: Inventory Validation (CVE-005)

### Vulnerable Code
```typescript
// Direct client-side mutation - VULNERABLE
game.inventory[item] = game.inventory[item].add(amount);
```

### Fixed Implementation

**Server-Side:**
```typescript
// server/services/inventory.ts
import { GameState, InventoryItem } from "../types";

export async function buyResource(
  farmId: number,
  item: InventoryItem,
  amount: number
): Promise<GameState> {
  // 1. Validate item exists and is purchasable
  const itemConfig = getItemConfig(item);
  if (!itemConfig || !itemConfig.purchasable) {
    throw new Error("Item cannot be purchased");
  }
  
  // 2. Validate amount is positive and reasonable
  if (amount <= 0 || amount > 1000) {
    throw new Error("Invalid amount");
  }
  
  // 3. Calculate cost
  const totalCost = itemConfig.price * amount;
  
  // 4. Use database transaction for atomicity
  return await db.transaction(async (trx) => {
    // Lock the row to prevent race conditions
    const state = await trx.query(`
      SELECT * FROM game_state 
      WHERE farm_id = $1 
      FOR UPDATE
    `, [farmId]).then(r => r.rows[0]);
    
    const currentCurrency = state.inventory.Sunstone || 0;
    
    // 5. Verify player has enough currency
    if (currentCurrency < totalCost) {
      throw new Error("Insufficient currency");
    }
    
    const newItemAmount = (state.inventory[item] || 0) + amount;
    const newCurrency = currentCurrency - totalCost;
    
    // 6. Update inventory atomically
    await trx.query(`
      UPDATE game_state
      SET 
        inventory = jsonb_set(
          jsonb_set(
            inventory,
            '{${item}}',
            $1::text::jsonb
          ),
          '{Sunstone}',
          $2::text::jsonb
        ),
        updated_at = NOW()
      WHERE farm_id = $3
    `, [newItemAmount, newCurrency, farmId]);
    
    // 7. Log transaction for audit
    await trx.query(`
      INSERT INTO inventory_transactions 
      (farm_id, action, item, amount, cost, timestamp)
      VALUES ($1, 'buy', $2, $3, $4, NOW())
    `, [farmId, item, amount, totalCost]);
    
    // 8. Get updated state
    const updatedState = await loadGameState(farmId);
    
    return updatedState;
  });
}

// Anti-duplication check
export async function detectInventoryAnomaly(
  farmId: number,
  newState: GameState
): Promise<boolean> {
  // Get transaction history
  const recentTransactions = await db.query(`
    SELECT * FROM inventory_transactions
    WHERE farm_id = $1
    AND timestamp > NOW() - INTERVAL '1 hour'
    ORDER BY timestamp DESC
  `, [farmId]);
  
  // Calculate theoretical maximum inventory
  const theoreticalMax = calculateTheoreticalMax(recentTransactions.rows);
  
  // Check if current inventory exceeds theoretical max
  for (const [item, amount] of Object.entries(newState.inventory)) {
    if (amount > theoreticalMax[item]) {
      // Log anomaly
      await db.query(`
        INSERT INTO security_events
        (farm_id, event_type, details, timestamp)
        VALUES ($1, 'INVENTORY_ANOMALY', $2, NOW())
      `, [farmId, JSON.stringify({ item, amount, max: theoreticalMax[item] })]);
      
      return true;
    }
  }
  
  return false;
}
```

---

## 6. Fix: PRNG Security (CVE-009)

### Vulnerable Code
```typescript
// Deterministic client-side PRNG - VULNERABLE
const seed = Math.imul(farmId, 0x85ebca6b) + Math.imul(itemId, 0x9e3779b9);
```

### Fixed Implementation

**Server-Side:**
```typescript
// server/services/rng.ts
import crypto from "crypto";
import Redis from "redis";

const redis = Redis.createClient();

export async function generateSecureRandom(
  farmId: number,
  actionType: string
): Promise<number> {
  // 1. Use cryptographically secure random bytes
  const randomBytes = crypto.randomBytes(32);
  
  // 2. Add server-side entropy
  const timestamp = Date.now();
  const nonce = await getAndIncrementNonce(farmId);
  
  // 3. Combine all entropy sources
  const hash = crypto.createHash("sha256")
    .update(randomBytes)
    .update(Buffer.from(farmId.toString()))
    .update(Buffer.from(actionType))
    .update(Buffer.from(timestamp.toString()))
    .update(Buffer.from(nonce.toString()))
    .digest();
  
  // 4. Convert to 0-1 range
  const randomValue = hash.readUInt32BE(0) / 0xFFFFFFFF;
  
  // 5. Log for audit (but not the random value itself!)
  await logRNGUsage(farmId, actionType, timestamp, nonce);
  
  return randomValue;
}

async function getAndIncrementNonce(farmId: number): Promise<number> {
  const key = `nonce:${farmId}`;
  const nonce = await redis.incr(key);
  await redis.expire(key, 86400); // 24 hour TTL
  return nonce;
}

export async function determineCriticalHit(
  farmId: number,
  itemId: number,
  criticalChance: number
): Promise<boolean> {
  const roll = await generateSecureRandom(farmId, `critical_${itemId}`);
  return roll < criticalChance;
}

export async function selectReward<T extends { weighting: number }>(
  farmId: number,
  rewards: T[]
): Promise<T> {
  const totalWeight = rewards.reduce((sum, r) => sum + r.weighting, 0);
  const roll = await generateSecureRandom(farmId, "reward_select");
  const randomValue = roll * totalWeight;
  
  let accumulatedWeight = 0;
  for (const reward of rewards) {
    accumulatedWeight += reward.weighting;
    if (randomValue <= accumulatedWeight) {
      return reward;
    }
  }
  
  return rewards[rewards.length - 1]; // Fallback
}
```

**Fishing Example:**
```typescript
// server/services/fishing.ts
export async function completeFishing(
  farmId: number,
  fishingSpot: string
): Promise<{ item: string; amount: number; isCritical: boolean }> {
  // Get possible catches for this spot
  const possibleCatches = getFishingSpotCatches(fishingSpot);
  
  // Server determines outcome
  const selectedFish = await selectReward(farmId, possibleCatches);
  
  // Check for critical catch
  const isCritical = await determineCriticalHit(farmId, selectedFish.id, 0.1);
  
  const amount = isCritical ? selectedFish.amount * 2 : selectedFish.amount;
  
  // Update inventory
  await addToInventory(farmId, selectedFish.item, amount);
  
  return {
    item: selectedFish.item,
    amount,
    isCritical,
  };
}
```

---

## 7. General Security Improvements

### Rate Limiting

```typescript
// server/middleware/rateLimit.ts
import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import Redis from "redis";

const redis = Redis.createClient();

// Global rate limit
export const globalRateLimit = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: "rl:global:",
  }),
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: "Too many requests, please slow down",
});

// Per-farm rate limit
export const perFarmRateLimit = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: "rl:farm:",
  }),
  windowMs: 60 * 1000,
  max: 30, // 30 requests per minute per farm
  keyGenerator: (req) => req.user?.farmId?.toString() || req.ip,
  message: "Too many requests for this farm",
});

// Strict rate limit for sensitive operations
export const strictRateLimit = rateLimit({
  store: new RedisStore({
    client: redis,
    prefix: "rl:strict:",
  }),
  windowMs: 60 * 1000,
  max: 5, // 5 requests per minute
  keyGenerator: (req) => req.user?.farmId?.toString() || req.ip,
  message: "Rate limit exceeded for sensitive operation",
});

// Apply to routes
app.use("/api/", globalRateLimit);
app.use("/game/action", perFarmRateLimit);
app.use("/reward-box/open", strictRateLimit);
app.use("/auth/login", strictRateLimit);
```

### Input Validation

```typescript
// server/middleware/validation.ts
import Joi from "joi";

const schemas = {
  buyResource: Joi.object({
    item: Joi.string().valid(...VALID_ITEMS).required(),
    amount: Joi.number().integer().positive().max(1000).required(),
  }),
  
  plantSeed: Joi.object({
    seed: Joi.string().valid(...VALID_SEEDS).required(),
    plotId: Joi.string().uuid().required(),
  }),
  
  harvest: Joi.object({
    plotId: Joi.string().uuid().required(),
  }),
};

export function validate(schema: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schemas[schema].validate(req.body);
    
    if (error) {
      return res.status(400).json({
        error: "Validation failed",
        details: error.details.map(d => d.message),
      });
    }
    
    req.body = value; // Use validated data
    next();
  };
}

// Usage
app.post("/game/buy-resource", validate("buyResource"), handleBuyResource);
```

### State Hash Verification

```typescript
// server/services/stateHash.ts
import crypto from "crypto";

export function calculateStateHash(state: GameState): string {
  // Normalize state (sort keys, remove volatile fields)
  const normalized = normalizeState(state);
  
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");
}

export async function saveGameState(
  farmId: number,
  state: GameState
): Promise<void> {
  const stateHash = calculateStateHash(state);
  
  await db.query(`
    UPDATE game_state
    SET 
      state = $1,
      state_hash = $2,
      updated_at = NOW()
    WHERE farm_id = $3
  `, [JSON.stringify(state), stateHash, farmId]);
}

export async function loadGameState(farmId: number): Promise<GameState> {
  const result = await db.query(`
    SELECT state, state_hash FROM game_state
    WHERE farm_id = $1
  `, [farmId]);
  
  const { state, state_hash } = result.rows[0];
  
  // Verify integrity
  const computedHash = calculateStateHash(state);
  if (computedHash !== state_hash) {
    throw new Error("State integrity check failed");
  }
  
  return state;
}
```

---

## Testing Remediations

### Unit Tests

```typescript
// server/tests/security.test.ts
describe("Security Remediations", () => {
  describe("RNG", () => {
    it("should generate unpredictable random numbers", async () => {
      const samples = [];
      for (let i = 0; i < 100; i++) {
        samples.push(await generateSecureRandom(1, "test"));
      }
      
      // Check distribution
      const mean = samples.reduce((a, b) => a + b) / samples.length;
      expect(mean).toBeCloseTo(0.5, 1);
      
      // Check for patterns
      const pairs = samples.slice(0, -1).map((v, i) => [v, samples[i + 1]]);
      const correlation = calculateCorrelation(pairs);
      expect(Math.abs(correlation)).toBeLessThan(0.1);
    });
  });
  
  describe("Bot Detection", () => {
    it("should detect rapid-fire actions", async () => {
      const farmId = 1;
      
      // Simulate 11 actions in rapid succession
      for (let i = 0; i < 11; i++) {
        const isBot = await detectBotBehavior(farmId, { type: "harvest" });
        if (i < 10) {
          expect(isBot).toBe(false);
        } else {
          expect(isBot).toBe(true);
        }
      }
    });
  });
  
  describe("Inventory Validation", () => {
    it("should prevent purchasing with insufficient funds", async () => {
      const farmId = 1;
      await setInventory(farmId, { Sunstone: 100 });
      
      await expect(
        buyResource(farmId, "Gold Rock", 1000) // Costs more than 100
      ).rejects.toThrow("Insufficient currency");
    });
  });
});
```

---

## Migration Plan

### Phase 1: Critical Fixes (Week 1)
- [x] Implement httpOnly cookie authentication
- [x] Move reward box RNG to server
- [x] Implement server-side bot detection
- [x] Add rate limiting

### Phase 2: State Validation (Week 2-3)
- [ ] Implement server-side inventory validation
- [ ] Add state hash verification
- [ ] Migrate all economic actions to server

### Phase 3: Anti-Cheat (Week 4)
- [ ] Implement anomaly detection
- [ ] Add comprehensive logging
- [ ] Deploy monitoring dashboards

### Phase 4: Testing (Week 5)
- [ ] Security testing
- [ ] Penetration testing
- [ ] Bug bounty program

---

## Deployment Checklist

- [ ] All sensitive operations moved to server
- [ ] httpOnly cookies implemented
- [ ] Rate limiting deployed
- [ ] Bot detection active
- [ ] Monitoring enabled
- [ ] Audit logging enabled
- [ ] Incident response plan ready
- [ ] Bug bounty program launched

---

## Conclusion

These remediations transform Sunflower Land from a client-authoritative to server-authoritative architecture, eliminating the trust placed in client-side code. All critical game logic now executes on the server with proper validation, authentication, and anti-cheat measures.

**Key Principle:** Never trust the client. All game state mutations must be validated and executed server-side.
