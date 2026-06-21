# Security Policy

To report a security vulnerability for GameOps Agentic Framework, use GitHub private security advisories:

https://github.com/Z-57-z/gameops-agentic-framework/security/advisories/new

Please do not open a public issue for security problems, and do not include live credentials, tokens, customer data, or private deployment details in any report.

## Contributor PR security gate

This fork keeps the upstream security-gate pattern: untrusted pull requests should be statically scanned before project code is checked out, built, or run with access to privileged CI settings.

If you enable GitHub Actions for `Z-57-z/gameops-agentic-framework`, review the workflow conditions, required checks, repository secrets, and package publishing permissions before accepting external pull requests.
