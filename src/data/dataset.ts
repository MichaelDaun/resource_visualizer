import { rawData } from "./raw";
import { assertDataset } from "./validate";

export const dataset = assertDataset(rawData);
