import { expect, test } from "bun:test";
import { celebrationFor, rewardsView } from "@/lib/rewards";

test("the view reports real progress and caps at the goal", () => {
  expect(rewardsView(0, 7)).toMatchObject({ earned: 0, remaining: 7, reached: false, fraction: 0 });
  expect(rewardsView(3, 7)).toMatchObject({ earned: 3, remaining: 4, reached: false });
  expect(rewardsView(7, 7)).toMatchObject({ earned: 7, remaining: 0, reached: true, fraction: 1 });
  expect(rewardsView(9, 7)).toMatchObject({ earned: 7, remaining: 0, reached: true });
});

test("there is nothing to celebrate on a first look or when nothing changed", () => {
  expect(celebrationFor(null, 3, 7)).toBeNull();
  expect(celebrationFor(3, 3, 7)).toBeNull();
  expect(celebrationFor(5, 3, 7)).toBeNull();
});

test("a new visit celebrates the new stamp, and reaching the goal is a milestone", () => {
  expect(celebrationFor(2, 3, 7)).toEqual({ newStamps: [3], milestone: false });
  expect(celebrationFor(1, 4, 7)).toEqual({ newStamps: [2, 3, 4], milestone: false });
  expect(celebrationFor(6, 7, 7)).toEqual({ newStamps: [7], milestone: true });
  // Past the goal there are no more stamps to earn and no second milestone.
  expect(celebrationFor(7, 8, 7)).toBeNull();
  expect(celebrationFor(5, 9, 7)).toEqual({ newStamps: [6, 7], milestone: true });
});
