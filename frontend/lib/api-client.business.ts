/**
 * The door to everything the product calls business: the senders, the gate in
 * front of them, the things our mail is about, and the consignments.
 *
 * Half of `api-client.ts`, split from it on the seam the rail already draws
 * (`components/shell/nav.ts`), because one barrel over every resource grew
 * past the 200 lines eslint allows. Import from `api-client.ts`, not from here.
 */

export {
  type ClientKind,
  type ClientList,
  type ClientOutcome,
  type ClientRow,
  type ClientUpdate,
  listClients,
  updateClient,
} from "./api/clients-client";
export {
  type AttributeSource,
  type Beside,
  type ConsignmentDetail,
  type ConsignmentList,
  type ConsignmentParty,
  type ConsignmentRef,
  type ConsignmentRow,
  type ConsignmentStatement,
  type Counterpart,
  type EntityAppearance,
  type EntityDetail,
  type EntityInsight,
  type EntityKind,
  type EntityList,
  type EntityName,
  type EntityRow,
  getConsignment,
  getEntityDetail,
  getObjectGraph,
  getObjectRecord,
  type GraphEdge,
  type GraphNode,
  type IdentityFact,
  type InsightFacet,
  type InsightLine,
  listConsignments,
  listCounterparts,
  listEntities,
  listObjectTypes,
  type ObjectGraph,
  type ObjectLink,
  type ObjectRecord,
  type ObjectType,
  type ObjectTypeSummary,
  type SemanticReading,
  type StoredProfile,
  type StoredValue,
  type WrittenBy,
} from "./api/ontology-client";
export { editAttributes, type EditOutcome, mergeEntity, renameEntity } from "./api/edit-client";
export {
  getShipment,
  listShipments,
  type ShipmentDetail,
  type ShipmentList,
  type ShipmentQuery,
  type ShipmentRef,
  type ShipmentRow,
} from "./api/shipments-client";
export {
  type GateBucket,
  type GateBudget,
  type GateCostBreakdown,
  type GateDecision,
  getGate,
  type GateHeldList,
  type GateHeldRow,
  type GateMode,
  type GateOverview,
  type GatePolicy,
  type GatePolicyUpdate,
  type GateReason,
  type GateReleaseResult,
  type GateScope,
  type GateSenderList,
  type GateSenderRow,
  type GateStanding,
  type GateWriteOutcome,
  listGateSenders,
  listHeld,
  releaseHeld,
  setGatePolicy,
} from "./api/gate-client";
