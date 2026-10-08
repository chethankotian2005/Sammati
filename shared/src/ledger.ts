// Off-chain mirror of ConsentRegistry's ledgerHead (drd.md §2). Core's indexer and the
// Auditor use it to check that no on-chain action was skipped or reordered.
import { AbiCoder, keccak256 } from "ethers";
import { ZERO_HASH } from "./canonical";

/** Numeric values are part of the spec: they must match the Solidity enum order. */
export const ACTION = {
  RegisterFiduciary: 0,
  RegisterPurpose: 1,
  RegisterProcessor: 2,
  SetPurposeActive: 3,
  Grant: 4,
  Withdraw: 5,
  Acknowledge: 6,
} as const;
export type ActionType = (typeof ACTION)[keyof typeof ACTION];

export interface LedgerAction {
  actionType: ActionType;
  principal: string;
  fiduciary: string;
  purposeId: string;
  expiresAtOrZero: number;
  blockTimestamp: number;
}

const ZERO_ADDRESS = "0x" + "00".repeat(20);
const coder = AbiCoder.defaultAbiCoder();

export function actionHash(a: Partial<LedgerAction> & Pick<LedgerAction, "actionType" | "blockTimestamp">): string {
  return keccak256(
    coder.encode(
      ["uint8", "address", "address", "bytes32", "uint64", "uint64"],
      [
        a.actionType,
        a.principal ?? ZERO_ADDRESS,
        a.fiduciary ?? ZERO_ADDRESS,
        a.purposeId ?? ZERO_HASH,
        a.expiresAtOrZero ?? 0,
        a.blockTimestamp,
      ],
    ),
  );
}

export function nextLedgerHead(head: string, action: Parameters<typeof actionHash>[0]): string {
  return keccak256(coder.encode(["bytes32", "bytes32"], [head, actionHash(action)]));
}

/** Folds a list of actions from the genesis head, as the contract did. */
export function replayLedger(actions: Parameters<typeof actionHash>[0][]): string {
  return actions.reduce(nextLedgerHead, ZERO_HASH);
}
