/**
 * Validates that a timestamp is reasonable to prevent time manipulation exploits.
 *
 * This security function ensures that event timestamps cannot be manipulated by clients
 * to skip growth timers or other time-based mechanics.
 *
 * @param createdAt - The timestamp to validate (in milliseconds since epoch)
 * @throws Error if timestamp is too far in the future (time-skip exploit)
 * @throws Error if timestamp is too far in the past (extreme backdating)
 */
export function validateTimestamp(createdAt: number): void {
  const now = Date.now();
  const maxClockSkew = 60 * 1000; // Allow 60 seconds of clock skew for legitimate time differences

  // Prevent time-skip exploits by rejecting future timestamps
  if (createdAt > now + maxClockSkew) {
    throw new Error("Invalid timestamp: createdAt is too far in the future");
  }

  // Prevent extreme backdating exploits (more than 1 year in the past)
  const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
  if (createdAt < oneYearAgo) {
    throw new Error("Invalid timestamp: createdAt is too far in the past");
  }
}
