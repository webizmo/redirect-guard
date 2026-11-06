# Security policy

Security fixes are applied to the latest version on `main`. Older releases do not have a separate maintenance commitment.

## Report a vulnerability

Use GitHub's **Report a vulnerability** option in the repository's Security tab if it is available. Otherwise, use the contact options on [Webizmo's website](https://webizmo.tr/) to request a private security reporting channel. Do not include exploit details or sensitive input in a public issue.

Please describe the affected version, reproduction steps using fictional data, the impact, and any suggested fix. No response-time or bounty commitment is offered.

## Scope and data handling

Redirect Guard parses untrusted CSV text and displays or exports an analysis report. The browser application processes that text locally; it does not upload it or fetch redirect destinations. GitHub Pages serves the application's static files. External links navigate to third-party sites when clicked.

Reports can contain the same paths and destination URLs as the input. Review them before sharing, and avoid placing secrets or personal data in redirect CSV files. Treat the generated report as input to a human review, not as proof that a server configuration is safe or correct.
