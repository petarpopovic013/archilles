import { RegulationProvisionSchema, RegulationSourceSchema } from "../../domain";
import sourceData from "../../../fixtures/regulations/sources.json";
import provisionData from "../../../fixtures/regulations/provisions.json";

/** Official captures are not a claim of current legal applicability or human review. */
export const regulationSources = sourceData.map((source) => RegulationSourceSchema.parse(source));
export const regulationProvisions = provisionData.map((provision) => RegulationProvisionSchema.parse(provision));
