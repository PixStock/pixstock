# Security Policy

PixStock touches wallets, on-chain programs and user funds. We take
vulnerability reports seriously and we would rather hear about a problem
early and privately than read about it on-chain.

## Reporting a vulnerability

**Do not open a public issue for a security problem.**

Report it privately through GitHub: go to the **Security** tab of this
repository and choose **Report a vulnerability** (GitHub Private
Vulnerability Reporting). If that is unavailable, email
**security@pixstock.xyz**.

Please include:

- what the issue is and where it lives (file, endpoint, route, program)
- the steps to reproduce it, or a proof-of-concept
- what an attacker gains — funds at risk, data exposed, ranking manipulated
- your assessment of the severity, and any suggested fix

## What to expect

| | |
|---|---|
| First response | within 72 hours |
| Assessment and severity | within 7 days |
| Fix or mitigation plan | communicated with the assessment |

We will keep you informed while we work on a fix, and we will credit you in
the release notes unless you prefer to stay anonymous.

## Scope

In scope:

- this repository's source code and dependencies
- the deployed PixStock web application and API
- the Solana programs published under the PixStock organization

Out of scope:

- third-party services we integrate with (report those to the vendor)
- findings that require a compromised device, a leaked private key, or
  physical access
- volumetric denial of service, spam, and automated scanner output with no
  demonstrated impact
- missing security headers or best-practice warnings with no exploit path

## Safe harbour

We will not pursue or support legal action against anyone who reports a
vulnerability in good faith, stays within the scope above, avoids privacy
violations and service degradation, and gives us reasonable time to fix the
issue before disclosing it publicly.

## Never send us a private key

No PixStock employee, contributor or automated process will ever ask for
your seed phrase or private key. If a report requires a test wallet, use a
throwaway one funded on devnet.
