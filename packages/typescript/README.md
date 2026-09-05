# Business Risk API TypeScript SDK

Verify businesses and continuously monitor registration, officers, ownership, licences and material risk changes. Assesses the entity data you supply; it queries no registry and issues no credit or legal determination.

This package is the zero-runtime-dependency TypeScript/JavaScript client from
the audited public integration repository. It supports ESM and CommonJS on
Node.js 18 or newer. Import and construction perform no network request.

## Install

```sh
npm install business-risk
```

## Authenticated client

```ts
import { BusinessRisk } from 'business-risk'

const client = new BusinessRisk({
  apiKey: process.env.BUSINESS_RISK_API_KEY,
})
```

Never place an API key in browser code, source control, logs, or examples.
Requesting a sandbox key is an email-verification and claim flow; it does not
return a key in the initial response.

- [Product, docs, demo, pricing, privacy, and terms](https://businessrisk-api.com/?utm_source=npm&utm_medium=package&utm_campaign=business-risk&utm_content=readme)
- [Source and changelog](https://github.com/API-Disk-Integrations/business-risk)
- [Issues](https://github.com/API-Disk-Integrations/business-risk/issues)

Security reports must not be filed in a public issue. Use the repository's
private security-reporting path after the owner confirms it is enabled.

MIT licensed. The API service remains governed by the product site's terms.
