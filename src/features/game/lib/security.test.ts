/**
 * Security validation tests
 * These tests verify that security measures prevent common exploit attempts
 */

import {
  validateTimestamp,
  validateEventBatchSize,
  validatePrngCounter,
  validateCropReadiness,
  validateAnimalAwake,
  validateEventSequence,
  validatePlotPlacement,
  validateResourceSufficiency,
  MAX_TIME_SKEW_MS,
  MAX_EVENTS_PER_BATCH,
} from "./security";
import { GameState } from "../types/game";
import { INITIAL_FARM } from "./constants";

describe("Security Validation", () => {
  describe("validateTimestamp", () => {
    it("should accept timestamps within acceptable skew", () => {
      const serverTime = Date.now();
      const clientTime = serverTime + 1000; // 1 second ahead

      expect(() => validateTimestamp(clientTime, serverTime)).not.toThrow();
    });

    it("should reject timestamps with excessive future skew", () => {
      const serverTime = Date.now();
      const clientTime = serverTime + MAX_TIME_SKEW_MS + 1000; // Too far ahead

      expect(() => validateTimestamp(clientTime, serverTime)).toThrow(
        /Time skew too large/,
      );
    });

    it("should reject timestamps with excessive past skew", () => {
      const serverTime = Date.now();
      const clientTime = serverTime - MAX_TIME_SKEW_MS - 1000; // Too far behind

      expect(() => validateTimestamp(clientTime, serverTime)).toThrow(
        /Time skew too large/,
      );
    });

    it("should accept exact match", () => {
      const time = Date.now();

      expect(() => validateTimestamp(time, time)).not.toThrow();
    });

    it("should accept maximum allowed skew", () => {
      const serverTime = Date.now();
      const clientTime = serverTime + MAX_TIME_SKEW_MS; // Exactly at limit

      expect(() => validateTimestamp(clientTime, serverTime)).not.toThrow();
    });
  });

  describe("validateEventBatchSize", () => {
    it("should accept batches within limit", () => {
      const events = Array(50).fill({ type: "test.event" });

      expect(() => validateEventBatchSize(events)).not.toThrow();
    });

    it("should reject oversized batches", () => {
      const events = Array(MAX_EVENTS_PER_BATCH + 1).fill({
        type: "test.event",
      });

      expect(() => validateEventBatchSize(events)).toThrow(
        /Too many events in batch/,
      );
    });

    it("should accept empty batches", () => {
      expect(() => validateEventBatchSize([])).not.toThrow();
    });

    it("should accept exactly maximum batch size", () => {
      const events = Array(MAX_EVENTS_PER_BATCH).fill({ type: "test.event" });

      expect(() => validateEventBatchSize(events)).not.toThrow();
    });
  });

  describe("validatePrngCounter", () => {
    it("should accept matching counters", () => {
      const state: GameState = {
        ...INITIAL_FARM,
        farmActivity: {
          "Sunflower Harvested": 5,
        },
      };

      expect(() =>
        validatePrngCounter("Sunflower Harvested", 5, state),
      ).not.toThrow();
    });

    it("should reject mismatched counters", () => {
      const state: GameState = {
        ...INITIAL_FARM,
        farmActivity: {
          "Sunflower Harvested": 5,
        },
      };

      expect(() =>
        validatePrngCounter("Sunflower Harvested", 10, state),
      ).toThrow(/PRNG counter mismatch/);
    });

    it("should handle missing activity counters", () => {
      const state: GameState = {
        ...INITIAL_FARM,
        farmActivity: {},
      };

      expect(() =>
        validatePrngCounter("Sunflower Harvested", 0, state),
      ).not.toThrow();
    });

    it("should reject non-zero counter for missing activity", () => {
      const state: GameState = {
        ...INITIAL_FARM,
        farmActivity: {},
      };

      expect(() =>
        validatePrngCounter("Sunflower Harvested", 5, state),
      ).toThrow(/PRNG counter mismatch/);
    });
  });

  describe("validateCropReadiness", () => {
    it("should accept ready crops", () => {
      const now = Date.now();
      const plantedAt = now - 70000; // 70 seconds ago
      const harvestSeconds = 60;

      expect(() =>
        validateCropReadiness(plantedAt, harvestSeconds, now),
      ).not.toThrow();
    });

    it("should reject unready crops", () => {
      const now = Date.now();
      const plantedAt = now - 30000; // 30 seconds ago
      const harvestSeconds = 60;

      expect(() =>
        validateCropReadiness(plantedAt, harvestSeconds, now),
      ).toThrow(/Crop not ready/);
    });

    it("should accept crops at exact ready time", () => {
      const now = Date.now();
      const plantedAt = now - 60000; // Exactly 60 seconds ago
      const harvestSeconds = 60;

      expect(() =>
        validateCropReadiness(plantedAt, harvestSeconds, now),
      ).not.toThrow();
    });

    it("should provide remaining time in error message", () => {
      const now = Date.now();
      const plantedAt = now - 30000; // 30 seconds ago
      const harvestSeconds = 60;

      expect(() =>
        validateCropReadiness(plantedAt, harvestSeconds, now),
      ).toThrow(/30s remaining/);
    });
  });

  describe("validateAnimalAwake", () => {
    it("should accept awake animals", () => {
      const now = Date.now();
      const awakeAt = now - 1000; // Woke up 1 second ago

      expect(() => validateAnimalAwake(awakeAt, now, "idle")).not.toThrow();
    });

    it("should reject sleeping animals", () => {
      const now = Date.now();
      const awakeAt = now + 3600000; // Wakes up in 1 hour

      expect(() => validateAnimalAwake(awakeAt, now, "idle")).toThrow(
        /Animal is asleep/,
      );
    });

    it("should accept sick animals regardless of sleep time", () => {
      const now = Date.now();
      const awakeAt = now + 3600000; // Wakes up in 1 hour

      expect(() => validateAnimalAwake(awakeAt, now, "sick")).not.toThrow();
    });

    it("should accept animals at exact wake time", () => {
      const now = Date.now();
      const awakeAt = now;

      expect(() => validateAnimalAwake(awakeAt, now, "idle")).not.toThrow();
    });
  });

  describe("validateEventSequence", () => {
    it("should accept matching sequence numbers", () => {
      expect(() => validateEventSequence(5, 5)).not.toThrow();
    });

    it("should reject mismatched sequence numbers", () => {
      expect(() => validateEventSequence(5, 10)).toThrow(
        /Invalid event sequence/,
      );
    });

    it("should handle zero sequence number", () => {
      expect(() => validateEventSequence(0, 0)).not.toThrow();
    });

    it("should reject sequence that skips ahead", () => {
      expect(() => validateEventSequence(10, 5)).toThrow(
        /Invalid event sequence/,
      );
    });
  });

  describe("validatePlotPlacement", () => {
    it("should accept placed plots", () => {
      const plots = {
        "1": { x: 0, y: 0 },
      };

      expect(() => validatePlotPlacement("1", plots)).not.toThrow();
    });

    it("should reject non-existent plots", () => {
      const plots = {};

      expect(() => validatePlotPlacement("999", plots)).toThrow(
        /does not exist/,
      );
    });

    it("should reject plots without x coordinate", () => {
      const plots = {
        "1": { y: 0 },
      };

      expect(() => validatePlotPlacement("1", plots)).toThrow(/not placed/);
    });

    it("should reject plots without y coordinate", () => {
      const plots = {
        "1": { x: 0 },
      };

      expect(() => validatePlotPlacement("1", plots)).toThrow(/not placed/);
    });

    it("should accept plots with zero coordinates", () => {
      const plots = {
        "1": { x: 0, y: 0 },
      };

      expect(() => validatePlotPlacement("1", plots)).not.toThrow();
    });
  });

  describe("validateResourceSufficiency", () => {
    it("should accept sufficient resources", () => {
      expect(() => validateResourceSufficiency("Wood", 10, 20)).not.toThrow();
    });

    it("should reject insufficient resources", () => {
      expect(() => validateResourceSufficiency("Wood", 10, 5)).toThrow(
        /Insufficient Wood/,
      );
    });

    it("should accept exact amount", () => {
      expect(() => validateResourceSufficiency("Wood", 10, 10)).not.toThrow();
    });

    it("should handle zero required", () => {
      expect(() => validateResourceSufficiency("Wood", 0, 0)).not.toThrow();
    });

    it("should reject when no resources available", () => {
      expect(() => validateResourceSufficiency("Wood", 1, 0)).toThrow(
        /Insufficient Wood/,
      );
    });
  });

  describe("Integration Tests", () => {
    it("should validate complete plant-harvest cycle", () => {
      const now = Date.now();
      const plots = { "1": { x: 0, y: 0 } };
      const harvestSeconds = 60;

      // Validate plot placement
      expect(() => validatePlotPlacement("1", plots)).not.toThrow();

      // Plant time
      const plantedAt = now;

      // Too early to harvest
      expect(() =>
        validateCropReadiness(plantedAt, harvestSeconds, now + 30000),
      ).toThrow(/Crop not ready/);

      // Ready to harvest
      expect(() =>
        validateCropReadiness(plantedAt, harvestSeconds, now + 60000),
      ).not.toThrow();
    });

    it("should validate complete feed-animal cycle", () => {
      const now = Date.now();
      const sleepDuration = 24 * 60 * 60 * 1000; // 24 hours

      // Just fed, animal should sleep
      const awakeAt = now + sleepDuration;

      // Cannot feed while sleeping
      expect(() => validateAnimalAwake(awakeAt, now, "idle")).toThrow(
        /Animal is asleep/,
      );

      // Can feed after waking
      expect(() =>
        validateAnimalAwake(awakeAt, now + sleepDuration, "idle"),
      ).not.toThrow();

      // Can cure sick animal anytime
      expect(() => validateAnimalAwake(awakeAt, now, "sick")).not.toThrow();
    });

    it("should prevent timestamp manipulation exploits", () => {
      const serverTime = Date.now();

      // Attacker tries to claim crop is ready by providing future time
      const attackTime = serverTime + 3600000; // 1 hour in future

      expect(() => validateTimestamp(attackTime, serverTime)).toThrow(
        /Time skew too large/,
      );
    });

    it("should prevent PRNG manipulation via counter", () => {
      const state: GameState = {
        ...INITIAL_FARM,
        farmActivity: {
          "Sunflower Harvested": 5,
        },
      };

      // Attacker tries to manipulate counter to get better RNG
      const attackCounter = 100;

      expect(() =>
        validatePrngCounter("Sunflower Harvested", attackCounter, state),
      ).toThrow(/PRNG counter mismatch/);
    });

    it("should prevent batch spam attacks", () => {
      // Attacker tries to send massive batch to DoS server
      const attackBatch = Array(1000).fill({ type: "test.event" });

      expect(() => validateEventBatchSize(attackBatch)).toThrow(
        /Too many events in batch/,
      );
    });
  });
});
