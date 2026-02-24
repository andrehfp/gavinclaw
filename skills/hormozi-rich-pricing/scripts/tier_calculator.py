#!/usr/bin/env python3
import argparse
import json


def build_tiers(base_price: float, multiplier: float, levels: int):
    prices = [base_price]
    for _ in range(levels - 1):
        prices.append(prices[-1] * multiplier)
    return prices


def expected_buyers(start_buyers: int, levels: int, take_rate: float):
    buyers = [start_buyers]
    for _ in range(levels - 1):
        buyers.append(max(1, round(buyers[-1] * take_rate)))
    return buyers


def main():
    p = argparse.ArgumentParser(description="Tier ladder calculator")
    p.add_argument("--base", type=float, required=True, help="Tier 1 price")
    p.add_argument("--multiplier", type=float, default=5.0, help="Price jump between tiers (default 5x)")
    p.add_argument("--levels", type=int, default=4, help="Number of tiers")
    p.add_argument("--buyers", type=int, default=100, help="Estimated tier-1 buyers")
    p.add_argument("--take-rate", type=float, default=0.2, help="Expected take rate per upsell")
    args = p.parse_args()

    tiers = build_tiers(args.base, args.multiplier, args.levels)
    buyers = expected_buyers(args.buyers, args.levels, args.take_rate)

    rows = []
    total = 0.0
    for i, (price, n) in enumerate(zip(tiers, buyers), start=1):
        rev = price * n
        total += rev
        rows.append({"tier": i, "price": round(price, 2), "buyers": n, "revenue": round(rev, 2)})

    out = {
        "ok": True,
        "action": "pricing.tier_ladder",
        "data": {
            "base": args.base,
            "multiplier": args.multiplier,
            "levels": args.levels,
            "take_rate": args.take_rate,
            "rows": rows,
            "total_revenue": round(total, 2),
        },
    }
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
