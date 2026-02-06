import Decimal from "decimal.js-light";
import { TEST_BUMPKIN } from "features/game/lib/bumpkinData";
import { INITIAL_FARM } from "features/game/lib/constants";
import { GameState } from "features/game/types/game";
import { harvest } from "./harvest";

const dateNow = Date.now();
const GAME_STATE: GameState = {
  ...INITIAL_FARM,
  crops: {
    "0": {
      createdAt: dateNow,
      x: 0,
      y: -2,
      crop: {
        name: "Sunflower",
        plantedAt: dateNow - 2 * 60 * 1000, // Planted 2 minutes ago (ready to harvest)
      },
    },
  },
  balance: new Decimal(0),
  inventory: {},
  bumpkin: TEST_BUMPKIN,
};

describe("harvest security", () => {
  it("rejects timestamp from the future (time manipulation exploit)", () => {
    const futureTime = dateNow + 2 * 60 * 60 * 1000; // 2 hours in the future

    expect(() =>
      harvest({
        state: GAME_STATE,
        action: {
          type: "crop.harvested",
          index: "0",
        },
        createdAt: futureTime,
      }),
    ).toThrow("Invalid timestamp: createdAt is too far in the future");
  });

  it("accepts timestamp with reasonable clock skew", () => {
    const slightlyFutureTime = dateNow + 30 * 1000; // 30 seconds in the future (within allowed skew)

    expect(() =>
      harvest({
        state: GAME_STATE,
        action: {
          type: "crop.harvested",
          index: "0",
        },
        createdAt: slightlyFutureTime,
      }),
    ).not.toThrow();
  });

  it("rejects extremely old timestamp", () => {
    const veryOldTime = dateNow - 2 * 365 * 24 * 60 * 60 * 1000; // 2 years ago

    expect(() =>
      harvest({
        state: GAME_STATE,
        action: {
          type: "crop.harvested",
          index: "0",
        },
        createdAt: veryOldTime,
      }),
    ).toThrow("Invalid timestamp: createdAt is too far in the past");
  });

  it("accepts reasonable past timestamp", () => {
    // For this test, we need a crop that was planted long enough ago
    // that even with a past timestamp it's still ready
    const longAgoPlantedState: GameState = {
      ...INITIAL_FARM,
      crops: {
        "0": {
          createdAt: dateNow,
          x: 0,
          y: -2,
          crop: {
            name: "Sunflower",
            plantedAt: dateNow - 10 * 60 * 1000, // Planted 10 minutes ago
          },
        },
      },
      balance: new Decimal(0),
      inventory: {},
      bumpkin: TEST_BUMPKIN,
    };

    const recentTime = dateNow - 5 * 60 * 1000; // 5 minutes ago

    expect(() =>
      harvest({
        state: longAgoPlantedState,
        action: {
          type: "crop.harvested",
          index: "0",
        },
        createdAt: recentTime,
      }),
    ).not.toThrow();
  });

  it("prevents instant harvest exploit with future timestamp", () => {
    // Crop that was just planted (not ready yet)
    const justPlantedState: GameState = {
      ...INITIAL_FARM,
      crops: {
        "0": {
          createdAt: dateNow,
          x: 0,
          y: -2,
          crop: {
            name: "Sunflower",
            plantedAt: dateNow - 10 * 1000, // Just planted 10 seconds ago
          },
        },
      },
      balance: new Decimal(0),
      inventory: {},
      bumpkin: TEST_BUMPKIN,
    };

    // Try to exploit by passing a future timestamp
    const futureTime = dateNow + 10 * 60 * 60 * 1000; // 10 hours in the future

    expect(() =>
      harvest({
        state: justPlantedState,
        action: {
          type: "crop.harvested",
          index: "0",
        },
        createdAt: futureTime,
      }),
    ).toThrow("Invalid timestamp: createdAt is too far in the future");
  });
});
