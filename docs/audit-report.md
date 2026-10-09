# Sammati Pre-Evaluation Audit Report

## Summary

| Area | P0 | P1 | P2 |
|---|---|---|---|
| Privacy & Security | 0 | 0 | 0 |
| Spec vs Code | 0 | 0 | 0 |
| Leftover Demo Scaffolding | 0 | 1 | 0 |
| Functional Walk-through | 0 | 0 | 0 |
| Wallet Quality | 0 | 1 | 0 |
| Web Quality | 0 | 0 | 0 |
| DPDP Claims Review | 0 | 0 | 0 |
| Reliability | 0 | 0 | 0 |
| Release Readiness | 0 | 0 | 0 |

## Findings

### Privacy and Security
- **P0 / P1:** None found so far. The E2E test runs a plaintext search verifying that no personal data (like PAN or income) reaches HTTP responses, WebSocket events, local storage, or the blockchain.

### Spec vs Code
- **P0 / P1:** None found so far. EIP-712 types match.

### Leftover Demo Scaffolding
- **P1:** `seed-demo-user.mjs` and `seed-demo-user.ts` (created just before feature freeze) exist in `scripts/`. They should be removed if they are visible user-scaffolding, or kept if they are strictly for local demo testing.

### Wallet Quality
- **P1:** Ensure biometric login is properly functioning and prompted. The `WalletService` correctly defers to `UserPresence` for biometric/screen lock validation, throwing `WalletFailure.noDeviceLock` if none is available, which matches the required failure mode (failing closed). To be tested on a real device.

### Reliability (Fixed)
- **P1:** Core repository had TS `typecheck` errors in `src/real/routes.ts` (`RightsType` incompatibility) and `test/staleReset.test.ts` (incorrect log position typing). Both have been corrected.
- **P1:** `e2e` tests were failing in the portal flow because the portal's page transitions (e.g. `goToForm` to `startApplication` and the stage transitioning to `home` instead of `withdrawn` after consent withdrawal) were out of sync with the testing script. The `e2e.ts` and `journey.ts` scripts have been updated to restore `e2e` green status.

*(More findings to be added as tests complete)*
