"""The daily model-call cap fits the Anthropic spend limit.

In:  the token counts measured on 24 November 2026 (docs/launch.md, Budget), the published price, and the API's default
     PERMIT_DAILY_MODEL_CALLS.
Out: a failure if a month at the default cap would reach $9 (the $10 limit minus $1 of headroom).

When the model, its price, a prompt or a max_tokens changes, measure again and update MEASURED, PRICE and
docs/launch.md together.
"""
from __future__ import annotations

import math

from api import config

MONTHLY_CEILING_USD = 9.0
DAYS = 31

# Claude Sonnet 5.5, USD per token: https://platform.claude.com/docs/en/about-claude/pricing (read 24 November 2026).
PRICE = {"claude-sonnet-5-5": {"input": 2 / 1_000_000, "output": 10 / 1_000_000}}

# usage.input_tokens and usage.output_tokens from one real call of each (no cache reads or writes).
MEASURED = {
    "plan_reading": {"model": "claude-sonnet-5-5", "input_tokens": 4971, "output_tokens": 1685},
    "assistant_answer": {"model": "claude-sonnet-5-5", "input_tokens": 7652, "output_tokens": 500},
}


def cost(call: dict) -> float:
    p = PRICE[call["model"]]
    return call["input_tokens"] * p["input"] + call["output_tokens"] * p["output"]


def worst_case_cost_per_call() -> float:
    return max(cost(c) for c in MEASURED.values())


def test_the_recorded_costs_match_the_launch_doc():
    assert round(cost(MEASURED["plan_reading"]), 4) == 0.0268
    assert round(cost(MEASURED["assistant_answer"]), 4) == 0.0203
    assert worst_case_cost_per_call() == cost(MEASURED["plan_reading"])


def test_a_month_at_the_default_cap_stays_under_9_dollars(monkeypatch):
    monkeypatch.delenv("PERMIT_DAILY_MODEL_CALLS", raising=False)
    cap = config.daily_model_calls()
    assert cap == config.DEFAULT_DAILY_MODEL_CALLS > 0
    assert cap * worst_case_cost_per_call() * DAYS < MONTHLY_CEILING_USD


def test_the_default_cap_is_the_largest_that_fits():
    """Rounded down from $9 / (worst case x 31), so the cap is not set lower than the budget needs either."""
    assert config.DEFAULT_DAILY_MODEL_CALLS == math.floor(MONTHLY_CEILING_USD / (worst_case_cost_per_call() * DAYS))
