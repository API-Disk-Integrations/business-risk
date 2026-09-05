# Business Risk API Python SDK

Verify businesses and continuously monitor registration, officers, ownership, licences and material risk changes. Assesses the entity data you supply; it queries no registry and issues no credit or legal determination.

This package is the standard-library-only Python client from the audited public
integration repository. It supports Python 3.10 or newer. Import and
construction perform no network request.

## Install

```sh
python -m pip install business-risk
```

## Authenticated client

```python
import os
from business_risk import BusinessRisk

client = BusinessRisk(os.environ["BUSINESS_RISK_API_KEY"])
```

Never place an API key in source control, logs, or examples. Requesting a
sandbox key is an email-verification and claim flow; it does not return a key
in the initial response.

- [Product, docs, demo, pricing, privacy, and terms](https://businessrisk-api.com/?utm_source=pypi&utm_medium=project&utm_campaign=business-risk&utm_content=readme)
- [Source and changelog](https://github.com/API-Disk-Integrations/business-risk)
- [Issues](https://github.com/API-Disk-Integrations/business-risk/issues)

Security reports must not be filed in a public issue. Use the repository's
private security-reporting path after the owner confirms it is enabled.

MIT licensed. The API service remains governed by the product site's terms.
