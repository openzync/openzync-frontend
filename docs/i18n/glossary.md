# OpenZync Terminology Glossary (English → Hindi)

Source of truth for all Hindi (`hi`) translations of the OpenZync dashboard and transactional emails. When a term is ambiguous, use the canonical form below — do not invent variants. Technical terms are **English loanwords** (naturalized in Indian tech Hindi) unless the Hindi word is unambiguous and standard; product terms are never calqued into archaic Sanskritized Hindi.

Conventions: `(m)` / `(f)` = Hindi grammatical gender (drives adjective agreement — e.g. "new message" = `नया संदेश`, "hybrid search" = `हाइब्रिड खोज`). Acronyms (OTP, MFA, API) stay in Latin script. ICU placeholders (`{count}`, `{name}`), brand names (OpenZync, SurrealDB, FalkorDB), and code identifiers are **never translated** (see `.eloqnt/styleguides/hi.md`).

| English | Hindi (canonical) | Notes |
|---|---|---|
| memory | मेमोरी (f) | Loanword — `स्मृति` reads as cognitive/ephemeral, not stored agent memory. |
| episode | एपिसोड (m) | Loanword. `प्रकरण` is literary/archaic; no natural Hindi equivalent for a conversation-turn unit. |
| fact | तथ्य (m) | Exact Hindi word; standard, use it. Plural stays `तथ्य`. |
| entity | इकाई (f) | Standard technical Hindi for a graph node/legal person. |
| relationship | संबंध (m) | Natural Hindi; used in graph-explorer UI for edges. |
| edge | एज (m) | Graph-theory jargon — keep loanword to distinguish from `संबंध`. |
| knowledge graph | नॉलेज ग्राफ़ (m) | Established loanword compound; `ज्ञान ग्राफ़` reads forced. |
| graph backend | ग्राफ बैकएंड (m) | Keep loanword compound. |
| graph traversal | ग्राफ ट्रैवर्सल (m) | Keep loanword. |
| entity type | इकाई प्रकार (m) | Person/Place/Organization/Event/Concept labels (see UI legend). |
| triple | ट्रिपल (m) | RDF subject–predicate–object — loanword, no Hindi equivalent. |
| confidence | विश्वास (m) | Use in fact table "Confidence" column; `विश्वास स्तर` in full sentences. |
| session | सत्र (m) | Standard for a working session; used consistently across UI. |
| conversation | बातचीत (f) | Natural Hindi; distinct from `सत्र`. |
| message | संदेश (m) | Standard. "Ingest messages" = `संदेश इंगेस्ट करें`. |
| ingest | इंगेस्ट (m) | Data-pipeline loanword; in button labels prefer contextual verbs (`जोड़ें` / `अपलोड करें`). |
| project | प्रोजेक्ट (m) | Loanword — `परियोजना` is government/administrative register. |
| organization | संगठन (m) | Standard Hindi. |
| organization code | संगठन कोड (m) | Join-code feature — keep both halves. |
| user | उपयोगकर्ता (m) | Standard technical Hindi. |
| member | सदस्य (m) | Standard. Plural `सदस्यों`. |
| community | समुदाय (m) | Standard; used for graph clusters. |
| community detection | समुदाय पहचान (f) | Translate fully. |
| enrichment | एनरिचमेंट (m) | Loanword — `समृद्धिकरण` is Sanskritized/awkward. |
| enrichment pipeline | एनरिचमेंट पाइपलाइन (f) | Keep loanword compound. |
| classification | वर्गीकरण (m) | Standard Hindi. |
| classification schema | वर्गीकरण स्कीमा (m) | Mixed — schema is loanword. |
| extraction | एक्सट्रैक्शन (m) | Loanword — `निष्कर्षण` too formal. |
| extraction schema | एक्सट्रैक्शन स्कीमा (m) | Keep compound. |
| embedding | एम्बेडिंग (f) | Loanword — no Hindi equivalent. |
| hybrid search | हाइब्रिड खोज (f) | Loanword + natural `खोज`; gender feminine. |
| context | संदर्भ (m) | Standard; covers "Query Context" and LLM context. |
| retrieval | पुनर्प्राप्ति (f) | Standard in Hindi computing (सूचना पुनर्प्राप्ति). |
| rerank | रीरैंक (m) | Loanword — no Hindi equivalent. |
| reranker | रीरैंकर (m) | Loanword. |
| prompt | प्रॉम्प्ट (m) | Universal loanword in Indian AI media. |
| prompt template | प्रॉम्प्ट टेम्प्लेट (m) | Keep compound. |
| instruction | निर्देश (m) | Standard. Plural `निर्देश`. |
| schema | स्कीमा (m) | Loanword, technical. |
| API key | एपीआई कुंजी (f) | `कुंजी` = key; keep "एपीआई" in Latin. |
| scopes | स्कोप (m) | Loanword, plural as-is. |
| webhook | वेबहुक (m) | Loanword. |
| webhook endpoint | वेबहुक एंडपॉइंट (m) | Loanword compound. |
| audit log | ऑडिट लॉग (m) | Loanword — `लेखापरीक्षण` too formal. |
| actor | कर्ता (m) | Audit-log field (who performed the action). |
| rate limit | रेट सीमा (f) | Loanword `रेट` + natural `सीमा`. |
| subscription | सब्सक्रिप्शन (m) | Loanword — avoids collision with `सदस्यता` (=membership). |
| credits | क्रेडिट (m) | Loanword; usage-count unit. |
| billing | बिलिंग (f) | Loanword — `बिल भुगतान` too verbose. |
| plan | प्लान (m) | Pricing-plan loanword. |
| onboarding | ऑनबोर्डिंग (f) | Loanword — no Hindi equivalent. |
| invite | निमंत्रण (m) | Standard; also `निमंत्रण भेजें` for "Send Invite". |
| verification | सत्यापन (m) | Standard. |
| verification code | सत्यापन कोड (m) | UI + email term; keep `कोड` loanword. |
| one-time code | वन-टाइम कोड (m) | Email OTP wording. |
| OTP | ओटीपी | Acronym, Latin script — never expand. |
| password reset | पासवर्ड रीसेट (m) | Loanwords. |
| password | पासवर्ड (m) | Loanword, universal. |
| MFA | एमएफए | Acronym; full form `बहु-कारक प्रमाणीकरण` only in help text. |
| dark mode | डार्क मोड (m) | Loanword. |
| dashboard | डैशबोर्ड (m) | Loanword. |
| monitoring | निगरानी (f) | Standard, natural. |
| settings | सेटिंग्स (f) | Loanword — `विन्यास` too formal. |
| superadmin | सुपरएडमिन (m) | Loanword; platform role. |
| platform admin | प्लेटफ़ॉर्म एडमिन (m) | Superadmin area label. |
| admin role | एडमिन भूमिका (f) | `एडमिन` loanword + `भूमिका` (role). |
| member role | सदस्य भूमिका (f) | Consistent with admin role. |
| observations | अवलोकन (m) | Session-detail tab; standard Hindi. |
