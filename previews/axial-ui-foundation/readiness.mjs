const GATES = Object.freeze([
  'sourceArchived', 'dependenciesResolved', 'behaviorDocumented', 'permissionsVerified',
  'authorityResolved', 'contractCompatible', 'sandboxParityPassed', 'rollbackVerified', 'ownerAccepted'
]);
export function assessReadiness(evidence = {}) {
  const missing = GATES.filter(gate => evidence[gate] !== true);
  return Object.freeze({ ready: missing.length === 0, missing: Object.freeze(missing) });
}
// This evidence checklist is not a deployment authorization or a backend security control.
export { GATES };
