# Company Holiday Calendar — Security Review

**Review result: CONDITIONAL PASS for the inspected feature paths.**

## Controls inspected

- API routes require the existing access-token authentication middleware.
- Read routes are available to authenticated users; mutations are restricted to `hr`, `admin`, and `superadmin`; tenant listing is superadmin-only.
- Tenant resolution is applied before holiday data routes. Repository operations carry tenant predicates, including resource lookup/update/delete. A cross-tenant id therefore resolves as not found.
- SQL data values are passed as prepared-statement parameters. Update field names come from a fixed allowlisted input mapping.
- Unique `(tenant_id, holiday_date)` prevents same-tenant duplicate calendar dates at the database layer.
- Holiday writes and audit insertion share a transaction. Realtime event publication follows commit and targets a tenant room.
- Socket.IO accepts the access token in the handshake auth payload/header, resolves tenant membership, autojoins that tenant, and rejects unauthorized tenant room joins.
- The web/mobile views use authenticated API clients; the mobile calendar is read-only.

## Limitations and follow-up

- Application-level route checks and isolated integration tests do not replace a full security assessment or production authorization review.
- Transactions and unique keys do not establish race-free cleanup or other lifecycle properties; concurrency and load behavior were not tested.
- Realtime behavior with production Redis adapter, multiple API nodes, actual proxy deployment, token revocation, and network interruption was not independently validated.
- The web build reports a large minified bundle. Package-install output reported existing dependency audit advisories (web: 16; mobile: 38 at install time); no audit-fix command or remediation was performed, and those counts are not a validated vulnerability assessment.
- Logs and client error handling should continue to avoid exposing tokens or sensitive employee data. No live secrets, database records, infrastructure, or external services were accessed as part of this feature verification.

No claim is made that this review proves production security, runtime safety, or concurrency safety.
