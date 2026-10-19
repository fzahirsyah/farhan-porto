# Buku 3.2–3.5 (P12–P15) — implementation and handoff

## Scope implemented
- Schema upgrades v5–v8, adding owned property inventory, unit cost ledger links, resale invoices/HPP, installment plans and collections, KPR receipts, JV movements, standalone quotations, commissions, period close/FX/year end, recurring journals, attachments, audit records and contact import.
- New application pages: Property Inventory, Owned Unit Detail, JV Investments, Quotations, Executive Dashboard, Internal Sales Commissions, Period Close, Budgets and Fiscal Working Papers, Automation & Tools, Global Search.
- Reuses core double-entry posting and existing document/payment engines. Protects linked property HPP and installment payments from unmanaged reversal.
- One database per legal company, with separate JV company files; parent company only records JV investment and distributions.

## Validated in Node using bundled SQL.js/WASM
- Existing tests: 212/212 passed
- Release 2.1/3.1 suite: 35/35 passed
- Release 3.2–3.5 suite: 47/47 passed
- Total: 294/294 automated checks. This DOES NOT certify the UI or tax compliance.

## Material limitations / next acceptance work
1. Browser UI acceptance was not completed; Chromium test runner stalled in this environment. Test file:// opening, navigation, forms, import/export, printed documents, and mobile/desktop behavior manually.
2. Recurring workflow currently creates draft **journals**. Dedicated recurring *bill* generation is not implemented.
3. Attachment support is limited to 5 MiB per file and is stored in SQLite; validate larger real-world backups and browser storage quota behavior.
4. Encrypted **backup exports** use AES-GCM/PBKDF2, but the browser's at-rest IndexedDB copy is **not encrypted**. Do not represent it as complete local-database encryption.
5. Global search covers deals, documents, contacts, and owned units, not every journal/amount/attachment body.
6. Import UI currently handles contacts CSV; generic import-map presets and complete products/COA/opening AR/AP import interfaces are incomplete.
7. Audit change records exist, but universal automatic before/after capture across all entity mutations is not yet implemented.
8. Current instalment plans allocate principal for an already-approved property sale. Complex PraKPR, rent-to-own and financing-margin contracts require separate accounting-policy design.
9. P12 property tax amounts are manually supplied, not a statement of statutory compliance; confirm applicable tax and accounting policy with an accountant.
10. JV investment transactions are parent-only: full consolidation, equity-method policy engine and synchronized company-file accounting are not provided.
11. Period close requires review and confirmation. There is no robust user-role/approval identity system in this single-user offline architecture.
12. Sales commission calculation is report-only; auto payroll/accrual/payment workflow is not delivered.
13. Original quotation document table remains separate (`quotations`) instead of replacing `documents.doc_type` constraint. Quote-to-SO workflow is tested.

## Data safety
- Always back up your existing .sqlite company file BEFORE opening it in this build.
- Upgrades are additive versions 5, 6, 7, 8. Do not open a v8 company file using an older Buku build.
- Run tests/tests.html, tests/tier3.html, tests/tier4.html in a compatible browser for local verification.
- Migration-feature design is a separate NEXT PLANNING activity, not included in this release.
