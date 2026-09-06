# Business Risk API

Assess customer-supplied business facts and detect ownership, officer, licence, status, address, and jurisdiction changes.

- [Product and pricing](https://businessrisk-api.com/?utm_source=github&utm_medium=developer&utm_campaign=business-risk-github&utm_content=readme#pricing)
- [Developer documentation](https://businessrisk-api.com/docs?utm_source=github&utm_medium=developer&utm_campaign=business-risk-github&utm_content=readme)
- [Create a free account](https://businessrisk-api.com/signup?utm_source=github&utm_medium=developer&utm_campaign=business-risk-github&utm_content=readme)
- [OpenAPI contract](https://businessrisk-api.com/openapi.json)
- [Postman collection](./postman_collection.json)

## Quickstart: reassess one synthetic company against a prior snapshot without an account

The public demo runs the real production engine, stores nothing, meters nothing,
and requires no API key. The data below is synthetic.

```bash
cat > request.json <<'JSON'
{
  "entity": {
    "entityId": "ent_88213",
    "legalName": "Harbourline Logistics Ltd",
    "jurisdiction": "GB",
    "registrationNumber": "09321884",
    "status": "active",
    "incorporatedOn": "2019-04-02",
    "registeredAddress": {
      "line1": "14 Quay Street",
      "locality": "Manchester",
      "postalCode": "M3 3EN",
      "country": "GB"
    },
    "officers": [
      {
        "officerId": "off_1",
        "name": "Amara Okonjo",
        "role": "director",
        "appointedOn": "2019-04-02"
      },
      {
        "officerId": "off_2",
        "name": "Tom Brennan",
        "role": "director",
        "appointedOn": "2022-01-17",
        "resignedOn": "2026-08-12"
      }
    ],
    "ownership": [
      {
        "holderId": "hold_meridian",
        "holderName": "Meridian Holdings BV",
        "holderType": "entity",
        "basisPoints": 6000
      },
      {
        "holderId": "ind_okonjo",
        "holderName": "Amara Okonjo",
        "holderType": "individual",
        "basisPoints": 1500
      },
      {
        "holderId": "ind_vance",
        "holderName": "Peter Vance",
        "holderType": "individual",
        "subjectId": "hold_meridian",
        "basisPoints": 5500
      }
    ],
    "licences": [
      {
        "licenceId": "lic_opr_2211",
        "kind": "Goods vehicle operator licence",
        "authority": "Traffic Commissioner",
        "status": "active",
        "issuedOn": "2024-03-01",
        "expiresOn": "2026-09-14"
      }
    ],
    "observedAt": "2026-08-31T00:00:00Z"
  },
  "previous": {
    "entityId": "ent_88213",
    "legalName": "Harbourline Logistics Ltd",
    "jurisdiction": "GB",
    "registrationNumber": "09321884",
    "status": "active",
    "incorporatedOn": "2019-04-02",
    "registeredAddress": {
      "line1": "14 Quay Street",
      "locality": "Manchester",
      "postalCode": "M3 3EN",
      "country": "GB"
    },
    "officers": [
      {
        "officerId": "off_1",
        "name": "Amara Okonjo",
        "role": "director",
        "appointedOn": "2019-04-02"
      },
      {
        "officerId": "off_2",
        "name": "Tom Brennan",
        "role": "director",
        "appointedOn": "2022-01-17"
      }
    ],
    "ownership": [
      {
        "holderId": "hold_meridian",
        "holderName": "Meridian Holdings BV",
        "holderType": "entity",
        "basisPoints": 6000
      },
      {
        "holderId": "ind_okonjo",
        "holderName": "Amara Okonjo",
        "holderType": "individual",
        "basisPoints": 1500
      },
      {
        "holderId": "ind_vance",
        "holderName": "Peter Vance",
        "holderType": "individual",
        "subjectId": "hold_meridian",
        "basisPoints": 4000
      }
    ],
    "licences": [
      {
        "licenceId": "lic_opr_2211",
        "kind": "Goods vehicle operator licence",
        "authority": "Traffic Commissioner",
        "status": "active",
        "issuedOn": "2024-03-01",
        "expiresOn": "2026-09-14"
      }
    ],
    "observedAt": "2026-05-31T00:00:00Z"
  }
}
JSON

curl -sS -X POST https://businessrisk-api.com/v1/demo/assess \
  -H 'content-type: application/json' \
  --data-binary @request.json
```

Selected fields from the deterministic 200 response (evaluated at
`2026-09-06T20:30:00.000Z` for this example):

```json
{
  "assessment": {
    "entityId": "ent_88213",
    "legalName": "Harbourline Logistics Ltd",
    "score": 67,
    "band": "high",
    "signals": [
      {
        "code": "ownership_unallocated_major",
        "category": "ownership",
        "severity": "high",
        "weight": 18,
        "detail": "25.00% of the entity is held by nobody the record names."
      },
      {
        "code": "recent_ownership_shift",
        "category": "change",
        "severity": "high",
        "weight": 15,
        "detail": "1 holder(s) crossed an ownership threshold since the previous snapshot."
      },
      {
        "code": "recent_officer_departure",
        "category": "change",
        "severity": "medium",
        "weight": 12,
        "detail": "1 officer(s) in a control role left since the previous snapshot: Tom Brennan."
      },
      {
        "code": "indirect_beneficial_owner",
        "category": "ownership",
        "severity": "medium",
        "weight": 8,
        "subject": "ind_vance",
        "detail": "Peter Vance holds 33.00% effectively but only 0.00% directly — the stake exists through 1 intermediate holder(s). A flat cap table misses this person."
      },
      {
        "code": "licence_expiring_soon",
        "category": "licence",
        "severity": "medium",
        "weight": 8,
        "subject": "lic_opr_2211",
        "detail": "Licence \"lic_opr_2211\" (Goods vehicle operator licence, Traffic Commissioner) expires in 8 day(s), on 2026-09-14."
      },
      {
        "code": "sole_officer",
        "category": "officers",
        "severity": "low",
        "weight": 6,
        "detail": "One active officer (Amara Okonjo). One departure leaves the entity with none."
      }
    ],
    "ownership": {
      "thresholdBasisPoints": 2500,
      "owners": [
        {
          "holderId": "hold_meridian",
          "holderName": "Meridian Holdings BV",
          "holderType": "entity",
          "effectiveBasisPoints": 6000,
          "effectivePercent": "60.00%",
          "directBasisPoints": 6000,
          "shortestChainLength": 1,
          "pathCount": 1,
          "beneficialOwner": true,
          "indirect": false
        },
        {
          "holderId": "ind_vance",
          "holderName": "Peter Vance",
          "holderType": "individual",
          "effectiveBasisPoints": 3300,
          "effectivePercent": "33.00%",
          "directBasisPoints": 0,
          "shortestChainLength": 2,
          "pathCount": 1,
          "beneficialOwner": true,
          "indirect": true
        },
        {
          "holderId": "ind_okonjo",
          "holderName": "Amara Okonjo",
          "holderType": "individual",
          "effectiveBasisPoints": 1500,
          "effectivePercent": "15.00%",
          "directBasisPoints": 1500,
          "shortestChainLength": 1,
          "pathCount": 1,
          "beneficialOwner": false,
          "indirect": false
        }
      ],
      "beneficialOwnerCount": 2,
      "directAllocatedBasisPoints": 7500,
      "unallocatedBasisPoints": 2500,
      "deepestChain": 2,
      "cycles": [],
      "truncated": false,
      "depthLimitReached": false,
      "edgeCount": 3,
      "danglingEdgeCount": 0
    },
    "licences": [
      {
        "licenceId": "lic_opr_2211",
        "kind": "Goods vehicle operator licence",
        "authority": "Traffic Commissioner",
        "status": "active",
        "expiresOn": "2026-09-14",
        "daysRemaining": 8,
        "expiry": "expiring_soon",
        "effective": true
      }
    ],
    "changes": [
      {
        "code": "officer_resigned",
        "material": true,
        "severity": "high",
        "field": "officers",
        "subject": "Tom Brennan",
        "before": "in post",
        "after": "resigned 2026-08-12",
        "detail": "Tom Brennan (director) is no longer in post — resigned 2026-08-12."
      },
      {
        "code": "ownership_threshold_crossed_up",
        "material": true,
        "severity": "high",
        "field": "ownership",
        "subject": "ind_vance",
        "before": 2400,
        "after": 3300,
        "thresholdsBasisPoints": [
          2500
        ],
        "detail": "Peter Vance crossed 25.00% upward: 24.00% to 33.00% effective ownership."
      }
    ],
    "changeSummary": {
      "total": 2,
      "material": 2,
      "informational": 0,
      "hasMaterialChange": true
    },
    "warnings": []
  },
  "options": {
    "beneficialOwnerThresholdBasisPoints": 2500,
    "materialCrossingThresholdsBasisPoints": [
      2500,
      5000,
      7500
    ],
    "licenceExpiryWarningDays": 30,
    "recentIncorporationDays": 180,
    "elevatedRiskJurisdictions": []
  },
  "requestId": "req_example"
}
```

The first useful result is a high risk score with two material changes: a director resigned and one indirect owner crossed the 25% threshold. The licence also expires in eight days.

### Input contract

Business Risk does not query registries or enrich a company. Supply current facts and, for change detection, a previous snapshot; basis points are integers out of 10,000.

## Create and use a free API key

```bash
curl -sS -X POST https://businessrisk-api.com/v1/keys \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","name":"github-quickstart","source":{"source":"github","medium":"developer","campaign":"business-risk-github","content":"readme"}}'

curl -sS -X POST https://businessrisk-api.com/v1/keys/claim \
  -H 'content-type: application/json' \
  -d '{"token":"PASTE_ONE_TIME_TOKEN_FROM_EMAIL"}'

export API_KEY='PASTE_API_KEY_FROM_CLAIM_RESPONSE'

curl -sS -X POST https://businessrisk-api.com/v1/assessments \
  -H "Authorization: Bearer $API_KEY" \
  -H 'content-type: application/json' \
  --data-binary @request.json
```

The key-request response is `202` and sends a one-time claim token by email. The
claim response is the only place the raw API key is returned; store it securely
and never commit it. The authenticated endpoint accepts the same request shape
as the demo, with the documented production batch limits and metering.

## What to do next

Route the material-change codes to review, refresh the expiring licence evidence, and rerun when the source record changes.

The stable code catalogue for this product is `GET /v1/risk-signals`. Branch on
machine-readable codes, not human-readable detail text.

## Authentication and troubleshooting

- `401`: the authenticated endpoint did not receive a valid active key. Set
  `API_KEY` to the value returned once by `/v1/keys/claim`; do not send a claim
  token as a bearer credential.
- `400 invalid_request`: read `error.details.path` when present and correct the
  named field. This service does **not** emit `422`; a client-side schema tool may
  show `422` before a request reaches the API.
- `429 quota_exceeded` or `429 rate_limited`: inspect `error.code`, honor
  `Retry-After` when present, and retry with bounded exponential backoff. A quota
  exhaustion requires a later quota window or plan change, not a tight retry loop.

Every API error has `{"error":{"code","message","requestId"}}`. Share the
request ID with support, never the API key, claim token, or customer payload.

## SDKs and authoritative contract

- Python: `./sdk/python/business_risk.py`
- TypeScript: `./sdk/typescript/index.ts`

The live OpenAPI document is authoritative for operations and schemas. This
overlay is a customer-runnable example aligned to that contract; it does not
replace the OpenAPI document or claim that an unresolved external contract is
authoritative.

## Distribution attribution

The key request above uses `business-risk-github` as the stable GitHub campaign. The
Postman collection uses `postman / collection / business-risk-postman /
public-collection`. These are attribution inputs, not claims of customers or
revenue.

## License

[MIT](./LICENSE)
