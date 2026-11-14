import { guardedCompiler } from "./compile-artifacts.mjs";
import { DiskStop } from "./compile-safety.mjs";
const build = Bun.build.bind(Bun);
let index = 0;
Bun.build = async (options) => {
  try {
    return await guardedCompiler(build, {
      evidence: process.env.DAG_F_GUARD_EVIDENCE,
      label: `workspace-api-${process.pid}-${index++}`,
    })(options);
  } catch (error) {
    if (error instanceof DiskStop) process.exit(3);
    throw error;
  }
};
