import type { Page } from "@playwright/test";

export async function settleRenderer(page: Page) {
  await page.evaluate(async () => {
    const frame = () =>
      new Promise<void>((done) => requestAnimationFrame(() => done()));
    await document.fonts.ready;
    await frame();
    for (;;) {
      const animations = document
        .getAnimations()
        .filter(
          (animation) =>
            animation.playState === "running" &&
            animation.effect?.getTiming().iterations !== Infinity,
        );
      if (animations.length === 0) return;
      await Promise.all(
        animations.map((animation) => animation.finished.catch(() => {})),
      );
      await frame();
    }
  });
}
