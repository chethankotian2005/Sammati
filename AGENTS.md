# AGENTS.md — Sammati

You are helping build **Sammati**, a consent wallet plus enforcement gateway plus regulator auditor on a ledger, for a 24-hour hackathon (Hackatopia 2026, CB-04 DPDP consent ledger). Optimise for a flawless live demo and a product that feels real.

## Source of truth
Read in this order before coding a feature:
1. `docs/prd.md` — find the feature ID and its acceptance criteria
2. `docs/trd.md` — interfaces, endpoints, EIP-712 types, event names
3. `docs/drd.md` — schemas, hashing, seed data
4. `docs/ui.md` — design tokens, screens, copy
5. `docs/architecture.md` — how pieces connect
6. `docs/tasks.md` — what is in scope right now (golden path first)

If the spec and the code disagree, **update the spec first** (small edit), then the code. Never silently diverge.

## Non-negotiables
- **No personal data on chain.** Only addresses, hashes, purpose ids, status, expiry.
- **EIP-712 types are fixed.** Field names and order are defined in `shared/eip712.ts`; the Dart copy must match byte for byte.
- **Fail closed.** If consent cannot be verified, the gateway blocks (`LEDGER_UNAVAILABLE`).
- **Logging never blocks a response.**
- **Reason codes** are exactly: `CONSENT_WITHDRAWN`, `CONSENT_EXPIRED`, `NO_CONSENT`, `LEDGER_UNAVAILABLE`, `NO_PRINCIPAL`.
- **Demo shortcuts are disclosed**, never hidden (company and processor keys held by Core).

## Conventions
- TypeScript strict mode on `core/`, `gateway/`, `web/`, `shared/`. Dart: null-safe, Riverpod, `go_router`.
- Contracts: Solidity ^0.8.24, OpenZeppelin `EIP712` and `ECDSA`, custom errors, events for every state change.
- Small functions, clear names, no dead code. Comments explain why, not what.
- All UI strings go through the i18n layer (en, hi, kn). No hard-coded user-facing strings in the wallet.
- Use the design tokens from `ui.md`. Do not introduce new colours or fonts.
- Hashes display shortened (`0x4f2a…9be1`) and copy in full on tap.

## Working style
- Build the **golden path** before anything else: QR → scan → consent → grant on chain → ALLOWED → withdraw → BLOCKED.
- Prefer working end to end over polishing one layer.
- Write the contract test first for any contract change.
- After each feature run `pnpm e2e`. If it fails, fix it before moving on.
- Do not add dependencies without a clear reason; mention them in the PR description.
- Keep changes small and tell the team when you change a shared interface.

## Commands
```
pnpm install
pnpm demo:up        # chain, core, 3 companies, web
pnpm demo:reset     # reset DB, redeploy seed
pnpm e2e            # grant → allowed → withdraw → blocked → tamper → verify fails
pnpm --filter contracts test
flutter run         # in wallet/
flutter build apk --release
```

## Out of scope (do not build)
Real KYC or Aadhaar integration, mainnet, production key recovery, handling real personal data.
