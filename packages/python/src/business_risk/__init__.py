"""
Business Risk API client.

Zero dependencies beyond the standard library — no requests, no httpx — so it
drops into any environment without a dependency negotiation.

    from business_risk import BusinessRisk

    client = BusinessRisk()             # reads BUSINESS_RISK_API_KEY
    client = BusinessRisk("sp_live_…")  # or pass it explicitly

The service origin is assigned by the host at deploy time, so it is read from
``BUSINESS_RISK_BASE_URL`` when set. Pass ``base_url`` explicitly otherwise —
this client will not guess a hostname, because a wrong one fails at the worst
possible moment.

Start free-key verification, then claim the token delivered by email:

    curl -X POST "$BUSINESS_RISK_BASE_URL/v1/keys" \
      -H 'content-type: application/json' -d '{"email":"you@example.com","source":{"source":"sdk","medium":"python"}}'

WHAT THIS SERVICE IS. It assesses the entity record YOU send. It queries no
registry, calls no data vendor and stores nothing about any real company. Its
output is reproducible arithmetic on your input — not a credit decision, and
not a legal determination.

Ownership is INTEGER BASIS POINTS, 10000 = 100%. Effective ownership through a
chain is the product of the holdings along it, so a float would drift a holder
across the 25.00% line depending on the order the multiplications ran.
"""

from __future__ import annotations

import json as _json
import os
import urllib.error
import urllib.request

__all__ = [
    "BusinessRisk",
    "ApiError",
    "ENTITY_STATUSES",
    "OFFICER_ROLES",
    "CONTROL_ROLES",
    "LICENCE_STATES",
    "RISK_BANDS",
    "MATERIAL_CHANGE_CODES",
    "BENEFICIAL_OWNER_THRESHOLD_BP",
    "FULL_BP", "API_TITLE", "API_VERSION", "API_BASE_URL", "ERROR_CODES", "OPERATIONS"]

#: Set BUSINESS_RISK_BASE_URL, or pass base_url. Empty means "not configured".
DEFAULT_BASE_URL = os.environ.get("BUSINESS_RISK_BASE_URL", "https://businessrisk-api.com")

#: 100.00%. Every ownership percentage is an integer fraction of this.
FULL_BP = 10_000

#: The line most beneficial-ownership regimes draw. Override per request.
BENEFICIAL_OWNER_THRESHOLD_BP = 2_500

#: "unknown" is a real answer and is scored as a risk, not as an absence of one.
ENTITY_STATUSES = (
    "active",
    "dormant",
    "unknown",
    "suspended",
    "receivership",
    "in_administration",
    "liquidation",
    "struck_off",
    "dissolved",
)

OFFICER_ROLES = ("director", "secretary", "partner", "manager", "trustee", "other")

#: Changes to these roles are material; a company secretary changing is not.
CONTROL_ROLES = ("director", "partner", "manager", "trustee")

LICENCE_STATES = ("active", "pending", "suspended", "revoked", "expired")

RISK_BANDS = ("low", "medium", "high", "critical")

#: Branch on these rather than on the human-readable detail, which may be
#: reworded. Each carries its own ``material`` flag in the response; the
#: authoritative table is ``GET /v1/risk-signals``.
MATERIAL_CHANGE_CODES = (
    "legal_name_changed",
    "legal_name_reformatted",
    "registration_number_changed",
    "jurisdiction_changed",
    "incorporation_date_changed",
    "status_deteriorated",
    "status_improved",
    "status_changed",
    "registered_address_jurisdiction_moved",
    "registered_address_changed",
    "officer_appointed",
    "officer_resigned",
    "officer_removed",
    "officer_role_changed",
    "ownership_threshold_crossed_up",
    "ownership_threshold_crossed_down",
    "ownership_stake_changed",
    "ownership_structure_changed",
    "licence_lapsed",
    "licence_reinstated",
    "licence_added",
    "licence_removed",
    "licence_expiry_changed",
)


class ApiError(Exception):
    """
    Raised for any non-2xx response.

    NOT raised for a high score or a material change — those are successful
    answers to a legitimate question. On a 400, ``details["path"]`` names the
    exact field that failed validation.
    """

    def __init__(self, status: int, code: str, message: str, request_id: str | None = None, details=None):
        super().__init__(f"[{status} {code}] {message}")
        self.status = status
        self.code = code
        self.message = message
        self.request_id = request_id
        self.details = details


class BusinessRisk:
    def __init__(self, api_key: str | None = None, *, base_url: str = DEFAULT_BASE_URL, timeout: float = 30.0):
        key = api_key or os.environ.get("BUSINESS_RISK_API_KEY")
        if not key:
            raise ValueError(
                "No API key. Pass one to BusinessRisk(...) or set "
                'BUSINESS_RISK_API_KEY. Request a free key verification email: POST /v1/keys with {"email": "you@example.com"}'
            )
        if not base_url:
            raise ValueError(
                "No base URL. Pass base_url=... or set BUSINESS_RISK_BASE_URL to the "
                "service origin. This client does not guess a hostname."
            )
        self.api_key = key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    # -- transport ---------------------------------------------------------
    def _request(self, method: str, path: str, *, body=None, auth: bool = True) -> dict:
        data = _json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.base_url + path, data=data, method=method)
        if auth:
            req.add_header("Authorization", f"Bearer {self.api_key}")
        req.add_header("Accept", "application/json")
        if data:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as res:
                return _json.loads(res.read().decode() or "{}")
        except urllib.error.HTTPError as e:
            raw = e.read().decode()
            try:
                err = _json.loads(raw).get("error", {})
            except Exception:
                err = {}
            raise ApiError(
                e.code, err.get("code", "unknown"), err.get("message", raw[:200]),
                err.get("requestId"), err.get("details"),
            ) from None

    # -- API ---------------------------------------------------------------
    def health(self) -> dict:
        """Liveness and deployed version. Does not require a key."""
        return self._request("GET", "/health", auth=False)

    def assess(self, entity: dict, previous: dict | None = None, *, options: dict | None = None) -> dict:
        """
        Assess one entity, optionally against the snapshot you held last time.

        Billed ONE unit whether or not you send ``previous`` — it is one entity
        assessed. Charging per snapshot would price continuous monitoring at
        double a one-off check.
        """
        body: dict = {"entity": entity}
        if previous is not None:
            body["previous"] = previous
        if options is not None:
            body["options"] = options
        return self._request("POST", "/v1/assessments", body=body)

    def assess_batch(self, subjects: list[dict], *, options: dict | None = None) -> dict:
        """
        Assess up to 100 entities in one call. Each entry is
        ``{"entity": {...}, "previous": {...}}`` — ``previous`` optional.

        Billed one unit per entity, reserved atomically before any work runs:
        a batch that exceeds your allowance is rejected whole and consumes
        nothing.
        """
        body: dict = {"subjects": subjects}
        if options is not None:
            body["options"] = options
        return self._request("POST", "/v1/assessments", body=body)

    def demo_assess(self, entity: dict, previous: dict | None = None, *, options: dict | None = None) -> dict:
        """The real engine with no key: one entity, at most 25 officers and 25 holdings."""
        body: dict = {"entity": entity}
        if previous is not None:
            body["previous"] = previous
        if options is not None:
            body["options"] = options
        return self._request("POST", "/v1/demo/assess", body=body, auth=False)

    def risk_signals(self) -> dict:
        """Every signal code with its weight, the band cut-offs and every change code."""
        return self._request("GET", "/v1/risk-signals", auth=False)

    # -- helpers -----------------------------------------------------------
    @staticmethod
    def material_changes(assessment: dict) -> list:
        """
        Just the changes worth a human. Returns ``[]`` when no previous
        snapshot was sent, because nothing was compared.
        """
        return [c for c in (assessment.get("changes") or []) if c.get("material")]

    @staticmethod
    def beneficial_owners(assessment: dict) -> list:
        """Every holder at or above the threshold, including those reached only through a chain."""
        return [o for o in assessment["ownership"]["owners"] if o["beneficialOwner"]]

    @staticmethod
    def create_key(
        email: str,
        *,
        base_url: str = DEFAULT_BASE_URL,
        name: str | None = None,
        source: dict[str, str] | None = None,
    ) -> dict:
        """Request a free sandbox key; this emails a claim token. Claiming returns the key once."""
        if not base_url:
            raise ValueError("No base URL. Pass base_url=... or set BUSINESS_RISK_BASE_URL.")
        payload: dict = {
            "email": email,
            "source": source if source is not None else {"source": "sdk", "medium": "python"},
        }
        if name:
            payload["name"] = name
        req = urllib.request.Request(
            base_url.rstrip("/") + "/v1/keys", data=_json.dumps(payload).encode(), method="POST"
        )
        req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req, timeout=30) as res:
            return _json.loads(res.read().decode())

# ---8<--- BEGIN GENERATED BY tools/gen-sdk.mjs — DO NOT EDIT BELOW ---8<---
# Everything between these markers is written from openapi.json. Change the
# service, regenerate the contract, then re-run `npm run gen:sdk`.

#: The contract this SDK was generated from.
API_TITLE = "Business Risk API"
API_VERSION = "1.0.0"
#: The origin the published contract names.
API_BASE_URL = "https://businessrisk-api.com"

#: Every ``error.code`` the contract publishes. Branch on these, never on the message.
ERROR_CODES = ("invalid_api_key", "missing_api_key", "quota_exceeded", "rate_limited", "invalid_request", "not_found", "method_not_allowed", "payload_too_large", "conflict", "internal_error")

#: The published surface, generated. Ships with the client so an integration
#: can assert against the contract instead of against a changelog.
OPERATIONS = (
    {
        "operation_id": "get/",
        "method": "GET",
        "path": "/",
        "summary": "Service index — endpoints, auth and error format",
        "auth": False,
        "auth_kind": "public",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": (),
    },
    {
        "operation_id": "postApiBillingWebhook",
        "method": "POST",
        "path": "/api/billing/webhook",
        "summary": "Square billing events, forwarded by the shared hub",
        "auth": False,
        "auth_kind": "signature",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": (),
    },
    {
        "operation_id": "getHealth",
        "method": "GET",
        "path": "/health",
        "summary": "Liveness and deployed version",
        "auth": False,
        "auth_kind": "public",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": (),
    },
    {
        "operation_id": "postV1Assessments",
        "method": "POST",
        "path": "/v1/assessments",
        "summary": "Assess entities and detect material changes since a previous snapshot",
        "auth": True,
        "auth_kind": "api_key",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": ("count", "materialChangeCount", "assessments", "options"),
    },
    {
        "operation_id": "postV1Checkout",
        "method": "POST",
        "path": "/v1/checkout",
        "summary": "Start a hosted Square checkout for a paid tier",
        "auth": False,
        "auth_kind": "public",
        "path_params": (),
        "query_params": (),
        "required_body_fields": ("tier",),
        "success_status": 200,
        "response_fields": ("checkoutUrl", "tier", "sku", "requestId"),
    },
    {
        "operation_id": "postV1DemoAssess",
        "method": "POST",
        "path": "/v1/demo/assess",
        "summary": "Public demo — assess one entity without a key",
        "auth": False,
        "auth_kind": "public",
        "path_params": (),
        "query_params": (),
        "required_body_fields": ("entity",),
        "success_status": 200,
        "response_fields": ("assessment",),
    },
    {
        "operation_id": "getV1Invoices",
        "method": "GET",
        "path": "/v1/invoices",
        "summary": "Every invoice issued against this account, newest first (dashboard session required)",
        "auth": False,
        "auth_kind": "session",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": ("product", "count", "note", "invoices", "requestId"),
    },
    {
        "operation_id": "getV1Keys",
        "method": "GET",
        "path": "/v1/keys",
        "summary": "List your API keys for this API",
        "auth": True,
        "auth_kind": "api_key",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": ("product", "accountId", "keys", "requestId"),
    },
    {
        "operation_id": "postV1Keys",
        "method": "POST",
        "path": "/v1/keys",
        "summary": "Request a free sandbox API key (sends a verification email)",
        "auth": False,
        "auth_kind": "public",
        "path_params": (),
        "query_params": (),
        "required_body_fields": ("email",),
        "success_status": 202,
        "response_fields": ("status", "email", "expiresAt", "next", "message", "requestId"),
    },
    {
        "operation_id": "postV1KeysIdRevoke",
        "method": "POST",
        "path": "/v1/keys/{id}/revoke",
        "summary": "Revoke one of your API keys",
        "auth": True,
        "auth_kind": "api_key",
        "path_params": ("id",),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": ("id", "status", "message", "requestId"),
    },
    {
        "operation_id": "postV1KeysIdRotate",
        "method": "POST",
        "path": "/v1/keys/{id}/rotate",
        "summary": "Replace one of your API keys with a new secret",
        "auth": True,
        "auth_kind": "api_key",
        "path_params": ("id",),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 201,
        "response_fields": ("apiKey", "keyId", "replaced", "product", "quotaPerPeriod", "plan", "warning", "requestId"),
    },
    {
        "operation_id": "postV1KeysClaim",
        "method": "POST",
        "path": "/v1/keys/claim",
        "summary": "Exchange an emailed claim token for the API key",
        "auth": False,
        "auth_kind": "public",
        "path_params": (),
        "query_params": (),
        "required_body_fields": ("token",),
        "success_status": 201,
        "response_fields": ("apiKey", "keyId", "product", "quotaPerPeriod", "plan", "warning", "usage", "requestId"),
    },
    {
        "operation_id": "getV1Payments",
        "method": "GET",
        "path": "/v1/payments",
        "summary": "Every payment attempted against this account and how it went (dashboard session required)",
        "auth": False,
        "auth_kind": "session",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": ("product", "count", "note", "payments", "requestId"),
    },
    {
        "operation_id": "getV1RiskSignals",
        "method": "GET",
        "path": "/v1/risk-signals",
        "summary": "The risk signal catalogue, with every weight, band and change code",
        "auth": False,
        "auth_kind": "public",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": ("scoring", "signals", "bands", "changes", "statusRanks", "defaults", "billing", "limits"),
    },
    {
        "operation_id": "getV1Subscription",
        "method": "GET",
        "path": "/v1/subscription",
        "summary": "Your current plan, billing window and available changes (dashboard session required)",
        "auth": False,
        "auth_kind": "session",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": ("product", "subscribed", "status", "plan", "pendingPlan", "planChangesGoThrough", "baseFeeOwner", "cancellation", "tiers", "requestId"),
    },
    {
        "operation_id": "postV1SubscriptionCancel",
        "method": "POST",
        "path": "/v1/subscription/cancel",
        "summary": "Cancel this plan and end metered access (dashboard session required)",
        "auth": False,
        "auth_kind": "session",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": ("canceled", "canceledAt", "entitlement", "money", "finalInvoice", "requestId"),
    },
    {
        "operation_id": "postV1SubscriptionPlan",
        "method": "POST",
        "path": "/v1/subscription/plan",
        "summary": "Upgrade or downgrade to another plan (dashboard session required)",
        "auth": False,
        "auth_kind": "session",
        "path_params": (),
        "query_params": (),
        "required_body_fields": ("planId",),
        "success_status": 200,
        "response_fields": ("changed", "direction", "from", "to", "entitlement", "billing", "requestId"),
    },
    {
        "operation_id": "getV1Usage",
        "method": "GET",
        "path": "/v1/usage",
        "summary": "Your consumption and remaining allowance for this period",
        "auth": True,
        "auth_kind": "api_key",
        "path_params": (),
        "query_params": (),
        "required_body_fields": (),
        "success_status": 200,
        "response_fields": ("product", "tier", "status", "unit", "period", "included", "used", "ceiling", "remaining", "overageSoFarMinor", "spendCapMinor", "requestId"),
    },
)
# ---8<--- END GENERATED BY tools/gen-sdk.mjs ---8<---
