/** Compatibility entry point: the Runtime owner now provides the integrated bridge,
 * including projection of historical observations into the current revision.
 * Keep one implementation; lifecycle/source admission remains in this registry.
 */
export { createRegulatoryRegistry } from "../../../runtime/adapters/registry";
