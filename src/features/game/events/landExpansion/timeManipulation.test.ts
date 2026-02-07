import { harvest } from "./harvest";
import { harvestFruit } from "./fruitHarvested";
import { plant } from "./plant";
import { INITIAL_FARM } from "features/game/lib/constants";
import Decimal from "decimal.js-light";
import { GameState } from "features/game/types/game";

describe("Time Manipulation Security", () => {
  describe("Crop Harvest Time Validation", () => {
    it("should prevent harvesting with manipulated future timestamps", () => {
      const state: GameState = {
        ...INITIAL_FARM,
        inventory: {
          "Sunflower Seed": new Decimal(10),
        },
        crops: {
          0: {
            createdAt: Date.now(),
            x: 0,
            y: 0,
            height: 1,
            width: 1,
          },
        },
      };

      // Plant a crop
      const plantedState = plant({
        state,
        action: {
          type: "seed.planted",
          item: "Sunflower Seed",
          index: "0",
          cropId: "1",
        },
        createdAt: Date.now(),
        farmId: 1,
      });

      // Try to harvest immediately with a fake future timestamp
      const futureTime = Date.now() + 24 * 60 * 60 * 1000; // 24 hours in future

      expect(() =>
        harvest({
          state: plantedState,
          action: {
            type: "crop.harvested",
            index: "0",
          },
          createdAt: futureTime,
          farmId: 1,
        }),
      ).toThrow("Invalid harvest time: timestamp too far in future");
    });

    it("should prevent harvesting crops planted in the future", () => {
      const now = Date.now();
      const futureTime = now + 10000;

      const state: GameState = {
        ...INITIAL_FARM,
        crops: {
          0: {
            createdAt: now,
            x: 0,
            y: 0,
            height: 1,
            width: 1,
            crop: {
              id: "1",
              name: "Sunflower",
              plantedAt: futureTime, // Planted in the future!
              boostedTime: 0,
            },
          },
        },
      };

      expect(() =>
        harvest({
          state,
          action: {
            type: "crop.harvested",
            index: "0",
          },
          createdAt: now,
          farmId: 1,
        }),
      ).toThrow("Invalid planted time: crop planted in the future");
    });

    it("should allow legitimate harvests with proper timing", () => {
      const now = Date.now();
      const plantTime = now - 2 * 60 * 1000; // Planted 2 minutes ago (Sunflower takes 1 minute)

      const state: GameState = {
        ...INITIAL_FARM,
        crops: {
          0: {
            createdAt: plantTime,
            x: 0,
            y: 0,
            height: 1,
            width: 1,
            crop: {
              id: "1",
              name: "Sunflower",
              plantedAt: plantTime,
              boostedTime: 0,
            },
          },
        },
      };

      // This should succeed
      const result = harvest({
        state,
        action: {
          type: "crop.harvested",
          index: "0",
        },
        createdAt: now,
        farmId: 1,
      });

      expect(result.inventory.Sunflower).toBeDefined();
    });

    it("should reject crops harvested before they are ready", () => {
      const now = Date.now();
      const plantTime = now - 30 * 1000; // Planted 30 seconds ago (Sunflower takes 1 minute)

      const state: GameState = {
        ...INITIAL_FARM,
        crops: {
          0: {
            createdAt: plantTime,
            x: 0,
            y: 0,
            height: 1,
            width: 1,
            crop: {
              id: "1",
              name: "Sunflower",
              plantedAt: plantTime,
              boostedTime: 0,
            },
          },
        },
      };

      expect(() =>
        harvest({
          state,
          action: {
            type: "crop.harvested",
            index: "0",
          },
          createdAt: now,
          farmId: 1,
        }),
      ).toThrow(/Not ready/);
    });
  });

  describe("Fruit Harvest Time Validation", () => {
    it("should prevent harvesting fruits with manipulated future timestamps", () => {
      const now = Date.now();
      const plantTime = now - 1000;

      const state: GameState = {
        ...INITIAL_FARM,
        fruitPatches: {
          0: {
            x: 0,
            y: 0,
            height: 2,
            width: 2,
            fruit: {
              name: "Blueberry",
              plantedAt: plantTime,
              harvestedAt: 0,
              harvestsLeft: 3,
            },
          },
        },
      };

      // Try to harvest with a fake future timestamp (way beyond tolerance)
      const futureTime = now + 24 * 60 * 60 * 1000; // 24 hours in future

      expect(() =>
        harvestFruit({
          state,
          action: {
            type: "fruit.harvested",
            index: "0",
          },
          createdAt: futureTime,
          farmId: 1,
        }),
      ).toThrow("Invalid harvest time: timestamp too far in future");
    });

    it("should prevent harvesting fruits planted in the future", () => {
      const now = Date.now();
      const futureTime = now + 10000;

      const state: GameState = {
        ...INITIAL_FARM,
        fruitPatches: {
          0: {
            x: 0,
            y: 0,
            height: 2,
            width: 2,
            fruit: {
              name: "Blueberry",
              plantedAt: futureTime, // Planted in the future!
              harvestedAt: 0,
              harvestsLeft: 3,
            },
          },
        },
      };

      expect(() =>
        harvestFruit({
          state,
          action: {
            type: "fruit.harvested",
            index: "0",
          },
          createdAt: now,
          farmId: 1,
        }),
      ).toThrow("Invalid planted time: fruit planted in the future");
    });

    it("should reject fruits harvested before they are ready", () => {
      const now = Date.now();
      const plantTime = now - 1000; // Planted 1 second ago (fruits take hours)

      const state: GameState = {
        ...INITIAL_FARM,
        fruitPatches: {
          0: {
            x: 0,
            y: 0,
            height: 2,
            width: 2,
            fruit: {
              name: "Blueberry",
              plantedAt: plantTime,
              harvestedAt: 0,
              harvestsLeft: 3,
            },
          },
        },
      };

      expect(() =>
        harvestFruit({
          state,
          action: {
            type: "fruit.harvested",
            index: "0",
          },
          createdAt: now,
          farmId: 1,
        }),
      ).toThrow(/Not ready/);
    });

    it("should allow legitimate fruit harvests with proper timing", () => {
      const now = Date.now();
      // Blueberry takes 8 hours, plant 9 hours ago
      const plantTime = now - 9 * 60 * 60 * 1000;

      const state: GameState = {
        ...INITIAL_FARM,
        fruitPatches: {
          0: {
            x: 0,
            y: 0,
            height: 2,
            width: 2,
            fruit: {
              name: "Blueberry",
              plantedAt: plantTime,
              harvestedAt: 0,
              harvestsLeft: 3,
            },
          },
        },
      };

      // This should succeed
      const result = harvestFruit({
        state,
        action: {
          type: "fruit.harvested",
          index: "0",
        },
        createdAt: now,
        farmId: 1,
      });

      expect(result.inventory.Blueberry).toBeDefined();
      expect(result.fruitPatches[0].fruit?.harvestedAt).toBe(now);
    });

    it("should prevent harvesting replenishing fruits too early", () => {
      const now = Date.now();
      const plantTime = now - 10 * 60 * 60 * 1000; // 10 hours ago
      const lastHarvest = now - 1000; // Harvested 1 second ago

      const state: GameState = {
        ...INITIAL_FARM,
        fruitPatches: {
          0: {
            x: 0,
            y: 0,
            height: 2,
            width: 2,
            fruit: {
              name: "Blueberry",
              plantedAt: plantTime,
              harvestedAt: lastHarvest,
              harvestsLeft: 2,
            },
          },
        },
      };

      expect(() =>
        harvestFruit({
          state,
          action: {
            type: "fruit.harvested",
            index: "0",
          },
          createdAt: now,
          farmId: 1,
        }),
      ).toThrow(/Fruit is still replenishing/);
    });
  });

  describe("Time Tolerance Tests", () => {
    it("should allow small time differences within tolerance (network latency)", () => {
      const now = Date.now();
      const plantTime = now - 2 * 60 * 1000; // 2 minutes ago

      const state: GameState = {
        ...INITIAL_FARM,
        crops: {
          0: {
            createdAt: plantTime,
            x: 0,
            y: 0,
            height: 1,
            width: 1,
            crop: {
              id: "1",
              name: "Sunflower",
              plantedAt: plantTime,
              boostedTime: 0,
            },
          },
        },
      };

      // Simulate 30 second network latency - should be accepted
      const harvestTime = now + 30 * 1000;

      const result = harvest({
        state,
        action: {
          type: "crop.harvested",
          index: "0",
        },
        createdAt: harvestTime,
        farmId: 1,
      });

      expect(result.inventory.Sunflower).toBeDefined();
    });

    it("should reject time differences beyond tolerance", () => {
      const now = Date.now();
      const plantTime = now - 2 * 60 * 1000;

      const state: GameState = {
        ...INITIAL_FARM,
        crops: {
          0: {
            createdAt: plantTime,
            x: 0,
            y: 0,
            height: 1,
            width: 1,
            crop: {
              id: "1",
              name: "Sunflower",
              plantedAt: plantTime,
              boostedTime: 0,
            },
          },
        },
      };

      // 2 minutes beyond tolerance - should be rejected
      const harvestTime = now + 62 * 1000;

      expect(() =>
        harvest({
          state,
          action: {
            type: "crop.harvested",
            index: "0",
          },
          createdAt: harvestTime,
          farmId: 1,
        }),
      ).toThrow("Invalid harvest time: timestamp too far in future");
    });
  });
});
