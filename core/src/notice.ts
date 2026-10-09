import { ZeroAddress } from "ethers";
import {
  GRANT_TYPES,
  noticeHash,
  type Eip712Domain,
  type Hex,
  type NoticeInput,
  type RequestNotice,
} from "@sammati/shared";
import type { DirectoryPurpose } from "./directory";

export interface NoticeArgs {
  requestId: string;
  fiduciary: { address: Hex; name: string; color: string };
  purposes: DirectoryPurpose[];
  version: number;
  domain: Eip712Domain;
  /** The wallet's address when it told us (query `?principal=`), else null. */
  principal: Hex | null;
  /** The principal's current on-chain nonce as a decimal string; "0" when the principal is unknown. */
  nonce: string;
}

/** drd.md §4.2: the exact text a user sees is what gets hashed and signed. */
export function noticeInput(fiduciary: Hex, purposes: DirectoryPurpose[], version: number): NoticeInput {
  return {
    fiduciary,
    version,
    purposes: purposes.map((p) => ({
      id: p.id,
      desc_en: p.description.en,
      desc_hi: p.description.hi,
      desc_kn: p.description.kn,
      dataCategories: p.dataCategories,
      retentionDays: p.retentionDays,
      sharesThirdParty: p.sharesThirdParty,
    })),
  };
}

export function buildNotice(a: NoticeArgs): RequestNotice {
  const hash = noticeHash(noticeInput(a.fiduciary.address, a.purposes, a.version));
  return {
    requestId: a.requestId,
    fiduciary: a.fiduciary,
    purposes: a.purposes.map((p) => ({
      id: p.id,
      code: p.code,
      title: p.title,
      description: p.description,
      dataCategories: p.dataCategories,
      retentionDays: p.retentionDays,
      sharesThirdParty: p.sharesThirdParty,
      required: p.required,
    })),
    noticeHash: hash,
    noticeVersion: a.version,
    domain: a.domain,
    typedDataTemplate: {
      domain: a.domain,
      types: GRANT_TYPES,
      primaryType: "GrantConsent",
      message: { principal: a.principal ?? ZeroAddress, fiduciary: a.fiduciary.address, noticeHash: hash, nonce: a.nonce },
    },
    nonce: a.nonce,
  };
}
