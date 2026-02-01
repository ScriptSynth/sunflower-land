# Security Remediation Roadmap
**Priority-Based Action Plan for Sunflower Land**

---

## Overview

This document provides a prioritized, step-by-step plan to fix the 20 identified security vulnerabilities. The plan is organized by severity and implementation complexity.

**Estimated Total Effort:** 4-6 weeks  
**Critical Path:** 3-5 days for emergency patches

---

## 🚨 Phase 1: Emergency Hotfixes (Days 1-3)

**Timeline:** ASAP - Within 72 hours  
**Impact:** Prevents active exploitation of critical vulnerabilities  
**Required Resources:** 1 senior developer

### 1.1 Remove eval() RCE Vulnerability ⏰ 2 hours

**Priority:** P0 - CRITICAL  
**File:** `/src/lib/network.ts`

**Current Code:**
```typescript
export async function sanitizeHTTPResponse<T>(response: Response): Promise<T> {
  const data = await response.json();

  if (data.farmHash) {
    const code = Buffer.from(data.farmHash, "base64").toString();
    eval(code);  // ❌ REMOVE THIS
  }

  return data;
}
```

**Fixed Code:**
```typescript
export async function sanitizeHTTPResponse<T>(response: Response): Promise<T> {
  return await response.json();
}
```

**Steps:**
1. Remove lines 8-11 (farmHash handling)
2. Run tests: `yarn test`
3. Test autosave and session loading manually
4. Deploy to staging
5. Verify no errors in staging
6. Deploy to production immediately
7. Monitor error rates for 24 hours

**Verification:**
```bash
# After deployment, verify removal
grep -r "eval(" src/
# Should return no results in network.ts
```

---

### 1.2 Add httpOnly Cookies for JWT ⏰ 4 hours

**Priority:** P0 - CRITICAL  
**Files:** Backend API + `/src/features/auth/`

**Backend Changes (Python/Node.js example):**
```javascript
// Backend: /api/login endpoint
app.post('/login', async (req, res) => {
  const { address, signature } = req.body;
  
  // Verify signature and generate JWT
  const token = generateJWT(address);
  
  // ✅ Set httpOnly cookie instead of returning token
  res.cookie('session', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/'
  });
  
  // Return success without token
  res.json({ success: true });
});
```

**Frontend Changes:**
```typescript
// Remove localStorage JWT storage
// File: src/features/auth/actions/login.ts

export async function login({
  transactionId,
  address,
  signature,
}: {
  transactionId: string;
  address: string;
  signature: string;
}): Promise<void> {
  await loginRequest({
    address,
    signature,
    transactionId,
  });
  
  // ❌ REMOVE: saveJWT(token)
  // Cookie is set automatically by server
}
```

**Steps:**
1. Update backend `/login` endpoint to set httpOnly cookie
2. Update backend to read cookie for authentication
3. Remove `saveJWT()` calls from frontend
4. Remove `getJWT()` usage from frontend
5. Update autosave to use credentials: 'include'
6. Test authentication flow end-to-end
7. Deploy backend first, then frontend

**Migration Strategy:**
```typescript
// Graceful migration: support both for 1 week
if (hasCookie()) {
  // Use cookie
} else if (hasLocalStorageToken()) {
  // Migrate to cookie
  await migrateToCookie();
  removeLocalStorageToken();
}
```

---

### 1.3 Add Emergency Rate Limiting ⏰ 2 hours

**Priority:** P1 - HIGH  
**Implementation:** Backend + Client-side soft limits

**Backend Rate Limiting (Express example):**
```javascript
const rateLimit = require('express-rate-limit');

const autosaveLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute
  message: 'Too many autosave requests',
  standardHeaders: true,
  legacyHeaders: false,
});

app.post('/autosave/:farmId', autosaveLimiter, async (req, res) => {
  // Handle autosave
});
```

**Client-side Soft Limiting:**
```typescript
// File: src/features/game/lib/rateLimiter.ts
class RateLimiter {
  private lastAction: Map<string, number> = new Map();
  
  canPerformAction(actionType: string, cooldownMs: number = 1000): boolean {
    const now = Date.now();
    const last = this.lastAction.get(actionType) || 0;
    
    if (now - last < cooldownMs) {
      return false;
    }
    
    this.lastAction.set(actionType, now);
    return true;
  }
}

export const rateLimiter = new RateLimiter();
```

**Usage:**
```typescript
// In game machine
if (!rateLimiter.canPerformAction('HARVEST', 500)) {
  throw new Error('Please wait before harvesting again');
}
```

---

## ⚡ Phase 2: Critical Fixes (Week 1)

**Timeline:** Days 4-7  
**Impact:** Addresses high-severity vulnerabilities  
**Required Resources:** 2 developers

### 2.1 Server-Side Validation Framework ⏰ 16 hours

**Priority:** P1 - HIGH

**Implementation:**
```typescript
// Backend: Game event validator
class GameEventValidator {
  validate(farmId: number, state: GameState, action: GameEvent): ValidationResult {
    switch (action.type) {
      case 'HARVEST':
        return this.validateHarvest(state, action);
      case 'PLANT':
        return this.validatePlant(state, action);
      case 'CRAFT_COLLECTIBLE':
        return this.validateCraft(state, action);
      default:
        return { valid: true };
    }
  }
  
  private validateHarvest(state: GameState, action: HarvestAction): ValidationResult {
    // Check crop exists
    const crop = state.crops[action.index];
    if (!crop) {
      return { valid: false, error: 'Crop not found' };
    }
    
    // Check harvest time
    if (crop.plantedAt + crop.growTime > Date.now()) {
      return { valid: false, error: 'Crop not ready' };
    }
    
    // Check inventory space
    if (state.inventory[crop.name].plus(action.amount).greaterThan(9999)) {
      return { valid: false, error: 'Inventory full' };
    }
    
    return { valid: true };
  }
}
```

**Rollout:**
1. Week 1: Implement validators for top 10 actions
2. Week 2: Add remaining validators
3. Week 3: Enable strict validation mode
4. Monitor false positives

---

### 2.2 Input Sanitization ⏰ 8 hours

**Priority:** P1 - HIGH

**Implementation:**
```typescript
// File: src/lib/validation.ts
import Decimal from 'decimal.js-light';

export function validateAmount(amount: number | Decimal): number {
  const num = typeof amount === 'number' ? amount : amount.toNumber();
  
  // Check for negative
  if (num < 0) {
    throw new Error('Amount cannot be negative');
  }
  
  // Check for NaN
  if (!Number.isFinite(num)) {
    throw new Error('Amount must be a valid number');
  }
  
  // Check for safe integer range
  if (num > Number.MAX_SAFE_INTEGER) {
    throw new Error('Amount too large');
  }
  
  return num;
}

export function validateIndex(index: number, max: number): number {
  if (index < 0 || index >= max) {
    throw new Error('Index out of bounds');
  }
  if (!Number.isInteger(index)) {
    throw new Error('Index must be an integer');
  }
  return index;
}

export function sanitizeString(str: string, maxLength: number = 100): string {
  if (typeof str !== 'string') {
    throw new Error('Value must be a string');
  }
  
  // Remove null bytes
  str = str.replace(/\0/g, '');
  
  // Trim whitespace
  str = str.trim();
  
  // Limit length
  if (str.length > maxLength) {
    str = str.substring(0, maxLength);
  }
  
  return str;
}
```

**Apply to all events:**
```typescript
// Example: sellCrop.ts
export function sellCrop(state: GameState, action: SellCropAction): GameState {
  const { crop, amount } = action;
  
  // ✅ Add validation
  const validAmount = validateAmount(amount);
  const sanitizedCrop = sanitizeString(crop, 50);
  
  // Check inventory
  if (!state.inventory[sanitizedCrop]) {
    throw new Error('Invalid crop');
  }
  
  if (state.inventory[sanitizedCrop].lessThan(validAmount)) {
    throw new Error('Insufficient inventory');
  }
  
  // Continue with validated data
  // ...
}
```

---

### 2.3 Transaction Locking (Marketplace) ⏰ 12 hours

**Priority:** P1 - HIGH

**Implementation:**
```typescript
// Backend: Transaction lock manager
import Redis from 'redis';

class TransactionLock {
  private redis: Redis.Client;
  
  async acquireLock(tradeId: string, ttl: number = 30000): Promise<boolean> {
    const lockKey = `lock:trade:${tradeId}`;
    const acquired = await this.redis.set(
      lockKey, 
      '1', 
      'PX', ttl, 
      'NX'
    );
    return acquired !== null;
  }
  
  async releaseLock(tradeId: string): Promise<void> {
    const lockKey = `lock:trade:${tradeId}`;
    await this.redis.del(lockKey);
  }
  
  async withLock<T>(
    tradeId: string, 
    callback: () => Promise<T>
  ): Promise<T> {
    const acquired = await this.acquireLock(tradeId);
    
    if (!acquired) {
      throw new Error('Trade already in progress');
    }
    
    try {
      return await callback();
    } finally {
      await this.releaseLock(tradeId);
    }
  }
}

// Usage in trade endpoint
app.post('/marketplace/purchase', async (req, res) => {
  const { tradeId } = req.body;
  
  await transactionLock.withLock(tradeId, async () => {
    // Verify trade still exists
    const trade = await db.getTrade(tradeId);
    if (!trade) throw new Error('Trade not found');
    if (trade.status !== 'active') throw new Error('Trade not active');
    
    // Process purchase
    await db.processPurchase(tradeId, req.user.farmId);
    
    // Update trade status
    await db.updateTradeStatus(tradeId, 'completed');
  });
  
  res.json({ success: true });
});
```

---

## 🔧 Phase 3: Important Fixes (Week 2)

**Timeline:** Days 8-14  
**Impact:** Hardens security posture  
**Required Resources:** 1-2 developers

### 3.1 Content Security Policy ⏰ 4 hours

**Priority:** P2 - MEDIUM

**Implementation:**
```html
<!-- index.html -->
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.google-analytics.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  font-src 'self' data:;
  connect-src 'self' https://api.sunflower-land.com wss://colyseus.sunflower-land.com;
  frame-src 'self' https://www.google.com;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
">
```

**Gradual Rollout:**
1. Start with report-only mode
2. Monitor CSP violations
3. Fix violations
4. Enable enforcement mode

---

### 3.2 Enhanced Chat Validation ⏰ 6 hours

**Priority:** P2 - MEDIUM

**Implementation:**
```typescript
// File: src/features/chat/lib/sanitizer.ts
import Filter from 'bad-words';
import DOMPurify from 'dompurify';

export function sanitizeChatMessage(message: string): string {
  // 1. Length limit
  if (message.length > 200) {
    throw new Error('Message too long');
  }
  
  // 2. Remove HTML/XSS
  message = DOMPurify.sanitize(message, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: []
  });
  
  // 3. Profanity filter
  const filter = new Filter();
  message = filter.clean(message);
  
  // 4. URL detection and blocking
  const urlRegex = /https?:\/\/[^\s]+/gi;
  if (urlRegex.test(message)) {
    throw new Error('URLs not allowed in chat');
  }
  
  // 5. Unicode normalization
  message = message.normalize('NFC');
  
  // 6. Remove excessive whitespace
  message = message.replace(/\s+/g, ' ').trim();
  
  return message;
}
```

---

### 3.3 CSRF Protection ⏰ 4 hours

**Priority:** P2 - MEDIUM

**Implementation:**
```typescript
// Backend: CSRF token generation
import crypto from 'crypto';

function generateCSRFToken(sessionId: string): string {
  return crypto
    .createHmac('sha256', process.env.CSRF_SECRET)
    .update(sessionId)
    .digest('hex');
}

// Frontend: Include CSRF token
const csrfToken = generateCSRFToken(sessionId);
headers['X-CSRF-Token'] = csrfToken;
```

---

## 🔨 Phase 4: Enhancements (Week 3-4)

**Timeline:** Days 15-28  
**Impact:** Long-term security improvements  
**Required Resources:** 1 developer + 1 security consultant

### 4.1 Code Obfuscation ⏰ 8 hours

**Implementation:**
```javascript
// vite.config.ts
import { defineConfig } from 'vite';
import { obfuscator } from 'rollup-plugin-obfuscator';

export default defineConfig({
  plugins: [
    // ... other plugins
  ],
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
      mangle: {
        properties: {
          regex: /^_/,
        },
      },
    },
  },
  // Add obfuscation for production
  ...(process.env.NODE_ENV === 'production' && {
    plugins: [
      obfuscator({
        options: {
          compact: true,
          controlFlowFlattening: true,
          deadCodeInjection: true,
          stringArray: true,
          stringArrayRotate: true,
          stringArrayShuffle: true,
        },
      }),
    ],
  }),
});
```

---

### 4.2 Secure Random Number Generation ⏰ 4 hours

**Implementation:**
```typescript
// File: src/lib/secureRandom.ts
export class SecureRandom {
  // Use server-provided seed
  static async getServerSeed(action: string): Promise<string> {
    const response = await fetch('/api/random-seed', {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
    const { seed } = await response.json();
    return seed;
  }
  
  // Combine client and server randomness
  static async generateSecure(action: string): Promise<number> {
    const serverSeed = await this.getServerSeed(action);
    const clientSeed = crypto.getRandomValues(new Uint32Array(1))[0];
    
    // Combine seeds
    const combined = `${serverSeed}-${clientSeed}-${action}`;
    const hash = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(combined)
    );
    
    // Convert to number between 0 and 1
    const view = new DataView(hash);
    return view.getUint32(0) / 0xffffffff;
  }
}
```

---

### 4.3 Enhanced Bot Detection ⏰ 12 hours

**Implementation:**
```typescript
// Backend: Advanced bot detection
class BotDetector {
  async analyzeSession(farmId: number, sessionId: string): Promise<BotScore> {
    const score = {
      total: 0,
      factors: [],
    };
    
    // 1. Action frequency analysis
    const actions = await getRecentActions(farmId, 60); // Last 60 seconds
    if (actions.length > 50) {
      score.total += 50;
      score.factors.push('High action frequency');
    }
    
    // 2. Mouse movement entropy
    const mouseData = await getMouseMovement(sessionId);
    if (this.isLowEntropy(mouseData)) {
      score.total += 30;
      score.factors.push('Bot-like mouse movement');
    }
    
    // 3. Timing patterns
    const timings = actions.map(a => a.timestamp);
    if (this.hasRegularPattern(timings)) {
      score.total += 40;
      score.factors.push('Regular timing pattern');
    }
    
    // 4. Device fingerprint changes
    const fingerprints = await getFingerprints(farmId);
    if (fingerprints.length > 10) {
      score.total += 20;
      score.factors.push('Multiple device fingerprints');
    }
    
    return score;
  }
  
  private isLowEntropy(data: number[]): boolean {
    // Calculate entropy
    // Low entropy = likely bot
    return calculateShannonEntropy(data) < 2.0;
  }
  
  private hasRegularPattern(timings: number[]): boolean {
    // Check if actions occur at regular intervals
    const intervals = [];
    for (let i = 1; i < timings.length; i++) {
      intervals.push(timings[i] - timings[i-1]);
    }
    const stdDev = calculateStdDev(intervals);
    return stdDev < 100; // ms
  }
}
```

---

## 📊 Phase 5: Monitoring & Maintenance (Ongoing)

### 5.1 Security Monitoring Dashboard

**Implementation:**
```typescript
// Monitor key security metrics
const securityMetrics = {
  // Authentication
  failedLogins: 0,
  sessionHijackAttempts: 0,
  
  // Rate limiting
  rateLimitHits: 0,
  blockedIPs: new Set(),
  
  // Input validation
  validationFailures: 0,
  xssAttempts: 0,
  
  // Bot detection
  botScoresHigh: 0,
  bannedAccounts: new Set(),
};

// Alert on anomalies
if (securityMetrics.failedLogins > 100) {
  alertSecurityTeam('High failed login rate');
}
```

---

### 5.2 Regular Security Audits

**Schedule:**
- **Weekly:** Automated dependency scans
- **Monthly:** Manual code review of new features
- **Quarterly:** Full penetration testing
- **Annually:** Third-party security audit

**Tools:**
- `npm audit` - Dependency vulnerabilities
- `eslint-plugin-security` - Code patterns
- Snyk - Continuous monitoring
- OWASP ZAP - Automated penetration testing

---

## ✅ Success Metrics

### Key Performance Indicators

| Metric | Current | Target | Timeline |
|--------|---------|--------|----------|
| Critical Vulnerabilities | 2 | 0 | Week 1 |
| High Vulnerabilities | 3 | 0 | Week 2 |
| Medium Vulnerabilities | 7 | <3 | Week 4 |
| Low Vulnerabilities | 8 | <5 | Week 6 |
| Security Test Coverage | 0% | 80% | Week 8 |
| Incident Response Time | N/A | <2 hours | Week 4 |

---

## 📋 Implementation Checklist

### Week 1: Emergency Fixes
- [ ] Remove eval() from network.ts
- [ ] Deploy httpOnly cookie authentication
- [ ] Add rate limiting (backend + frontend)
- [ ] Deploy emergency monitoring
- [ ] Update incident response procedures

### Week 2: Critical Fixes
- [ ] Implement server-side validation framework
- [ ] Add input sanitization to all events
- [ ] Deploy transaction locking for marketplace
- [ ] Add comprehensive error logging
- [ ] Conduct security training for team

### Week 3: Important Fixes
- [ ] Deploy Content Security Policy
- [ ] Enhance chat validation
- [ ] Implement CSRF protection
- [ ] Add security headers
- [ ] Set up automated security scans

### Week 4: Enhancements
- [ ] Implement code obfuscation
- [ ] Deploy secure random generation
- [ ] Enhance bot detection
- [ ] Add Subresource Integrity
- [ ] Deploy security monitoring dashboard

### Ongoing
- [ ] Weekly dependency audits
- [ ] Monthly security reviews
- [ ] Quarterly penetration tests
- [ ] Continuous monitoring and alerting
- [ ] Regular security team training

---

## 💰 Estimated Costs

### Development Resources
- Senior Developer (4 weeks): ~$20,000
- Security Consultant (1 week): ~$10,000
- **Total Labor:** ~$30,000

### Tools & Services
- Security scanning tools: ~$500/month
- Penetration testing: ~$5,000/quarter
- Bug bounty program: ~$2,000/month
- **Total Services:** ~$15,000/year

### Infrastructure
- WAF (Web Application Firewall): ~$100/month
- DDoS protection: ~$200/month
- Enhanced logging: ~$50/month
- **Total Infrastructure:** ~$4,200/year

**Grand Total (Year 1):** ~$49,200

---

## 📞 Emergency Contact Plan

### Incident Response Team
- **Security Lead:** [Name] - [Email] - [Phone]
- **Tech Lead:** [Name] - [Email] - [Phone]
- **DevOps:** [Name] - [Email] - [Phone]

### Escalation Path
1. **Detection** → Alert on-call developer
2. **Assessment** → Notify security lead (within 15 min)
3. **Response** → Assemble incident team (within 30 min)
4. **Mitigation** → Deploy fix (within 2 hours)
5. **Communication** → Notify users if data breach (within 24 hours)

---

## 📚 Additional Resources

### Internal Documentation
- Security Coding Guidelines
- Incident Response Playbook
- Security Testing Checklist
- Vulnerability Disclosure Policy

### External Resources
- OWASP Top 10: https://owasp.org/www-project-top-ten/
- CWE Top 25: https://cwe.mitre.org/top25/
- NIST Cybersecurity Framework: https://www.nist.gov/cyberframework

---

**Document Version:** 1.0  
**Last Updated:** February 1, 2026  
**Next Review:** March 1, 2026

**Approval Required From:**
- [ ] CTO
- [ ] Security Lead
- [ ] Tech Lead
- [ ] Product Manager
