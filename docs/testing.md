# Testing and troubleshooting

Offline suite, live smoke, manual in-pi checks, and known failure modes.

## Testing

```bash
npm ci
npm run check                 # strict type-check: index.ts, test.mts, smoke.mts
npm test                      # offline, real SDK + local mock engine; no credentials required
npm run smoke                 # live, uses your user config; makes real engine requests
npm run smoke -- --abort-only # opt-in: one 20-page Wikipedia crawl, abort after ~3 seconds
npm run smoke -- --monitor    # opt-in: read-only hosted monitor checks; prints SKIP without monitor config
npm pack --dry-run            # inspect only; does not publish
```

The offline suite creates an isolated HOME, `FASTCRW_CONFIG` and `FASTCRW_HOME` before importing the SDK/extension. It uses an in-memory session/settings and a loopback `http.createServer`; a fetch guard rejects external requests. It never reads your real config or snapshots. A second loopback server mocks the hosted control plane under `/api`. Monitor scenarios load the extension into extra sessions. They cover absence without config, every action's route/method/body/id encoding, key-origin isolation, webhook-secret withholding, 409 handling and validation. It also covers config precedence/validation, schemas, credential pinning/redirects/redaction, body mapping, jobs/progress/timeouts/cancellation, private spills/baselines, multipart PDF validation, research, capabilities, tool activation, admin guards and renderer safety. It normally finishes well under 30 seconds. CI runs only offline checks on Node 22 and 24; it never runs live smoke or publishes.

Live smoke tests exercise all nine schemas (no `anyOf`/`oneOf`/`const`), source/category/summarize search, scrape chunking/cache/rendering/evidence, map filters, crawl paging/errors/active, two-URL batch start/status/errors/cancel, schema+basis extraction, persistent changes/list/forget and stateless single/batch diff, a generated local PDF, and all four research actions. Snapshot tests use a unique tag, verify permissions, and forget it in `finally`. Page requests use only example.com, en.wikipedia.org, and pi.dev, with small limits. **No live admin resets.** Normal smoke also checks that `fastcrw_monitor` is present exactly when a monitor key is configured. `--monitor` runs only `balance`, `list`, and `get`/`checks` on the first listed monitor. It never creates, updates, deletes or runs monitors.

`smoke` prints `PASS`, `FAIL` (unexpected result/extension bug), or `SERVER` (HTTP 503/504, `search_degraded`, unavailable engine synthesis, or HTTP 422 `pdf_parse_failed`). Search outages/incomplete synthesis are retried once after 20 seconds; SERVER lines do not count as failures. Successful PDF parsing requires the generated text to be returned, not just an HTTP-200 envelope. Missing requested result summaries are reported as partial errors rather than silently passing.

The opt-in `--abort-only` check runs separately from normal smoke: it starts a crawl on `https://en.wikipedia.org/wiki/Web_crawler` with `maxPages:20`, aborts the signal after ~3 seconds, verifies rejection, then confirms the job is cancelled. If acceptance has not returned a job ID before abort, cancellation cannot be confirmed; investigate engine responsiveness before retrying.

Manual checks inside pi:

| Feature | Try this prompt |
| --- | --- |
| status/metrics | Type `/fastcrw status`, then `/fastcrw metrics`. |
| search | “Search for pi coding agent, 2 results, with a cited answer.” |
| chunks | “Scrape https://en.wikipedia.org/wiki/Web_crawler with query 'politeness', topK 2, sentence chunking.” |
| screenshot | “Take a full-page screenshot of https://example.com.” |
| map | “Map https://pi.dev and include only URLs containing docs.” |
| crawl/progress | “Crawl https://example.com, maxPages 2; show progress and errors.” |
| abort | Start a crawl, press Esc; check that cancellation was attempted. |
| batch | “Batch scrape https://example.com and https://pi.dev; wait, then inspect status with skip 0, limit 1, and get errors.” |
| extraction | “Extract the title from https://example.com with a title schema and basis:true.” |
| changes | “Track https://example.com under tag manual-demo twice; expect first observation then same. List snapshots and forget that tag.” |
| inline diff | “Diff markdown 'old title' against 'new title' with fastcrw_changes; do not fetch a URL.” |
| parse | “Use fastcrw_parse on ./document.pdf as markdown.” Only use a PDF you authorize uploading. |
| research | “Find one paper on attention, inspect its abstract passages, get one reference, and one matching GitHub README.” |
| truncation | “Scrape https://en.wikipedia.org/wiki/List_of_programming_languages as rawHtml”; read the full spill path. |
| admin safety | Manually enter `/fastcrw reset preferences example.com` and decline confirmation; nothing should reset. |

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| `401` | Set `CRW_API_KEY` or file `apiKey` for this engine; stale nonempty environment variables override the file. The error includes the `CRW_API_KEY` hint. Never paste your key into chat. |
| `503 search_degraded` | The engine's search upstream is unavailable/rate-limited. Wait and retry once; smoke already retries search once after 20 seconds. Check engine health and provider limits. |
| `422 pdf_parse_failed` | Engine-side PDF parser/sandbox issue, not necessarily an invalid upload. Verify `%PDF-` signature, size, parser availability and server logs. OCR is not guaranteed. |
| Timeout / job still running | Individual HTTP requests are capped at 290 seconds. `waitSeconds` is an inline budget, not a remote job deadline. Resume with `action:status` + `jobId`, or explicitly cancel it. Map native timeouts above 280 seconds are clamped. User abort after acceptance attempts cancellation independently. |
| `summarizeResults` returns no summaries for news | This engine summarizes web results only. Use web sources or scrape the news URLs with summary format. Missing requested summaries are surfaced, not silently discarded. |
| Capability limit / renderer error | Reduce the named limit or select `auto`/an advertised renderer. Capabilities are cached for 10 minutes; `/fastcrw status` refreshes them. Discovery failure alone does not block a call. |
| `fastcrw_monitor` missing | Set `monitor.apiKey` or `FASTCRW_MONITOR_API_KEY`, then `/reload`; `/fastcrw status` shows whether the control plane is configured. |
| Tool missing | Check `/fastcrw tools list`, persisted `disabledTools`, pi `--tools`/`--exclude-tools`, and `/reload`. Enable with `/fastcrw tools enable <name>`. |
| Bad config | Confirm valid JSON with an object root, and `disabledTools` as an array of strings. Inspect `FASTCRW_CONFIG` if a different path is being read. |
| Snapshot busy | Another writer may be using the same URL/tag. Retry or inspect the `.lock`; remove it only after verifying no writer is active. Use unique tags for independent baselines. |
