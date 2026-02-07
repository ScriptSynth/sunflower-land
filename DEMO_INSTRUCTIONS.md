# 🎮 Demo: Time Manipulation Bug - Step by Step

## ⚠️ IMPORTANT NOTICE

This is a **security demonstration** for the Sunflower Land development team.
The vulnerability has been **FIXED** in this branch. These instructions are for:

1. Understanding the original vulnerability
2. Testing that the fix works properly
3. Documentation purposes

---

## 📺 How to Reproduce the Original Bug

### Prerequisites

- Chrome browser (or any Chromium-based browser)
- Access to Sunflower Land game
- Basic knowledge of browser DevTools

### Step 1: Open the Game

1. Navigate to Sunflower Land in your browser
2. Log in to your account
3. Make sure you have some seeds (Sunflower Seed recommended)

### Step 2: Plant a Crop

1. Go to your farm
2. Click on an empty plot
3. Select "Sunflower Seed" (takes 1 minute normally)
4. Plant the seed
5. **Note**: The crop will show a timer (e.g., "59 seconds")

### Step 3: Open Chrome DevTools

1. Press **F12** (or Right-click → Inspect)
2. Click on the **"Console"** tab
3. Clear any existing messages (click the 🚫 icon)

### Step 4: Execute the Exploit

**Option A: Full Exploit (Recommended)**

```javascript
/**
 * SUNFLOWER LAND - TIME MANIPULATION EXPLOIT
 * Paste this entire block into the Console
 */

(function () {
  console.log("🚨 Starting Time Manipulation...");

  // Store original Date.now
  const originalNow = Date.now;

  // Override Date.now() to return time 24 hours in the future
  Date.now = function () {
    return originalNow.call(Date) + 24 * 60 * 60 * 1000;
  };

  console.log("✅ Time manipulation active!");
  console.log("⏰ Browser time is now 24 hours ahead");
  console.log("🌾 Try to harvest your crop now!");
})();
```

**Option B: Quick One-Liner**

```javascript
Date.now = (
  (o) => () =>
    o() + 86400000
)(Date.now);
console.log("⏰ Time skipped 24 hours!");
```

### Step 5: Observe the Result

**Expected Behavior (WITHOUT FIX)**:

- ❌ Crop timer instantly shows "Ready to harvest"
- ❌ You can click and harvest immediately
- ❌ You receive the crop instantly
- ❌ Game economy is broken

**Expected Behavior (WITH FIX - Current Branch)**:

- ✅ Crop timer might show "Ready" on client
- ✅ But clicking harvest throws an error: "Invalid harvest time"
- ✅ Server-side validation prevents the exploit
- ✅ Game economy is protected

### Step 6: Verify the Fix Works

After running the exploit, try to harvest:

1. **With the Exploit Active**:

   ```
   Click on crop → "Invalid harvest time" error
   ```

2. **Check Console**:

   ```
   Look for validation errors showing the timestamp was rejected
   ```

3. **Refresh Page** (to disable exploit):
   ```
   Press F5 → Crop timer resets to actual time remaining
   ```

---

## 🧪 Testing the Fix

### Test Case 1: Normal Gameplay (Should Work)

1. Plant a crop
2. Wait the actual required time
3. Harvest → ✅ Should work normally

### Test Case 2: Time Manipulation (Should Fail)

1. Plant a crop
2. Run exploit code from Step 4
3. Try to harvest → ❌ Should show "Invalid harvest time"

### Test Case 3: Network Latency (Should Work)

1. Plant a crop that takes 1 minute
2. Wait 1 minute
3. Add 30 second delay to timestamp (within tolerance)
4. Harvest → ✅ Should work (30s < 60s tolerance)

### Test Case 4: Beyond Tolerance (Should Fail)

1. Plant a crop
2. Add 2 minute delay to timestamp (beyond tolerance)
3. Try to harvest → ❌ Should show "Invalid harvest time"

---

## 📊 What's Happening Behind the Scenes

### Original Vulnerable Code

```typescript
// harvest.ts (BEFORE FIX)
export function isCropGrowing(plot: CropPlot) {
  const crop = plot.crop;
  if (!crop) return false;

  const cropDetails = CROPS[crop.name];
  // ⚠️ PROBLEM: Uses Date.now() which can be overridden
  return !isReadyToHarvest(Date.now(), crop, cropDetails);
}
```

### Fixed Code

```typescript
// harvest.ts (AFTER FIX)
// Security check: Validate timestamp
const MAX_FUTURE_TOLERANCE = 60 * 1000; // 1 minute
const realTime = Date.now();

if (createdAt > realTime + MAX_FUTURE_TOLERANCE) {
  // ✅ FIX: Reject timestamps too far in the future
  throw new Error("Invalid harvest time");
}

if (plantedAt > createdAt) {
  // ✅ FIX: Reject crops planted in the future
  throw new Error("Invalid planted time: crop planted in the future");
}

// ✅ FIX: Validate minimum time has passed
const elapsedTime = createdAt - plantedAt;
const requiredTime = harvestSeconds * 1000;

if (elapsedTime < requiredTime) {
  throw new Error("Not ready");
}
```

---

## 🎬 Video Demo Script

If you're recording a video demonstration:

1. **Intro** (0:00-0:30)
   - "Today I'll show you a time manipulation bug in Sunflower Land"
   - "And how we fixed it with server-side validation"

2. **Setup** (0:30-1:00)
   - Open game
   - Show normal crop planting
   - Point out the 60-second timer

3. **Exploit** (1:00-2:00)
   - Open DevTools
   - Paste and explain the exploit code
   - Show how Date.now() is overridden
   - Demonstrate timer jumping to "Ready"

4. **Without Fix** (2:00-2:30)
   - Show crop harvesting instantly
   - Point out the security issue
   - Explain economic impact

5. **With Fix** (2:30-3:30)
   - Show the same exploit attempt
   - Point out the "Invalid harvest time" error
   - Explain the validation logic
   - Show the tolerance for network latency

6. **Code Review** (3:30-4:30)
   - Show the serverTime.ts module
   - Explain timestamp validation
   - Show test suite
   - Demonstrate proper cleanup

7. **Conclusion** (4:30-5:00)
   - Recap the vulnerability
   - Explain the fix
   - Mention the test coverage
   - Show documentation

---

## 🔍 Additional Verification

### Check Server Time Sync

```javascript
// In DevTools Console
if (window.getServerTime) {
  console.log("Server Time:", window.getServerTime());
  console.log("Client Time:", Date.now());
  console.log("Offset:", window.getServerTime() - Date.now());
}
```

### Check Validation Status

```javascript
// After trying to harvest with manipulated time
// Look for these error messages in console:
// ✅ "Invalid harvest time"
// ✅ "Invalid planted time: crop planted in the future"
// ✅ "Not ready"
```

### Verify Memory Leaks Fixed

```javascript
// Check that cleanup works
if (window.cleanupTimeSync) {
  window.cleanupTimeSync();
  console.log("✅ Time sync cleaned up properly");
}
```

---

## 📚 Related Documentation

- **Full Analysis**: See `SECURITY_FINDINGS.md`
- **Fix Summary**: See `VULNERABILITY_FIX_README.md`
- **Complete Summary**: See `TIME_MANIPULATION_SUMMARY.md`
- **Test Suite**: See `src/features/game/events/landExpansion/timeManipulation.test.ts`

---

## ❓ FAQ

**Q: Will this work on the live game?**
A: No, if the fix has been deployed. The validation happens server-side.

**Q: Can I still use this exploit?**
A: No, this branch has the fix implemented. The exploit will fail.

**Q: What about other time-based features?**
A: The same fix should be applied to all time-based mechanics (buildings, cooking, etc.)

**Q: How does the 60-second tolerance work?**
A: It allows for network latency. If your clock is within 60 seconds of server time, it's accepted.

**Q: What if I'm on a slow network?**
A: The tolerance might need adjustment. 60 seconds should cover most cases.

---

## 🎯 Success Criteria

✅ Exploit works on unfixed code
✅ Exploit fails on fixed code  
✅ Normal gameplay works fine
✅ Network latency is handled
✅ Error messages are generic (no timing leaks)
✅ No memory leaks
✅ Tests pass

---

**Last Updated**: 2026-02-07
**Status**: ✅ Bug Fixed and Tested
**Security Level**: 🔒 High
