// QuickLoan's side of Sammati: the public APIs only, with the company's API key (trd.md §6.14).
export interface Purpose {
  id: string;
  code: string;
  title: { en: string };
  description: { en: string };
  dataCategories: string[];
  retentionDays: number;
  sharesThirdParty: boolean;
  required: boolean;
}

export interface ConsentRow {
  principal: string;
  customerAlias: string | null;
  purposeCode: string;
  status: "None" | "Active" | "Withdrawn";
  expiresAt: number | null;
}

export interface Decision {
  decision: "approved" | "declined";
  limit: number | null;
  reasonCodes: string[];
}

export interface SammatiOptions {
  coreUrl: string;
  processorUrl: string;
  fiduciary: string;
  apiKey: string;
}

export class SammatiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export class Sammati {
  constructor(private readonly o: SammatiOptions) {}

  private async call<T>(url: string, init: RequestInit = {}): Promise<T> {
    let res: Response;
    try {
      res = await fetch(url, { ...init, headers: { "content-type": "application/json", "x-sammati-api-key": this.o.apiKey, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(5000) });
    } catch {
      throw new SammatiError(502, "UNREACHABLE", "Sammati could not be reached");
    }
    const text = await res.text();
    const body = (text ? JSON.parse(text) : {}) as { error?: { code?: string; message?: string }; code?: string; message?: string };
    if (!res.ok) throw new SammatiError(res.status, body.error?.code ?? body.code ?? "ERROR", body.error?.message ?? body.message ?? `Sammati answered ${res.status}`);
    return body as T;
  }

  async purposes(): Promise<Purpose[]> {
    return (await this.call<{ purposes: Purpose[] }>(`${this.o.coreUrl}/v1/fiduciaries/${this.o.fiduciary}/purposes`)).purposes;
  }

  async consentRows(): Promise<ConsentRow[]> {
    return (await this.call<{ rows: ConsentRow[] }>(`${this.o.coreUrl}/v1/fiduciaries/${this.o.fiduciary}/consents`)).rows;
  }

  async createRequest(alias: string, purposes: string[]): Promise<{ requestId: string; qrPayload: string }> {
    return this.call(`${this.o.coreUrl}/v1/fiduciaries/${this.o.fiduciary}/requests`, { method: "POST", body: JSON.stringify({ purposes, customerAlias: alias }) });
  }

  /** The Processor decides from the handle; QuickLoan sends no personal data and gets none back. */
  async evaluate(handle: string, purposeCode: string): Promise<Decision> {
    return this.call(`${this.o.processorUrl}/v1/processor/evaluate`, {
      method: "POST",
      body: JSON.stringify({ handle, fiduciary: this.o.fiduciary, purposeCode, action: "loan_decision" }),
    });
  }

  /** Tells the Processor where to send "stored" and "erased" notices. */
  async registerCallback(url: string): Promise<void> {
    await this.call(`${this.o.processorUrl}/v1/processor/callback`, { method: "POST", body: JSON.stringify({ url }) }).catch(() => {});
  }
}
