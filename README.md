# Business Risk API

Verify businesses and continuously monitor registration, officers, ownership, licences and material risk changes. Assesses the entity data you supply; it queries no registry and issues no credit or legal determination.

- [Product and pricing](https://businessrisk-api.com/?utm_source=github&utm_medium=developer&utm_campaign=business-risk-github&utm_content=readme#pricing)
- [Developer documentation](https://businessrisk-api.com/docs?utm_source=github&utm_medium=developer&utm_campaign=business-risk-github&utm_content=readme)
- [Create a free account](https://businessrisk-api.com/signup?utm_source=github&utm_medium=developer&utm_campaign=business-risk-github&utm_content=readme)
- [OpenAPI contract](https://businessrisk-api.com/openapi.json)
- [Postman collection](./postman_collection.json)

## Quickstart

### 1. Request a free-key verification email

```bash
curl -X POST https://businessrisk-api.com/v1/keys \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","source":{"source":"github","medium":"developer","campaign":"business-risk-github","content":"readme"}}'
```

The service returns `202 Accepted` and sends a one-time claim link. Follow the
email, or exchange its token with `POST /v1/keys/claim`. The API key is shown
once after verification; store it securely. No card is required for the free
sandbox. Current free allowance: **100 entity assessments/month**.

### 2. Make the first product call

```bash
curl -X POST https://businessrisk-api.com/v1/assessments \
  -H "Authorization: Bearer $KEY" \
  -H 'content-type: application/json' \
  -d '{"entity":{
        "entityId":"ent_88213","legalName":"Harbourline Logistics Ltd",
        "jurisdiction":"GB","status":"active",
        "registrationNumber":"09321884","incorporatedOn":"2019-04-02",
        "officers":[{"officerId":"off_1","name":"Amara Okonjo",
                     "role":"director","appointedOn":"2019-04-02"}],
        "ownership":[
          {"holderId":"hold_meridian","holderType":"entity","basisPoints":6000},
          {"holderId":"ind_vance","holderType":"individual",
           "subjectId":"hold_meridian","basisPoints":5500}],
        "licences":[{"licenceId":"lic_opr_2211","kind":"Operator licence",
                     "status":"active","expiresOn":"2026-09-14"}]}}'
```

## SDKs

The repository includes dependency-light client files that point to the current
contract and canonical product domain:

- [Python SDK](./sdk/python/business_risk.py) — reads `BUSINESS_RISK_API_KEY`
- [TypeScript SDK](./sdk/typescript/index.ts)

Copy the file you need into your project. The OpenAPI document remains the
authoritative operation and schema contract.

## Authentication and errors

API operations use `Authorization: Bearer <API_KEY>` (or `x-api-key` where
documented). Dashboard-session operations and signed service webhooks are not
callable with a customer API key. Public demo and health operations require no
credential. Errors use a stable `error.code` plus a request ID for support.

## Distribution attribution

The key request above identifies this README with the stable tuple
`github / developer / business-risk-github / readme`. The Postman collection and both
SDKs carry their own source metadata. Attribution is used to compare qualified
activation and retained use; it is not evidence that this channel already
performs.

## License

[MIT](./LICENSE)
