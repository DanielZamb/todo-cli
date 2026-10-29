import { ImportItem, ImportReport } from "@todo/domain";
import { registerCommandSchema } from "./schema.ts";

registerCommandSchema("import", ImportReport);
registerCommandSchema("import-item", ImportItem, "input");
