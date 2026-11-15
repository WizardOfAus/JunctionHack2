# Demo script: find a home and the right mortgage

Status: implemented in `agent/`: the `mortgage-demo` skill (`src/skills/mortgage-demo/`) and two tools,
`mortgage_calculator` and `search_mortgage_cases`. The agent finds homes and rates itself with Exa and uses the
checked demo data in the skill files when live results are poor. The figures below use the snapshot 12-month
Euribor (3.328%, 13 November 2026). Live listings and a newer Euribor can change them.

## The user

Persona **"Mortgage declined: income"** (`home-rejected-income`, CUST02222).

- Age 36, lives in Espoo, pays EUR 1,132 a month for housing. In the demo we say it is rent (the data cannot tell).
- Net salary EUR 5,126 a month, monthly surplus about EUR 2,900, savings EUR 58,250.
- Application record C0137: a EUR 315,000 house, loan EUR 286,500. **Declined in May 2026 for insufficient income.**
- The story: "My application was declined. I rent now. I want a home for the next 10 to 15 years."

## Before the demo

1. `agent/.env`: `OPENAI_API_KEY` and `EXA_API_KEY`. Without Exa the demo works, but there is no live check.
2. Start the agent (`npm run dev` in `agent/`) and the app with the agent connected (see `agent/README.md`).
3. In the app, choose the demo situation **Mortgage declined: income**, then open the coach.

## Script

| Step | The user says | The agent should | Key figures |
|---|---|---|---|
| 1 | "I'm renting at the moment and I want to buy a home I'll live in for 10 to 15 years. My last application was declined. Can you help?" | Activate `mortgage-demo`. Ask where and how big, and about other loans. | |
| 2 | "Somewhere near Helsinki with good transport, two bedrooms would be nice. No other loans." | `mortgage_calculator` (homes only). Explain the decline: the dataset rule allows about EUR 278,000 of loan on this income, and the application asked for EUR 286,500. The bank rule allows more, but the dataset rule is stricter. | Max loan EUR 477k (bank rule), EUR 278k (dataset rule) |
| 3 | (continues) | Exa search on etuovi.com, `read_page`, `HOMES.md`, then `mortgage_calculator`. Show three choices. | |
| | | **Punavuori, Fredrikinkatu 12 B** (EUR 619,000): out of reach. | Debt payments at 6% would be 73.5% of net salary; limit 60% |
| | | **Kontula, Rintinpolku 7 C** (EUR 118,500): cheap and fast. | Loan EUR 68,238; housing EUR 706 a month, EUR 427 less than rent; paid off in 8.6 years at today's housing cost (7-year term: EUR 1,030 a month) |
| | | **Tikkurila, Tikkurilantie 35** (EUR 259,000, built 2016, 2 bedrooms, 15 min by train): fits the stay. | Loan EUR 208,395; housing EUR 1,553 a month, EUR 421 more than rent; stress 26.8% |
| | | Mention the trap at Kaarikuja 4 if asked about cheap homes: a low selling price, but a third of the price is housing company loan. | |
| 4 | "Tikkurila sounds right. I've got three loan offers, which is best?" | `web_search` for today's 12-month Euribor, read `OFFERS.md`, then `mortgage_calculator` with the three offers and a 12-year stay. | |
| | | **Offer C** (12-month Euribor + 0.45%, 0.4% fee, 25 years, Nordea's published example terms): best. | Cost over 12 years EUR 79,838; loan left EUR 132,297 |
| | | **Offer A** (0.80% margin, 2% fee): plainly worse. | EUR 11,586 more over 12 years |
| | | **Offer B** (40 years, 2 years without repayment, 0% margin in year 1): looks best, is worst. | First payment only EUR 580, but EUR 15,603 more cost and EUR 47,778 more loan left after 12 years |
| 5 | "Offer B has the lowest payment though?" | Explain with the warnings: interest only for 2 years, the campaign margin ends, a 40-year term, and the bank still tests 25 years. For a 12-year stay, most of the loan is still unpaid when you sell. | |
| 6 | "Has anyone like me been approved?" | `search_mortgage_cases`. Similar loans in the dataset: most were approved; the most common rejection is a low bank valuation. Say it is not a prediction. | 45 cases within 10%: 31 approved, 11 rejected for collateral |
| 7 | "So what should I do?" | Recommend Tikkurila with Offer C. Next steps: ask 2 or 3 banks for a written offer (S-Pankki's published terms are close: EUR 2,537 more over 12 years), read the housing company documents, keep the EUR 6,211 buffer. Say that this is education, not a loan decision. | |

## Optional live step (Exa)

"Can you find me something similar that's for sale right now?" The agent should use `web_search` with
`includeDomains: ["etuovi.com"]`, read a listing with `read_page`, then pass its prices and charges to `mortgage_calculator`.

## Live test (15 November 2026)

Question: "I'm renting ... 10 to 15 years ... near Helsinki, good transport, two bedrooms ... find me real options
for sale now, and which loan structure would be best?" (CUST02222, app mode, GPT-6 Luna, Exa.)

- The agent activated `mortgage-demo`, read the 4 files, made 6 Exa searches and read 3 Etuovi listings live
  (the three demo homes), then called `mortgage_calculator` once and `search_mortgage_cases` once.
- It found a new real listing in the same building as the demo flat: Tikkurilantie 35 A (Etuovi 80493494),
  3 rooms, 51 m², 2016, EUR 229,000, charges EUR 295.80. All figures match the page. It recommended this flat,
  with Kontula as the cheap option and Punavuori out of reach (73.5% stress share).
- It ranked Offer C first and explained why Offer B's low start is a trap (EUR 155,880 still owed after 12 years).
- In an earlier run, three parallel Exa searches failed once with a network error; the agent then used the skill
  files and still gave a full answer.

## Sources

- Listings: Etuovi, read on 15 November 2026 (URLs in `agent/src/skills/mortgage-demo/HOMES.md`). Area prices: Statistics Finland table 13mu.
- Offer C: Nordea representative example 10/2026 (nominal 3.758%, effective 4.0%, fee EUR 652 on EUR 163,000).
- Offer A and B are illustrative. They use real published terms: the high end of 2026 margins and fees, 40-year loans (legal from 1 June 2026) and a real 0%-margin campaign.
- Rules: FIN-FSA loan cap 95% and the 6% / 60% debt-service rule; transfer tax 1.5% (Vero).
- Not verified: the Euribor snapshot (the source page had a certificate error, but it agrees with the Nordea rate), and the S-Pankki fee waiver until 31 January 2027.
