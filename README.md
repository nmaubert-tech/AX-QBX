# AX-QBX

Public distribution repository for sanitized Axial Quickbase extension runtime assets.

## Release assets

Hosted runtime files are versioned under `releases/<version>/`. Environment-specific Quickbase configuration, application tokens, table aliases, field IDs, employee/customer data, and private Quickbase code pages are intentionally excluded from this repository.

Current release: `releases/1.0.0/`

## Deployment boundary

The public runtime expects its Quickbase environment configuration to be supplied by a private Quickbase code page at runtime. Do not commit completed environment configuration to this repository.

## Copyright

Copyright © Axial Group of Companies. All rights reserved.

No open-source license is granted by publication of this repository. The source is made publicly accessible only for runtime distribution and authorized use.
