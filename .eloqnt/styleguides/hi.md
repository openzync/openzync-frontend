# `hi` styleguide

## Audience
Technical B2B SaaS users — developers and platform administrators building agent-memory applications. They are fluent in English tech vocabulary, so technical terms in Latin script are expected, not a defect.

## Tone
- Professional and neutral. Standard Hindi (हिंदी), never an overly formal/archaic देवनागरी-heavy register.
- Address the user directly (आप), prefer active voice and short sentences.
- Technical terms follow the glossary (`../../docs/i18n/glossary.md`) — use the canonical loanword or translation exactly. Consistency beats variety.

## Do not translate
- ICU placeholders and counts: `{count}`, `{name}`, `{org}`, `{email}`, `{value}` — keep exactly as-is, including plural syntax and HTML markup (`<strong>`, `<a>`).
- Brand and product names: OpenZync, SurrealDB, FalkorDB, OpenAI, Anthropic, OpenRouter, Azure, Ollama, MinIO, Redis, Prometheus.
- Code identifiers, URLs, model names (gpt-4o-mini), secrets, format tokens, and provider keys.
- Date, number, and time formats; percentages (`{pct}%`); units (MB, ms, s, TTL).

## Do
- Translate every non-technical word: actions, buttons, descriptions, guidance, error messages.
- Keep glossary-specified loanwords in standard Devanagari spelling (e.g. एपिसोड, नॉलेज ग्राफ़).
- Match the glossary gender/number notes for adjective agreement (e.g. नया संदेश, हाइब्रिड खोज).
- Expand acronyms' full Hindi form only where the glossary allows (MFA = बहु-कारक प्रमाणीकरण in help text only).

## Don't
- Don't transliterate a term the glossary translates, or vice-versa — the glossary is authoritative.
- Don't invent synonyms or reword the glossary (e.g. no `परियोजना` for project, no `मेमोरी`→`स्मृति`).
- Don't translate subject-verb agreements into gender-neutral constructions just to avoid the glossary gender; use it.
- Don't drop the `one`/`other` plural distinction in `{count, plural, ...}` strings.
