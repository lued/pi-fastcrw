# `/fastcrw` command

Subcommands, activation controls, and what each tool schema costs in context.

Argument completion is available for these subcommands:

| Command | Behavior |
| --- | --- |
| `/fastcrw` or `/fastcrw status` | Resolved URL, key presence (never its value), hosted-monitor configuration, `/health`, `/ready`, refreshed capability version and LLM summary. |
| `/fastcrw tools` or `/fastcrw tools list` | Each tool's active/inactive state and approximate schema-token cost. |
| `/fastcrw tools enable <name\|all>` | Activate selected native tools now and remove them from persisted `disabledTools`. |
| `/fastcrw tools disable <name\|all>` | Deactivate selected tools now and persist their full names. |
| `/fastcrw snapshots` | List saved baseline metadata. |
| `/fastcrw metrics` | Summarize `/metrics/renderer-breakers` and `/metrics/renderer-preferences`; full responses spill privately. Routes the server does not expose (404) are reported as unavailable. |
| `/fastcrw reset breakers` | POST `/admin/breakers/reset`, **only after UI confirmation**. |
| `/fastcrw reset preferences [host]` | POST `/admin/preferences/reset` for one host or all, **only after UI confirmation**. |

Names may be full (`fastcrw_research`) or short (`research`). These controls preserve unrelated active tools and take effect at runtime, never during extension loading. Saved exclusions apply on session start/reload; otherwise all nine engine tools (plus `fastcrw_monitor` when configured) are active by default (pi's own tool filters still apply). `tools enable all` never adds an unconfigured monitor tool.

Resets are refused without a confirmation-capable UI. There are no model-callable admin reset tools. Status/command output is also emitted in non-UI modes.

## Context/token cost

Every active direct tool adds its schema to model requests. `/fastcrw tools list` estimates schema tokens as serialized schema characters ÷ 4; actual provider tokenization and descriptions add overhead. Reduce the load with `/fastcrw tools disable research` or `/fastcrw tools disable all`, then `/fastcrw tools enable search` and `/fastcrw tools enable scrape`. Enable other tools when needed. Changing tools can invalidate a provider's prompt-cache prefix; avoid toggling on every turn.
