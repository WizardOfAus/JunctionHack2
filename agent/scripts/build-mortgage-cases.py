"""Build agent/src/mortgage/applications.json from the upstream mortgage files.

Usage: python3 scripts/build-mortgage-cases.py <folder with the two upstream mtg_*.csv files>
Source: hackjunction/Junction-2026-S-pankki at fbdecdedf1a1f49dd641c2e6b9f2b62d0dc0cc8f (synthetic).
Customer ids are left out, and the tools do not show the application id: the agent compares cases,
it does not look up people.
"""
import csv, datetime, json, pathlib, sys

REVISION = "fbdecdedf1a1f49dd641c2e6b9f2b62d0dc0cc8f"
up = pathlib.Path(sys.argv[1])
out_path = pathlib.Path(__file__).resolve().parent.parent / "src" / "mortgage" / "applications.json"

def read(name):
    with open(up / name, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))

def day(ts):  # "26MAY26:00:00:00"
    return datetime.datetime.strptime(ts.split(":")[0], "%d%b%y").date().isoformat()

history = {}
for h in read("mtg_negotiation_history.csv"):
    history.setdefault(h["mortgage_customer_id"], []).append(h)

rows = []
for r in read("mtg_tx_customer_link_and_final_mtg_infio.csv"):
    events = history.get(r["mortgage_customer_id"], [])
    price = float(r["final_property_price_eur"])
    # The final property is the one whose price estimate equals the final price.
    matches = [h["property_type"] for h in events if h["property_type"] and h["property_price_estimate"] and abs(float(h["property_price_estimate"]) - price) < 1]
    types = matches or [h["property_type"] for h in events if h["property_type"]]
    decided = [day(h["timestamp"]) for h in events if h["event_type"] == "loan_decision"]
    applied = [day(h["timestamp"]) for h in events if h["event_type"] == "application_created"]
    rows.append({
        "id": r["mortgage_customer_id"],
        "outcome": r["final_decision"],
        "reason": r["rejection_reason"] or None,
        "propertyType": types[-1] if types else None,
        "priceEur": round(price),
        "loanEur": round(float(r["final_requested_loan_eur"])),
        "equityEur": round(float(r["final_equity_amount_eur"])),
        "collateralEur": round(float(r["final_collateral_value_eur"])),
        "requiredIncomeEur": round(float(r["required_monthly_income_eur"])),
        "appliedOn": min(applied) if applied else None,
        "decidedOn": max(decided) if decided else None,
    })

doc = {
    "$comment": f"Final outcome of the synthetic mortgage applications in hackjunction/Junction-2026-S-pankki at {REVISION}. Built by agent/scripts/build-mortgage-cases.py. Customer ids are left out.",
    "applications": rows,
}
out_path.write_text(json.dumps(doc, separators=(",", ":")) + "\n")
print(f"{len(rows)} applications -> {out_path}; latest decision {max(r['decidedOn'] or '' for r in rows)}; missing type {sum(r['propertyType'] is None for r in rows)}")
