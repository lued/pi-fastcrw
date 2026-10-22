# Security policy

## Supported versions

Security fixes land on `main` and ship in the next tagged release. Only the latest release is
supported. `pi` itself and the fastCRW engine are separate projects; report their defects to them.

## Private reporting

Report suspected vulnerabilities through GitHub private vulnerability reporting:

<https://github.com/lued/pi-fastcrw/security/advisories/new>

Do not open a public issue, discussion or pull request for a vulnerability, and do not attach
credentials, engine URLs, private paths or real page content. If evidence itself is sensitive,
describe it first and wait for a private channel.

Include the affected version or commit, the impact, a minimal reproduction, and a mitigation if you
have one.

## Scope

The extension runs with pi's OS permissions. It treats the configured engine as a trusted service and
the web pages it fetches as untrusted data. `docs/security.md` documents the guarantees.

In scope:

- credential handling: origin pinning for the engine and control-plane keys, redaction in results,
  errors and spill files, keys never reaching target-page headers
- local writes: config, snapshot, lock and spill permissions, atomic replacement, symlink handling
- output safety: terminal-control escaping, untrusted-content wrapping, output bounds
- request handling: redirect policy, job-id encoding, URL and config validation
- admin commands: confirmation gates, absence of model-callable reset tools

Out of scope:

- defects in the fastCRW engine, in pi core, or in a model provider
- anything that requires pre-existing write access to the user's account or config
- the documented limit that redaction is best-effort literal matching, not secret detection
- prompt-injection style content in fetched pages, which is handled by wrapping and by instructing
  the model to treat it as data, not by filtering

## Response

Reports are acknowledged on a best-effort basis. A fix or documented mitigation is prepared before
public disclosure, and credit is given unless you ask otherwise.
