export { createSourceOverride } from './source-handler';
export type { SourceOverrideOptions } from './source-handler';
export {
  auditSourcePreparation,
  buildSourceAuditSnapshot,
  collectForbiddenAbsParams,
} from './source-audit';
export type {
  SourceAuditInput,
  SourceAuditReport,
  SourceAuditCheck,
  SourceSnapshot,
  GlobalOptionsSnapshot,
  TextTrackSnapshot,
  TextTrackAuditResult,
} from './source-audit';
