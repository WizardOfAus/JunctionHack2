# Searches that work (Exa)

## Homes for sale
- Etuovi is the best source. Listing pages (etuovi.com/kohde/<id>) load as plain text with both prices, the
  housing company loan share, charges, energy class, renovations and transport.
- web_search with includeDomains ["etuovi.com"], for example:
  "myytävä kolmio Tikkurila Vantaa velaton hinta", "myytävä kaksio Kontula Helsinki",
  "myytävä asunto Punavuori Helsinki 3h".
- Then read_page on one or two listing URLs to get the figures.
- Oikotie listings appear in search results, but the pages cannot be read; use only the highlights.
- Leave out right-of-occupancy (asumisoikeus) and part-ownership (osaomistus) homes: their prices are not
  purchase prices.
- Area prices: Statistics Finland (stat.fi), "Prices of dwellings in housing companies" by postcode.

## Rates and offers
- 12-month Euribor: search "12 kk euribor" with includeDomains ["suomenpankki.fi", "euribor-rates.eu"].
- Bank margins and fees: search the bank's own site, for example includeDomains ["nordea.fi"] or ["s-pankki.fi"],
  "asuntolaina esimerkki todellinen vuosikorko". A representative example gives the rate, the effective rate and fees.
- Comparisons: taloustaito.fi publishes margin comparisons of several banks.
- Rules: finanssivalvonta.fi (loan cap, stress test), vero.fi (transfer tax), valtiokonttori.fi (ASP, guarantees).

## Rules for queries
- Never put the customer id, names or amounts from the data in a query.
- Use publishedAfter for rates and offers, so the results are recent.
