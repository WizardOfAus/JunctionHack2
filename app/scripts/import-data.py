#!/usr/bin/env python3
"""Reproduce Koti's source audit and isolated demo artifacts using stdlib only.

Download the pinned Git LFS payload (not its pointer) into work/transactions.csv.
Run from app/: python3 scripts/import-data.py
September rows are written ONLY under ignored work/, never into the app artifact.
"""
import argparse
import csv
import hashlib
import json
from collections import Counter, defaultdict
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from statistics import median

CUSTOMER = "CUST04859"
REVISION = "fbdecdedf1a1f49dd641c2e6b9f2b62d0dc0cc8f"
AS_OF = "2026-09-01"
SOURCE_URL = f"https://media.githubusercontent.com/media/hackjunction/Junction-2026-S-pankki/{REVISION}/tx_junction_transactions.csv"


def cents(value):
    return int((Decimal(value) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def rounded(value):
    return int(Decimal(str(value)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=Path("work/transactions.csv"))
    parser.add_argument("--output", type=Path, default=Path("data/persona.json"))
    parser.add_argument("--holdout", type=Path, default=Path("work/holdout.json"))
    args = parser.parse_args()
    rows, customers, accounts, previous = [], set(), defaultdict(set), {}
    count, reconciliation_errors = 0, 0
    earliest, latest = "9999-12-31", "0000-01-01"
    with args.input.open(encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        if "customer_id" not in (reader.fieldnames or []):
            raise SystemExit("Expected the CSV payload; the downloaded file may be a Git LFS pointer.")
        for source_row, raw in enumerate(reader, start=2):
            count += 1
            customers.add(raw["customer_id"])
            account = raw["bank_account_id"]
            accounts[raw["customer_id"]].add(account)
            amount, balance = cents(raw["tx_amount_eur"]), cents(raw["balance_after_eur"])
            if account in previous and previous[account] + amount != balance:
                reconciliation_errors += 1
            previous[account] = balance
            earliest, latest = min(earliest, raw["tx_date"]), max(latest, raw["tx_date"])
            if raw["customer_id"] == CUSTOMER:
                rows.append({**raw, "id": f"row-{source_row}", "sourceRow": source_row,
                             "amountCents": amount, "balanceCents": balance})
    history = [row for row in rows if row["tx_date"] < AS_OF]
    holdout = [row for row in rows if AS_OF <= row["tx_date"] <= "2026-09-30"]
    assert history and all(row["customer_id"] == CUSTOMER for row in history)
    assert len({row["bank_account_id"] for row in history}) == 1
    assert not any(row["tx_date"] >= AS_OF for row in history)
    annual = [row for row in history if row["tx_date"] >= "2025-09-01"]
    months = [f"2025-{m:02d}" for m in range(9, 13)] + [f"2026-{m:02d}" for m in range(1, 9)]
    monthly = []
    for month in months:
        selected = [row for row in annual if row["tx_date"].startswith(month)]
        salary = sum(row["amountCents"] for row in selected if row["transaction_type"] == "salary")
        saving = -sum(row["amountCents"] for row in selected if row["transaction_type"] == "investment_deposit")
        net = sum(row["amountCents"] for row in selected)
        category_totals = dict(sorted(Counter({
            category: -sum(row["amountCents"] for row in selected if row["category"] == category and row["amountCents"] < 0)
            for category in {row["category"] for row in selected if row["amountCents"] < 0}
        }).items()))
        monthly.append({"month": month, "salaryCents": salary, "savingOutflowsCents": saving,
                        "netCashflowCents": net, "surplusBeforeSavingCents": net + saving,
                        "spendingByCategory": category_totals})
    recent = [row for row in history if row["tx_date"] >= "2026-06-01"]
    august = [row for row in history if row["tx_date"] >= "2026-08-01"]
    restaurant_total = -sum(row["amountCents"] for row in recent if row["category"] == "Restaurants")
    targets = {
        "closingBalanceCents": history[-1]["balanceCents"],
        "medianMonthlySalaryCents": rounded(median([month["salaryCents"] for month in monthly])),
        "medianMonthlySurplusBeforeSavingCents": rounded(median([month["surplusBeforeSavingCents"] for month in monthly])),
        "medianMonthlySavingOutflowsCents": rounded(median([month["savingOutflowsCents"] for month in monthly])),
        "meanMonthlyRestaurantCents": rounded(Decimal(restaurant_total) / 3),
        "restaurantReduction20PercentCents": rounded(Decimal(restaurant_total) / 3 * Decimal("0.2")),
        "augustRecognisedTaxiCents": -sum(row["amountCents"] for row in august if row["mcc_code"] == "4121"),
    }
    expected = dict(zip(targets, [605933, 270099, 58338, 24633, 11432, 2286, 5047]))
    assert targets == expected, f"Historical audit mismatch: {targets!r}"
    recent_months = monthly[-3:]
    category_summaries = []
    for category in sorted({row["category"] for row in recent if row["amountCents"] < 0}):
        by_month = [month["spendingByCategory"].get(category, 0) for month in recent_months]
        category_summaries.append({"category": category, "totalCents": sum(by_month),
                                  "meanMonthlyCents": rounded(Decimal(sum(by_month)) / 3),
                                  "maxMonthlyCents": max(by_month),
                                  "evidenceIds": [row["id"] for row in recent if row["category"] == category]})
    def max_category(name):
        return max(month["spendingByCategory"].get(name, 0) for month in recent_months)
    statistics = {
        **targets,
        "historicalPeriod": {"start": "2025-09-01", "end": "2026-08-31"},
        "restaurantPeriod": {"start": "2026-06-01", "end": "2026-08-31", "months": 3,
                             "totalCents": restaurant_total},
        "monthly": monthly,
        "recentCategorySummaries": category_summaries,
        "categoryCounts": dict(sorted(Counter(row["category"] for row in history).items())),
        "transactionTypeCounts": dict(sorted(Counter(row["transaction_type"] for row in history).items())),
        "salaryDays": sorted({int(row["tx_date"][-2:]) for row in history if row["transaction_type"] == "salary"}),
        "savingDays": sorted({int(row["tx_date"][-2:]) for row in history if row["transaction_type"] == "investment_deposit"}),
        "augustTransportRowsWithUnknownMcc": sum(1 for row in august if row["category"] == "Transportation" and not row["mcc_code"]),
        "historyTransportRowsWithUnknownMcc": sum(1 for row in history if row["category"] == "Transportation" and not row["mcc_code"]),
        "conservativeForecastInputs": {
            "basis": "June–August 2026 minimum salary, maximum monthly category outflows; assumptions requiring confirmation",
            "salaryCents": min(month["salaryCents"] for month in recent_months),
            "salaryDay": 15,
            "housingCents": max_category("Housing"),
            "housingDay": min(int(row["tx_date"][-2:]) for row in recent if row["category"] == "Housing"),
            "utilitiesCents": max_category("Utilities"),
            "groceriesCents": max_category("Groceries"),
            "transportationCents": max_category("Transportation"),
            "healthCents": max_category("Health"),
            "existingSavingCents": max(month["savingOutflowsCents"] for month in recent_months),
            "existingSavingDay": 20,
        },
    }
    digest = hashlib.sha256()
    with args.input.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    provenance = {"sourceUrl": SOURCE_URL, "sourceSha256": digest.hexdigest(),
                  "sourceRowCount": count, "sourceCustomerCount": len(customers),
                  "sourceDateRange": [earliest, latest],
                  "customersWithMultipleAccounts": sum(len(value) != 1 for value in accounts.values()),
                  "sequentialBalanceReconciliationErrors": reconciliation_errors,
                  "historyRowCount": len(history), "historyLastDate": history[-1]["tx_date"],
                  "synthetic": True}
    payload = {"customerId": CUSTOMER, "asOf": AS_OF, "sourceRevision": REVISION,
               "accountId": history[0]["bank_account_id"], "provenance": provenance,
               "transactions": history, "statistics": statistics}
    write_json(args.output, payload)
    write_json(args.holdout, {"customerId": CUSTOMER, "sourceRevision": REVISION,
                             "purpose": "forecast evaluation only; never import into application runtime",
                             "start": AS_OF, "end": "2026-09-30", "transactions": holdout})
    print(json.dumps({"output": str(args.output), "holdout": str(args.holdout),
                      "historyRows": len(history), "holdoutRows": len(holdout),
                      "audit": provenance, "targets": targets,
                      "conservativeForecastInputs": statistics["conservativeForecastInputs"]}, indent=2))


if __name__ == "__main__":
    main()
