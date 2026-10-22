/** Validates the YAML files in /data. Run with `npm run validate`. */
import { rawData } from "../src/data/raw";
import { validateDataset } from "../src/data/validate";

const errors = validateDataset(rawData);
if (errors.length > 0) {
  console.error(`Found ${errors.length} problem(s) in /data:\n`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
const count = (v: unknown) => (Array.isArray(v) ? v.length : 0);
console.log(
  `Data OK: ${count(rawData.actors)} actors, ${count(rawData.initiatives)} initiatives, ${count(rawData.relations)} relations.`,
);
