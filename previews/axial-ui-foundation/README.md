# Axial UI boundary foundation — development preview

This isolated, read-only foundation defines logical dataset contracts shared by Quickbase-hosted and future platform-hosted interfaces. It bridges the existing AxialQB query client without changing released timesheet assets.

## Included

- Typed dataset definitions with one owner/provider, exact contract versions, stable references and parameter allowlists.
- Read-only adapter boundary, complete/fresh response checks, lineage and explicit pagination.
- Exact decimal strings rather than floating point financial values.
- Migration evidence checklist that fails closed when ownership, parity or rollback evidence is missing.
- Dependency-free tests: `node --test previews/axial-ui-foundation/foundation.test.mjs`.

## Integration boundary

The owning backend enforces authorization. Client validation is not a security boundary. Dataset definitions must come from trusted private configuration; user-supplied owner/provider values do not establish authority. A platform transport must resolve effective user, tenant, provider authority and permissions using its authenticated server-side context. The browser must not receive package RPC signing secrets or gateway credentials.

No Cohesion endpoint or SDK transport is assumed here. Inject a reviewed, authenticated dataset transport after verifying the successor platform contract. Long-running commands, posting, payroll processing and writeback belong in the appropriate owning service, not this reader. Timeout retries require operation-status reconciliation for material commands.

Private field/table mappings, credentials, application configuration and source records must not be committed to this public distribution repository. The Quickbase resolver and decoder are injected and not included. The existing client does not support AbortSignal transport cancellation; the bridge suppresses dispatch/result use when cancelled but cannot cancel an in-flight legacy request.

This is a library foundation, not an installed dashboard, configuration application, migration engine or production-ready replacement. It has no write methods, no production shell and no automatic deployment.
