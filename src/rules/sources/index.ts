import { RegulationProvisionSchema, RegulationSourceSchema } from "../../domain";
import sourceData from "../../../fixtures/regulations/sources.json";
import provisionData from "../../../fixtures/regulations/provisions.json";
import additionalProvisionData from "../../../fixtures/regulations/provisions-002.json";
import expandedProvisionData from "../../../fixtures/regulations/provisions-003.json";

/** Official captures are not a claim of current legal applicability or human review. */
export const regulationSources = sourceData.map((source) => RegulationSourceSchema.parse(source));
export const regulationProvisions = [...provisionData, ...additionalProvisionData, ...expandedProvisionData].map((provision) => RegulationProvisionSchema.parse(provision));
