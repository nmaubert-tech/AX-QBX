import { createDatasetReader } from './boundary.mjs';

// Bridges the existing AxialQB client; private mappings and response decoding stay private.
export function createQuickbaseReader({ definition, client, resolveQuery, decode }) {
  if (typeof client?.doQuery !== 'function' || typeof resolveQuery !== 'function' || typeof decode !== 'function') {
    throw new Error('Quickbase client, private query resolver and decoder required');
  }
  return createDatasetReader({ definition, transport: async (request, { signal }) => {
    signal?.throwIfAborted();
    const query = await resolveQuery(request);
    // No write API is exposed. Server-side Quickbase permissions remain authoritative.
    const response = await client.doQuery(query);
    signal?.throwIfAborted();
    return decode(response, request);
  }});
}
