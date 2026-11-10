export type DesignReceipt = {
  id: string;
  argv: readonly string[];
  exit: number | null;
  status: "PASS" | "FAIL" | "MISSING" | "SKIPPED";
  evidence: string;
  reason?: string;
};
export async function runDesignRecipes<T>(
  recipes: readonly T[],
  execute: (recipe: T) => Promise<DesignReceipt>,
  skipped: (recipe: T, reason: string) => DesignReceipt,
  record: (receipt: DesignReceipt) => void,
) {
  let diskStop = false;
  let failed = false;
  for (const recipe of recipes) {
    const receipt: DesignReceipt = diskStop
      ? skipped(
          recipe,
          "DISK STOP: a constituent exited 3. No later recipe was started.",
        )
      : await execute(recipe);
    diskStop ||= receipt.exit === 3;
    failed ||= receipt.status === "FAIL" || receipt.status === "MISSING";
    record(receipt);
  }
  return diskStop ? 3 : failed ? 1 : 0;
}
