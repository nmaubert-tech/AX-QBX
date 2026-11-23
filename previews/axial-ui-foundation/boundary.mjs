// Read-only foundation. Authorization remains with the selected backend.
const ID = /^[a-z][a-z0-9.-]{0,127}$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
function assert(condition, message) { if (!condition) throw new Error(message); }

export function validateDataset(definition) {
  assert(definition && typeof definition === 'object', 'Dataset definition required');
  for (const key of ['id', 'domain', 'owner', 'provider']) {
    assert(typeof definition[key] === 'string' && ID.test(definition[key]), `Invalid ${key}`);
  }
  assert(VERSION.test(definition.contractVersion), 'Exact contractVersion required');
  assert(definition.mode === 'read', 'Only read datasets are supported');
  assert(Array.isArray(definition.fields) && definition.fields.length > 0, 'Fields required');
  const names = new Set();
  for (const field of definition.fields) {
    assert(field && typeof field.name === 'string' && ID.test(field.name) && !names.has(field.name), 'Invalid or duplicate logical field');
    assert(['string', 'decimal', 'integer', 'boolean', 'date', 'object-ref'].includes(field.type), 'Unsupported field type');
    names.add(field.name);
  }
  assert(names.has(definition.key), 'Dataset key must be a declared field');
  assert(Array.isArray(definition.parameters), 'Parameter allowlist required');
  assert(new Set(definition.parameters).size === definition.parameters.length && definition.parameters.every(x => typeof x === 'string' && ID.test(x)), 'Invalid parameters');
  return definition;
}

function validateValue(value, type) {
  if (value === null) return true;
  if (type === 'integer') return Number.isSafeInteger(value);
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'decimal') return typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value);
  if (type === 'date') {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T00:00:00Z');
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  }
  return typeof value === 'string';
}

export function validateResult(result, definition) {
  assert(result && result.datasetId === definition.id && result.contractVersion === definition.contractVersion, 'Dataset contract mismatch');
  assert(result.owner === definition.owner && result.provider === definition.provider, 'Dataset ownership mismatch');
  assert(result.quality && result.quality.complete === true && result.quality.stale === false, 'Dataset is incomplete or stale');
  assert(typeof result.acquiredAt === 'string' && Number.isFinite(Date.parse(result.acquiredAt)), 'Acquisition timestamp required');
  assert(result.lineage && typeof result.lineage.acquisitionId === 'string' && result.lineage.acquisitionId.length > 0, 'Acquisition lineage required');
  assert(Array.isArray(result.rows), 'Rows required');
  assert(result.nextCursor === null || typeof result.nextCursor === 'string', 'Pagination state required');
  const keys = new Set();
  for (const row of result.rows) {
    assert(row && typeof row === 'object' && !Array.isArray(row), 'Invalid record');
    assert(Object.keys(row).every(key => definition.fields.some(f => f.name === key)), 'Undeclared result field');
    for (const field of definition.fields) assert(own(row, field.name) && validateValue(row[field.name], field.type), `Invalid value for ${field.name}`);
    const key = row[definition.key];
    assert(key !== null && key !== '' && !keys.has(key), 'Missing or duplicate record key');
    keys.add(key);
  }
  return result;
}

export function createDatasetReader({ definition, transport }) {
  validateDataset(definition);
  assert(typeof transport === 'function', 'Transport required');
  // Snapshot configuration so a caller cannot mutate an allowlist after validation.
  const config = structuredClone(definition);
  return Object.freeze({
    async read({ parameters = {}, cursor = null, signal } = {}) {
      assert(parameters && typeof parameters === 'object' && !Array.isArray(parameters), 'Invalid parameters');
      assert(Object.keys(parameters).every(key => config.parameters.includes(key)), 'Undeclared parameter');
      assert(cursor === null || typeof cursor === 'string', 'Invalid cursor');
      signal?.throwIfAborted();
      // Effective user, tenant and permissions MUST be resolved by backend session/proxy.
      const request = { datasetId: config.id, contractVersion: config.contractVersion, parameters: structuredClone(parameters), cursor };
      const result = await transport(request, { signal });
      signal?.throwIfAborted();
      return validateResult(result, config);
    }
  });
}
