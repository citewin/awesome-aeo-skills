export type CheckStatus = "pass" | "warn" | "fail" | "skip";

export interface Check {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  /** Relative weight in the score. Skipped checks are left out of the total. */
  weight: number;
  /** Copy-paste remedy, shown with --fix and returned in JSON. */
  fix?: string;
}

export interface HopResult {
  id: "hop1" | "hop2" | "hop3";
  title: string;
  checks: Check[];
}

export interface ScanResult {
  tool: "aeo-scan";
  version: string;
  scannedAt: string;
  url: string;
  domain: string;
  score: number;
  tier: string;
  tierLabel: string;
  /** False when Hop 3 ran without API keys, so the score covers Hops 1 and 2 only. */
  liveProbes: boolean;
  hops: HopResult[];
  auditUrl: string;
}

export interface ScanOptions {
  /** Per-request timeout for site requests, in milliseconds. */
  timeoutMs?: number;
  /** Environment used to find API keys for Hop 3. Defaults to process.env. */
  env?: Record<string, string | undefined>;
}
