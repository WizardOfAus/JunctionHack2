# Exa opportunities for Koti

Research notes, 15 November 2026, for the agent owner. These are proposals, not implemented features. Sources: [search reference](https://exa.ai/docs/reference/search), [answer](https://exa.ai/docs/reference/answer), [rate limits](https://exa.ai/docs/reference/rate-limits), [pricing](https://exa.ai/pricing). Recheck them before relying on details.

**Principle:** Exa returns structured values with a citation for each field. Our TypeScript validates and calculates (for example `app/lib/loan-readiness.ts`). The model only narrates. No customer data goes into queries.

## API notes relevant to `agent/src/tools/web-search.ts`

- **`type`:**
  - `auto` (default) for lookups.
  - `deep-lite` (about 4 s) and `deep` (4–15 s) for multi-source answers.
  - `lite` is fast but fetches no live pages.
  - `instant`/`fast` are now `lite`; `deep-reasoning` is now `deep`.
- **`outputSchema`:**
  - The root is `text` or `object`, with at most 10 properties, 2 nesting levels, and `items` on every array.
  - It adds about 2 s.
  - `output.grounding[]` gives citations and a confidence level per field. Drop uncited values and show low confidence.
- **Freshness:** `contents.maxAgeHours` (`24` for rates and prices; `0` forces a fresh fetch). `livecrawl` is deprecated and cannot be combined with it. Use `startPublishedDate` for news.
- **Filters:**
  - `includeDomains` (up to 1,200; prefixes and wildcards allowed), `userLocation: "FI"`, `category`.
  - `includeText`/`excludeText` are deprecated.
  - `additionalQueries` (deep types only) can carry Finnish phrasings.
- **Responses:** log `costDollars`. Pass `notices`, not `warnings`, to the model.
- **Other endpoints:**
  - `/answer` returns an answer with `citations[]` and streams.
  - `/contents` re-fetches a known official page.
  - Monitors can alert when rates or ASP rules change.
- **Price** (per 1,000 requests): `auto` $7, deep types $12, `/answer` $5.
- **Rate limits:** 10 QPS, or 5 for deep types; 429 responses carry `Retry-After`.
- **Free credit:** $10 a month at https://dashboard.exa.ai.

## Ranked use cases

1. **Live mortgage cost** (approved and declined mortgage personas).
   - **Call:** `deep-lite` on suomenpankki.fi, euribor-rates.eu and bank sites (s-pankki.fi, op.fi, nordea.fi, danskebank.fi, aktia.fi, hypo.fi, spankki.fi, omasp.fi), with `maxAgeHours: 24`.
   - **Schema:** `{euribor12m_pct, euribor_date, offers:[{bank, advertised_margin_pct, campaign_text, url}]}`.
   - **Combine:**
     - validate the ranges;
     - feed the rate into `annuityCents` in `loan-readiness.ts`;
     - show "your payment at the advertised margin", labelled *advertised*, not a quote;
     - show the trend against the Bank of Finland overlay.
   - **Declined persona:** search valtiokonttori.fi, varke.fi and valtioneuvosto.fi for the state guarantee and ASP limits. Then recompute the deposit gap deterministically.
2. **Benefits and support check** (tight budget, young buyers).
   - **Domains:** kela.fi, varke.fi, valtiokonttori.fi, vero.fi, valtioneuvosto.fi.
   - **Schema:** `{benefit, applies_if[], excluded_if[], amount_rule, effective_date, url}`.
   - **Combine:** check the conditions against the persona's age, postcode and tenure in code. The output is a dated checklist with application links.
   - **Recent facts that need live search:** housing allowance stopped for owner-occupied homes in 2025, and the general benefit (yleistuki) started in May 2026.
3. **S Group deal finder** (flexible spender; sponsor fit).
   - **Domains:** s-kanava.fi, raflaamo.fi, abcasemat.fi, s-pankki.fi, foodie.fi, with `userLocation` from the Paavo postcode and `maxAgeHours: 72`.
   - **Schema:** `{offers:[{chain, offer, price_eur, valid_until, url}]}`.
   - **Combine:** the monthly saving is (merchant average − offer) × visit frequency, computed from the ledger. Crawl coverage of JavaScript-heavy offer pages is unverified, so test it live first.
4. **Electricity and mobile switching.**
   - **Domains:** sahkonhinta.fi (the Energy Authority's comparison site), energiavirasto.fi, porssisahko.net, plus operator sites.
   - **Combine:** estimate kWh from utility spend, and compute the annual saving in code.
   - **Butler step:** a drafted switch message.
5. **Rent fairness and area price ceiling.**
   - **Sources:** stat.fi rent index; kiinteistonvalitysalan.fi / asuntojen.hintatiedot.fi €/m².
   - **Combine:** the loan-readiness `maxPriceCents` ÷ €/m² gives "about N m² in this area".
   - **Don't scrape listings:** etuovi.com and asunnot.oikotie.fi robots files disallow AI crawlers. Deep-link to the portals' own search with our ceiling and postcode instead.

## Butler steps (approval stays with the user)

- A drafted email to the bank's mortgage advisor, prefilled with the loan-readiness summary.
- A checklist with dates: ASP deposit months, valuation, guarantee application.
- Drafted cancellation or switch messages.

## Safety and reliability

- **Topic allowlists in code:** the model picks a topic (`AUTHORITY`, `BANKS`, `SGROUP`) and the tool maps it to domains.
- **Untrusted page text:**
  - Extract through schemas.
  - Validate with valibot.
  - Strip URLs that aren't on the allowlist.
  - Page text never triggers other tools or drafting without confirmation.
- **Sources in the UI:** one chip per number (domain, date). Flag pages whose effective date is too old.
- **Caching:** key on topic, normalised query and day. Pre-warm the demo queries. Keep dated fixtures as a fallback.
- **On 429, timeout or 5xx:** retry once, then show the cached result labelled with its date. The deterministic figures stay.
- **Evaluation:** about 20 queries with known answers (Euribor, Kela rules, guarantee percentage). Assert that every number is cited, comes from an allowed domain and is within range.

## Configuration

- `EXA_API_KEY` in `agent/.env` turns on the existing tools.
- Possible additions, to be documented in `.env.example` if added: `EXA_CACHE_TTL_HOURS`, `EXA_DEMO_FIXTURES=1`.
