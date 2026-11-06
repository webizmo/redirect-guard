# Contributing to Redirect Guard

Bug reports, documentation fixes, and focused pull requests are welcome. For a larger feature, open an issue first to discuss the intended behavior.

## Development

Use Node.js 22 or newer. The project has no runtime or development dependencies to install.

```sh
npm test
npm start
```

Use the local address printed by the server to inspect the browser application. Run `npm run build` to generate the static `dist/` output. Do not commit generated build output.

## Changes and checks

- Keep browser analysis local: do not add uploads, analytics, or destination fetches as a side effect of checking a CSV.
- Preserve matching semantics unless the change is explicitly documented and tested.
- Add focused tests for parser, graph-analysis, and CLI behavior changes. Include the failing case when fixing a bug.
- For interface changes, check narrow and wide viewports, keyboard navigation, labels, and report downloads.
- Keep the application dependency-free unless a proposed dependency has been discussed.
- Run `npm test` and `npm run build` before opening a pull request. Describe the change and the checks you performed.

## Reporting a problem

Include the browser or Node.js version, the expected behavior, the actual behavior, and a small CSV that reproduces the issue. Replace real customer paths, private URLs, tokens, and personal information with fictional examples before posting.

For security issues, follow [SECURITY.md](SECURITY.md) instead of opening a public issue with exploit details.

Contributions are provided under the project's [MIT license](LICENSE).
