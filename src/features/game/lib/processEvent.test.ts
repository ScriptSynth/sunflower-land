import Decimal from "decimal.js-light";
import { INITIAL_FARM } from "./constants";
import { GameState, TradeListing } from "../types/game";
import { checkProgress, processEvent } from "./processEvent";

describe("processEvent", () => {
  describe("ban check", () => {
    it("should throw error when account is permanently banned", () => {
      const state: GameState = {
        ...INITIAL_FARM,
        ban: {
          status: "permanent",
        },
      };

      expect(() =>
        processEvent({
          state,
          action: {
            type: "timber.chopped",
            index: "1",
            item: "Axe",
          },
          farmId: 1,
          createdAt: Date.now(),
        }),
      ).toThrow("Account is permanently banned");
    });

    it("should allow events when ban status is ok", () => {
      const state: GameState = {
        ...INITIAL_FARM,
        ban: {
          status: "ok",
        },
        inventory: {
          ...INITIAL_FARM.inventory,
          Axe: new Decimal(1),
        },
      };

      expect(() =>
        processEvent({
          state,
          action: {
            type: "timber.chopped",
            index: "1",
            item: "Axe",
          },
          farmId: 1,
          createdAt: Date.now(),
        }),
      ).not.toThrow();
    });

    it("should allow events when ban status is investigating", () => {
      const state: GameState = {
        ...INITIAL_FARM,
        ban: {
          status: "investigating",
        },
        inventory: {
          ...INITIAL_FARM.inventory,
          Axe: new Decimal(1),
        },
      };

      expect(() =>
        processEvent({
          state,
          action: {
            type: "timber.chopped",
            index: "1",
            item: "Axe",
          },
          farmId: 1,
          createdAt: Date.now(),
        }),
      ).not.toThrow();
    });
  });

  describe("checkProgress", () => {
    it("should return false if a player has 100 chef hats and 1 listed", () => {
      const state: GameState = {
        ...INITIAL_FARM,
        inventory: {
          "Chef Hat": new Decimal(100),
          Axe: new Decimal(1),
        },
        trades: {
          listings: {
            "123": {
              collection: "wearables",
              items: {
                "Chef Hat": 1,
              },
              sfl: 100,
              createdAt: Date.now(),
              tradeType: "instant",
            },
          },
        },
      };

      const result = checkProgress({
        state,
        action: {
          type: "timber.chopped",
          index: "1",
          item: "Axe",
        },
        farmId: 1,
        createdAt: Date.now(),
      });

      expect(result.valid).toBe(false);
    });

    it("should return false if a player has 100 chef hats and 1 listed with no collection", () => {
      const state: GameState = {
        ...INITIAL_FARM,
        inventory: {
          "Chef Hat": new Decimal(100),
          Axe: new Decimal(1),
        },
        trades: {
          listings: {
            "123": {
              items: {
                "Chef Hat": 1,
              },
              sfl: 100,
              createdAt: Date.now(),
              tradeType: "instant",
            } as TradeListing,
          },
        },
      };

      const result = checkProgress({
        state,
        action: {
          type: "timber.chopped",
          index: "1",
          item: "Axe",
        },
        farmId: 1,
        createdAt: Date.now(),
      });

      expect(result.valid).toBe(false);
    });

    it("should return false if a player has 1200 tomatoes and 10 listed with no collection", () => {
      const state: GameState = {
        ...INITIAL_FARM,
        inventory: {
          "Chef Hat": new Decimal(100),
          Axe: new Decimal(1),
        },
        trades: {
          listings: {
            "123": {
              items: {
                "Chef Hat": 1,
              },
              sfl: 100,
              createdAt: Date.now(),
              tradeType: "instant",
            } as TradeListing,
          },
        },
      };

      const result = checkProgress({
        state,
        action: {
          type: "timber.chopped",
          index: "1",
          item: "Axe",
        },
        farmId: 1,
        createdAt: Date.now(),
      });

      expect(result.valid).toBe(false);
    });

    it("should return true if the player is all good", () => {
      const state: GameState = {
        ...INITIAL_FARM,
        inventory: {
          Tomato: new Decimal(1200),
        },
      };

      const result = checkProgress({
        state,
        action: {
          type: "timber.chopped",
          index: "1",
          item: "Axe",
        },
        farmId: 1,
        createdAt: Date.now(),
      });

      expect(result.valid).toBe(true);
    });
  });
});
