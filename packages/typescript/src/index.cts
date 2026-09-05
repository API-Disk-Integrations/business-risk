/**
 * Business Risk API client.
 *
 * Zero dependencies — uses the platform `fetch`, so it runs in Node 18+, Deno,
 * Bun and Cloudflare Workers without a bundler argument.
 *
 * NOT the browser: these endpoints need an API key and deliberately do not
 * support CORS. A key in front-end JavaScript is a published key.
 *
 * ```ts
 * const client = new BusinessRisk()                  // reads BUSINESS_RISK_API_KEY
 * const client = new BusinessRisk({ apiKey: 'sp_live_…' })
 * ```
 *
 * The service origin is assigned by the host at deploy time, so it is read
 * from `BUSINESS_RISK_BASE_URL` when set. Pass `baseUrl` explicitly otherwise —
 * this client will not guess a hostname, because a wrong one fails at the worst
 * possible moment.
 *
 * Start free-key verification, then claim the token delivered by email:
 * ```
 * curl -X POST "$BUSINESS_RISK_BASE_URL/v1/keys" \
 *   -H 'content-type: application/json' -d '{"email":"you@example.com","source":{"source":"sdk","medium":"typescript"}}'
 * ```
 *
 * WHAT THIS SERVICE IS. It assesses the entity record YOU send. It queries no
 * registry, calls no data vendor and stores nothing about any real company.
 * Its output is reproducible arithmetic on your input — not a credit decision,
 * and not a legal determination.
 *
 * Ownership is INTEGER BASIS POINTS, 10000 = 100%. Effective ownership through
 * a chain is the product of the holdings along it, so a float would drift a
 * holder across the 25.00% line depending on the order the multiplications ran.
 */

const envBaseUrl = (): string => {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
  return env?.['BUSINESS_RISK_BASE_URL'] ?? 'https://businessrisk-api.com'
}

/** From `BUSINESS_RISK_BASE_URL`. Empty when unset — pass `baseUrl` instead. */
export const DEFAULT_BASE_URL: string = envBaseUrl()

/** 100.00%. Every ownership percentage is an integer fraction of this. */
export const FULL_BP = 10_000

/** The line most beneficial-ownership regimes draw. Override per request. */
export const BENEFICIAL_OWNER_THRESHOLD_BP = 2_500

// --- domain types ----------------------------------------------------------

/** `unknown` is a real answer and is scored as a risk, not as an absence of one. */
export type EntityStatus =
  | 'active' | 'dormant' | 'unknown' | 'suspended' | 'receivership'
  | 'in_administration' | 'liquidation' | 'struck_off' | 'dissolved'

export type OfficerRole = 'director' | 'secretary' | 'partner' | 'manager' | 'trustee' | 'other'

/** Changes to these roles are material; a company secretary changing is not. */
export const CONTROL_ROLES: readonly OfficerRole[] = ['director', 'partner', 'manager', 'trustee']

export type LicenceState = 'active' | 'pending' | 'suspended' | 'revoked' | 'expired'
export type OwnerType = 'individual' | 'entity'
export type Severity = 'low' | 'medium' | 'high' | 'critical'
export type RiskBand = Severity

export interface Officer {
  /** Supply one if you want role changes told apart from a departure plus an arrival. */
  officerId?: string
  name: string
  role: OfficerRole
  /** Active from this day, inclusive. */
  appointedOn?: string
  /** The day the appointment TERMINATED. The officer is already gone on that date. */
  resignedOn?: string
}

export interface OwnershipEdge {
  holderId: string
  holderName?: string
  holderType: OwnerType
  /** What is being owned. Defaults to the assessed entity; point it at another holder for a chain. */
  subjectId?: string
  /** Integer basis points, 1..10000. */
  basisPoints: number
}

export interface Licence {
  /** Unique within the snapshot — it is what the change detector diffs on. */
  licenceId: string
  kind: string
  authority?: string
  status: LicenceState
  issuedOn?: string
  /** The LAST DAY the licence is valid. Still good on that date. */
  expiresOn?: string
}

export interface RegisteredAddress {
  line1?: string
  locality?: string
  region?: string
  postalCode?: string
  /** ISO 3166-1 alpha-2. The field that decides whether a move is material. */
  country: string
}

export interface EntitySnapshot {
  entityId: string
  legalName: string
  /** ISO 3166-1 alpha-2 with an optional subdivision: "GB", "US-DE". */
  jurisdiction: string
  status: EntityStatus
  registrationNumber?: string
  incorporatedOn?: string
  registeredAddress?: RegisteredAddress
  officers?: Officer[]
  ownership?: OwnershipEdge[]
  licences?: Licence[]
  /** When you observed this snapshot. Used only to refuse a backwards comparison. */
  observedAt?: string
}

export interface AssessmentOptions {
  /** Default 2500 (25.00%). */
  beneficialOwnerThresholdBasisPoints?: number
  /** Crossing any of these makes an ownership change material. Default [2500, 5000, 7500]. */
  materialCrossingThresholdsBasisPoints?: number[]
  /** Default 30. */
  licenceExpiryWarningDays?: number
  /** Default 180. */
  recentIncorporationDays?: number
  /** YOUR policy list. The API publishes no country list of its own. */
  elevatedRiskJurisdictions?: string[]
}

export type RiskSignalCode =
  | 'status_dissolved' | 'status_insolvency' | 'status_suspended' | 'status_dormant' | 'status_unknown'
  | 'registration_number_missing' | 'incorporation_date_missing' | 'recently_incorporated'
  | 'jurisdiction_flagged_by_policy' | 'address_missing' | 'jurisdiction_address_mismatch'
  | 'officers_not_supplied' | 'no_active_officers' | 'sole_officer'
  | 'ownership_not_supplied' | 'ownership_unallocated_major' | 'ownership_unallocated_minor'
  | 'no_beneficial_owner' | 'indirect_beneficial_owner' | 'ownership_chain_deep'
  | 'circular_ownership' | 'ownership_traversal_truncated'
  | 'licence_revoked' | 'licence_suspended' | 'licence_expired' | 'licence_expiring_soon'
  | 'licence_expiry_unknown' | 'licence_pending'
  /** The six below can only fire when a previous snapshot was supplied. */
  | 'recent_identity_change' | 'recent_status_deterioration' | 'recent_jurisdiction_move'
  | 'recent_ownership_shift' | 'recent_officer_departure' | 'recent_licence_lapse'

export interface RiskSignal {
  code: RiskSignalCode
  category: 'status' | 'registration' | 'officers' | 'ownership' | 'licence' | 'change'
  severity: Severity
  /** Points this code contributes. `GET /v1/risk-signals` publishes the whole table. */
  weight: number
  subject?: string
  detail: string
}

export interface ScoreBreakdown {
  /** One entry per DISTINCT code. They sum to `rawPoints`. */
  contributions: Array<{ code: RiskSignalCode; weight: number; instances: number }>
  rawPoints: number
  /** `min(100, rawPoints)`. */
  score: number
  capped: boolean
  band: RiskBand
  bands: Array<{ band: RiskBand; minScore: number; maxScore: number }>
}

export interface EffectiveOwner {
  holderId: string
  holderName?: string
  holderType: OwnerType
  /** Sum over every path to the entity, in basis points. */
  effectiveBasisPoints: number
  effectivePercent: string
  /** 0 when they hold only through others. */
  directBasisPoints: number
  shortestChainLength: number
  pathCount: number
  beneficialOwner: boolean
  /** Over the line in total, under it on the entity's own register. */
  indirect: boolean
}

export interface OwnershipAnalysis {
  thresholdBasisPoints: number
  owners: EffectiveOwner[]
  beneficialOwnerCount: number
  directAllocatedBasisPoints: number
  unallocatedBasisPoints: number
  deepestChain: number
  cycles: string[][]
  /** True when a bound stopped the walk. The stakes are then a floor, not a total. */
  truncated: boolean
  depthLimitReached: boolean
  edgeCount: number
  danglingEdgeCount: number
}

export interface LicenceStatus {
  licenceId: string
  kind: string
  authority: string | null
  status: LicenceState
  expiresOn: string | null
  /** Whole UTC days. 0 on the expiry day itself; negative after. */
  daysRemaining: number | null
  expiry: 'valid' | 'expiring_soon' | 'expired' | 'no_expiry'
  /** Usable today: status `active` AND not past its expiry day. */
  effective: boolean
}

export interface OfficerSummary {
  supplied: number
  active: number
  resigned: number
  controlRoleActive: number
  officers: Array<{
    officerId: string
    name: string
    role: OfficerRole
    appointedOn: string | null
    tenureDays: number | null
    controlRole: boolean
  }>
}

export type MaterialChangeCode =
  | 'legal_name_changed' | 'legal_name_reformatted' | 'registration_number_changed'
  | 'jurisdiction_changed' | 'incorporation_date_changed'
  | 'status_deteriorated' | 'status_improved' | 'status_changed'
  | 'registered_address_jurisdiction_moved' | 'registered_address_changed'
  | 'officer_appointed' | 'officer_resigned' | 'officer_removed' | 'officer_role_changed'
  | 'ownership_threshold_crossed_up' | 'ownership_threshold_crossed_down'
  | 'ownership_stake_changed' | 'ownership_structure_changed'
  | 'licence_lapsed' | 'licence_reinstated' | 'licence_added' | 'licence_removed'
  | 'licence_expiry_changed'

export interface MaterialChange {
  code: MaterialChangeCode
  /** The whole point: a crossing is material, a delta usually is not. */
  material: boolean
  severity: Severity
  field: string
  subject?: string
  before: string | number | null
  after: string | number | null
  /** Ownership crossings only: the thresholds crossed, ascending. */
  thresholdsBasisPoints?: number[]
  detail: string
}

export interface ChangeSummary {
  total: number
  material: number
  informational: number
  /** The boolean worth firing a webhook on. */
  hasMaterialChange: boolean
}

export interface RiskAssessment {
  entityId: string
  legalName: string
  jurisdiction: string
  status: EntityStatus
  assessedAt: string
  /** Midnight UTC of the evaluation day — every day-granular answer uses this. */
  evaluationDay: string
  score: number
  band: RiskBand
  scoring: ScoreBreakdown
  signals: RiskSignal[]
  ownership: OwnershipAnalysis
  licences: LicenceStatus[]
  officers: OfficerSummary
  /** Null when no previous snapshot was supplied — nothing was compared. */
  changes: MaterialChange[] | null
  changeSummary: ChangeSummary | null
  warnings: string[]
}

export interface AssessmentResponse {
  count: number
  materialChangeCount: number
  assessments: RiskAssessment[]
  options: Required<AssessmentOptions>
  requestId: string
}

export type ApiErrorCode =
  | 'invalid_api_key' | 'missing_api_key' | 'quota_exceeded' | 'rate_limited'
  | 'invalid_request' | 'not_found' | 'method_not_allowed' | 'payload_too_large'
  | 'conflict' | 'internal_error'

/**
 * Thrown for any non-2xx response.
 *
 * NOT thrown for a high score or a material change — those are successful
 * answers to a legitimate question. On a 400, `details.path` names the exact
 * field that failed validation.
 */
export class ApiError extends Error {
  // Declared as fields rather than constructor parameter properties: those are
  // unsupported by strip-only TypeScript runtimes (Node --experimental-strip-types),
  // and an SDK should run without a build step.
  readonly status: number
  readonly code: ApiErrorCode | 'unknown'
  readonly requestId: string | undefined
  readonly details: unknown

  constructor(status: number, code: ApiErrorCode | 'unknown', message: string, requestId?: string, details?: unknown) {
    super(`[${status} ${code}] ${message}`)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.requestId = requestId
    this.details = details
  }
}

export interface ClientOptions {
  apiKey?: string
  baseUrl?: string
  /** Milliseconds. Default 30000. */
  timeoutMs?: number
  fetch?: typeof fetch
}

/** Optional acquisition metadata. Invalid values are ignored by the service. */
export interface KeySource {
  source?: string
  medium?: string
  campaign?: string
  content?: string
}

export class BusinessRisk {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly timeoutMs: number
  private readonly fetchImpl: typeof fetch

  constructor(options: ClientOptions = {}) {
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
    const key = options.apiKey ?? env?.['BUSINESS_RISK_API_KEY']
    if (!key) {
      throw new Error(
        'No API key. Pass { apiKey } or set BUSINESS_RISK_API_KEY. ' +
          'Request a free key verification email: POST /v1/keys with {"email":"you@example.com"}',
      )
    }
    const base = options.baseUrl ?? DEFAULT_BASE_URL
    if (!base) {
      throw new Error(
        'No base URL. Pass { baseUrl } or set BUSINESS_RISK_BASE_URL to the service origin. ' +
          'This client does not guess a hostname.',
      )
    }
    this.apiKey = key
    this.baseUrl = base.replace(/\/$/, '')
    this.timeoutMs = options.timeoutMs ?? 30_000
    this.fetchImpl = options.fetch ?? globalThis.fetch
  }

  private async request<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const res = await this.fetchImpl(this.baseUrl + path, {
        method,
        signal: controller.signal,
        headers: {
          ...(auth ? { authorization: `Bearer ${this.apiKey}` } : {}),
          accept: 'application/json',
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      })
      const text = await res.text()
      const json = text ? JSON.parse(text) : {}
      if (!res.ok) {
        const e = json?.error ?? {}
        throw new ApiError(res.status, e.code ?? 'unknown', e.message ?? text.slice(0, 200), e.requestId, e.details)
      }
      return json as T
    } finally {
      clearTimeout(timer)
    }
  }

  /** Liveness and deployed version. Does not require a key. */
  async health(): Promise<{ ok: boolean; product: string; version: string }> {
    return this.request('GET', '/health', undefined, false)
  }

  /**
   * Assess one entity, optionally against the snapshot you held last time.
   *
   * Billed ONE unit whether or not `previous` is sent — it is one entity
   * assessed. Charging per snapshot would price continuous monitoring at
   * double a one-off check.
   */
  async assess(input: {
    entity: EntitySnapshot
    previous?: EntitySnapshot
    options?: AssessmentOptions
  }): Promise<AssessmentResponse> {
    return this.request('POST', '/v1/assessments', {
      entity: input.entity,
      ...(input.previous !== undefined ? { previous: input.previous } : {}),
      ...(input.options !== undefined ? { options: input.options } : {}),
    })
  }

  /**
   * Assess up to 100 entities in one call.
   *
   * One unit per entity, reserved atomically before any work runs: a batch
   * that exceeds your allowance is rejected whole and consumes nothing.
   */
  async assessBatch(
    subjects: Array<{ entity: EntitySnapshot; previous?: EntitySnapshot }>,
    options?: AssessmentOptions,
  ): Promise<AssessmentResponse> {
    return this.request('POST', '/v1/assessments', {
      subjects,
      ...(options !== undefined ? { options } : {}),
    })
  }

  /** The real engine with no key: one entity, at most 25 officers and 25 holdings. */
  async demoAssess(input: {
    entity: EntitySnapshot
    previous?: EntitySnapshot
    options?: AssessmentOptions
  }): Promise<{ assessment: RiskAssessment; options: Required<AssessmentOptions>; requestId: string }> {
    return this.request('POST', '/v1/demo/assess', {
      entity: input.entity,
      ...(input.previous !== undefined ? { previous: input.previous } : {}),
      ...(input.options !== undefined ? { options: input.options } : {}),
    }, false)
  }

  /** Every signal code with its weight, the band cut-offs and every change code. */
  async riskSignals(): Promise<Record<string, unknown>> {
    return this.request('GET', '/v1/risk-signals', undefined, false)
  }

  /** Just the changes worth a human. Empty when no previous snapshot was sent. */
  static materialChanges(assessment: RiskAssessment): MaterialChange[] {
    return (assessment.changes ?? []).filter((c) => c.material)
  }

  /** Every holder at or above the threshold, including those reached only through a chain. */
  static beneficialOwners(assessment: RiskAssessment): EffectiveOwner[] {
    return assessment.ownership.owners.filter((o) => o.beneficialOwner)
  }

  /** Request a free sandbox key; this emails a claim token. Claiming returns the key once. */
  static async createKey(email: string, opts: { baseUrl?: string; name?: string; source?: KeySource } = {}): Promise<unknown> {
    const base = opts.baseUrl ?? DEFAULT_BASE_URL
    if (!base) throw new Error('No base URL. Pass { baseUrl } or set BUSINESS_RISK_BASE_URL.')
    const res = await fetch(base.replace(/\/$/, '') + '/v1/keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email,
        ...(opts.name ? { name: opts.name } : {}),
        source: opts.source ?? { source: 'sdk', medium: 'typescript' },
      }),
    })
    const json = await res.json()
    if (!res.ok) throw new ApiError(res.status, json?.error?.code ?? 'unknown', json?.error?.message ?? 'failed', json?.error?.requestId)
    return json
  }
}

export default BusinessRisk

// ---8<--- BEGIN GENERATED BY tools/gen-sdk.mjs — DO NOT EDIT BELOW ---8<---
// Everything between these markers is written from openapi.json. Change the
// service, regenerate the contract, then re-run `npm run gen:sdk`.

/** The contract this SDK was generated from. */
export const API_TITLE = "Business Risk API"
export const API_VERSION = "1.0.0"
/** The origin the published contract names. `DEFAULT_BASE_URL` resolves to this unless overridden. */
export const API_BASE_URL = "https://businessrisk-api.com"

/**
 * Every `error.code` the contract publishes.
 *
 * The runtime companion to the `ApiErrorCode` union: a union is erased at
 * compile time, so a caller wanting to test an unknown string against the
 * documented set had nothing to test it with.
 */
export const ERROR_CODES = ["invalid_api_key", "missing_api_key", "quota_exceeded", "rate_limited", "invalid_request", "not_found", "method_not_allowed", "payload_too_large", "conflict", "internal_error"] as const

/** One published operation, exactly as the contract describes it. */
export interface OperationDescriptor {
  readonly operationId: string
  readonly method: string
  readonly path: string
  readonly summary: string
  /** True when the operation requires an API key. False does NOT mean public — see `authKind`. */
  readonly auth: boolean
  /**
   * The credential the operation actually takes.
   *
   * `api_key` — the bearer token this client sends.
   * `session` — the dashboard session cookie, plus `x-csrf-token` on writes.
   *             An API key is REFUSED: these endpoints change what you are
   *             billed and read your payment history, and a key that lives
   *             in CI must not reach them. Call them from the signed-in
   *             dashboard, not from this SDK.
   * `signature` — machine-to-machine; not callable by API consumers.
   * `public` — no credential at all.
   */
  readonly authKind: 'api_key' | 'session' | 'signature' | 'public'
  readonly pathParams: readonly string[]
  readonly queryParams: readonly string[]
  readonly requiredBodyFields: readonly string[]
  readonly successStatus: number | null
  /** Property names of the documented 2xx body. A field absent here is a field the service does not promise. */
  readonly responseFields: readonly string[]
}

/**
 * The published surface, generated. Ships with the client so an integration
 * can assert against the contract instead of against a changelog.
 */
export const OPERATIONS: readonly OperationDescriptor[] = [
  {
    operationId: "get/",
    method: "GET",
    path: "/",
    summary: "Service index — endpoints, auth and error format",
    auth: false,
    authKind: "public",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: [],
  },
  {
    operationId: "postApiBillingWebhook",
    method: "POST",
    path: "/api/billing/webhook",
    summary: "Square billing events, forwarded by the shared hub",
    auth: false,
    authKind: "signature",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: [],
  },
  {
    operationId: "getHealth",
    method: "GET",
    path: "/health",
    summary: "Liveness and deployed version",
    auth: false,
    authKind: "public",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: [],
  },
  {
    operationId: "postV1Assessments",
    method: "POST",
    path: "/v1/assessments",
    summary: "Assess entities and detect material changes since a previous snapshot",
    auth: true,
    authKind: "api_key",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: ["count", "materialChangeCount", "assessments", "options"],
  },
  {
    operationId: "postV1Checkout",
    method: "POST",
    path: "/v1/checkout",
    summary: "Start a hosted Square checkout for a paid tier",
    auth: false,
    authKind: "public",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: ["tier"],
    successStatus: 200,
    responseFields: ["checkoutUrl", "tier", "sku", "requestId"],
  },
  {
    operationId: "postV1DemoAssess",
    method: "POST",
    path: "/v1/demo/assess",
    summary: "Public demo — assess one entity without a key",
    auth: false,
    authKind: "public",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: ["entity"],
    successStatus: 200,
    responseFields: ["assessment"],
  },
  {
    operationId: "getV1Invoices",
    method: "GET",
    path: "/v1/invoices",
    summary: "Every invoice issued against this account, newest first (dashboard session required)",
    auth: false,
    authKind: "session",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: ["product", "count", "note", "invoices", "requestId"],
  },
  {
    operationId: "getV1Keys",
    method: "GET",
    path: "/v1/keys",
    summary: "List your API keys for this API",
    auth: true,
    authKind: "api_key",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: ["product", "accountId", "keys", "requestId"],
  },
  {
    operationId: "postV1Keys",
    method: "POST",
    path: "/v1/keys",
    summary: "Request a free sandbox API key (sends a verification email)",
    auth: false,
    authKind: "public",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: ["email"],
    successStatus: 202,
    responseFields: ["status", "email", "expiresAt", "next", "message", "requestId"],
  },
  {
    operationId: "postV1KeysIdRevoke",
    method: "POST",
    path: "/v1/keys/{id}/revoke",
    summary: "Revoke one of your API keys",
    auth: true,
    authKind: "api_key",
    pathParams: ["id"],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: ["id", "status", "message", "requestId"],
  },
  {
    operationId: "postV1KeysIdRotate",
    method: "POST",
    path: "/v1/keys/{id}/rotate",
    summary: "Replace one of your API keys with a new secret",
    auth: true,
    authKind: "api_key",
    pathParams: ["id"],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 201,
    responseFields: ["apiKey", "keyId", "replaced", "product", "quotaPerPeriod", "plan", "warning", "requestId"],
  },
  {
    operationId: "postV1KeysClaim",
    method: "POST",
    path: "/v1/keys/claim",
    summary: "Exchange an emailed claim token for the API key",
    auth: false,
    authKind: "public",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: ["token"],
    successStatus: 201,
    responseFields: ["apiKey", "keyId", "product", "quotaPerPeriod", "plan", "warning", "usage", "requestId"],
  },
  {
    operationId: "getV1Payments",
    method: "GET",
    path: "/v1/payments",
    summary: "Every payment attempted against this account and how it went (dashboard session required)",
    auth: false,
    authKind: "session",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: ["product", "count", "note", "payments", "requestId"],
  },
  {
    operationId: "getV1RiskSignals",
    method: "GET",
    path: "/v1/risk-signals",
    summary: "The risk signal catalogue, with every weight, band and change code",
    auth: false,
    authKind: "public",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: ["scoring", "signals", "bands", "changes", "statusRanks", "defaults", "billing", "limits"],
  },
  {
    operationId: "getV1Subscription",
    method: "GET",
    path: "/v1/subscription",
    summary: "Your current plan, billing window and available changes (dashboard session required)",
    auth: false,
    authKind: "session",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: ["product", "subscribed", "status", "plan", "pendingPlan", "planChangesGoThrough", "baseFeeOwner", "cancellation", "tiers", "requestId"],
  },
  {
    operationId: "postV1SubscriptionCancel",
    method: "POST",
    path: "/v1/subscription/cancel",
    summary: "Cancel this plan and end metered access (dashboard session required)",
    auth: false,
    authKind: "session",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: ["canceled", "canceledAt", "entitlement", "money", "finalInvoice", "requestId"],
  },
  {
    operationId: "postV1SubscriptionPlan",
    method: "POST",
    path: "/v1/subscription/plan",
    summary: "Upgrade or downgrade to another plan (dashboard session required)",
    auth: false,
    authKind: "session",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: ["planId"],
    successStatus: 200,
    responseFields: ["changed", "direction", "from", "to", "entitlement", "billing", "requestId"],
  },
  {
    operationId: "getV1Usage",
    method: "GET",
    path: "/v1/usage",
    summary: "Your consumption and remaining allowance for this period",
    auth: true,
    authKind: "api_key",
    pathParams: [],
    queryParams: [],
    requiredBodyFields: [],
    successStatus: 200,
    responseFields: ["product", "tier", "status", "unit", "period", "included", "used", "ceiling", "remaining", "overageSoFarMinor", "spendCapMinor", "requestId"],
  },
]
// ---8<--- END GENERATED BY tools/gen-sdk.mjs ---8<---
