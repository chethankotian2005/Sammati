// Registers the throwaway test companies on a ConsentRegistry, for tests that need companies on chain without going
// through the registration flow. Nothing in the app calls this.
import type { Contract, ContractRunner } from "ethers";
import { descHash, fiduciaryMetaHash, processorMetaHash, purposeIdOf } from "@sammati/shared";
import { TEST_COMPANIES } from "./companies";

export interface RegisterOptions {
  /** The registry's admin: only it may register fiduciaries. */
  admin: ContractRunner;
  /** A signer for a fiduciary address: purposes and processors must be registered by the fiduciary itself. */
  signerFor: (address: string) => Promise<ContractRunner>;
  onStep?: (message: string) => void;
}

/** Idempotent: anything already registered is skipped. Returns how many entries were new. */
export async function registerTestCompanies(registry: Contract, { admin, signerFor, onStep }: RegisterOptions): Promise<number> {
  const call = async (as: ContractRunner, method: string, ...args: unknown[]) => {
    const connected = registry.connect(as) as Contract;
    await (await connected.getFunction(method)(...args)).wait();
  };
  const isFiduciary = (a: string) => registry.getFunction("isFiduciary")(a) as Promise<boolean>;
  const isProcessor = (id: string, a: string) => registry.getFunction("isProcessor")(id, a) as Promise<boolean>;
  const purposeOwner = async (id: string) => (await registry.getFunction("getPurpose")(id)).fiduciary as string;

  let registered = 0;
  for (const f of TEST_COMPANIES) {
    if (!(await isFiduciary(f.address))) {
      await call(admin, "registerFiduciary", f.address, f.name, fiduciaryMetaHash(f));
      registered++;
    }
    const asFiduciary = await signerFor(f.address);
    for (const p of f.purposes) {
      const purposeId = purposeIdOf(f.address, p.code);
      if ((await purposeOwner(purposeId)) === "0x0000000000000000000000000000000000000000") {
        await call(asFiduciary, "registerPurpose", purposeId, descHash(p.description), p.retentionDays, p.sharesThirdParty);
        registered++;
      }
    }
    for (const proc of f.processors) {
      const purposeId = purposeIdOf(f.address, proc.purposeCode);
      if (!(await isProcessor(purposeId, proc.address))) {
        await call(asFiduciary, "registerProcessor", purposeId, proc.address, processorMetaHash(proc));
        registered++;
      }
    }
    onStep?.(`${f.name}: ${f.purposes.length} purposes, ${f.processors.length} processors`);
  }
  return registered;
}
