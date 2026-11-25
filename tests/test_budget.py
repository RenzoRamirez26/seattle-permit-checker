"""The two daily model-call caps fit the Anthropic spend limit.

In:  the token counts measured on 24 November 2026 (docs/launch.md, Budget), the published price, the answer's
     max_tokens, and the API's default PERMIT_DAILY_PLAN_READS and PERMIT_DAILY_ASK_CALLS.
Out: a failure if a month at the default caps would reach $9 (the $10 limit minus $1 of headroom).

When the model, its price, a prompt or a max_tokens changes, measure again and update MEASURED, PRICE and
docs/launch.md together.
"""
from __future__ import annotations

import math

from api import config
from checker import agent

MONTHLY_CEILING_USD = 9.0
DAYS = 31
PER_DAY = MONTHLY_CEILING_USD / DAYS

# Claude Sonnet 5.5, USD per token: https://platform.claude.com/docs/en/about-claude/pricing (read 24 November 2026).
PRICE = {"claude-sonnet-5-5": {"input": 2 / 1_000_000, "output": 10 / 1_000_000}}

# usage.input_tokens and usage.output_tokens from one real call of each, 24 November 2026 (no cache reads or writes).
# The answer was measured with thinking off, the 120-word prompt and max_tokens 1,000; it ended on its own (end_turn).
MEASURED = {
    "plan_reading": {"model": "claude-sonnet-5-5", "input_tokens": 4971, "output_tokens": 1685},
    "assistant_answer": {"model": "claude-sonnet-5-5", "input_tokens": 7695, "output_tokens": 210},
}


def cost(call: dict) -> float:
    p = PRICE[call["model"]]
    return call["input_tokens"] * p["input"] + call["output_tokens"] * p["output"]


PLAN_READ = cost(MEASURED["plan_reading"])
# An answer priced as if it used every token it is allowed: the measured input plus max_tokens of output.
ANSWER_WORST = cost(MEASURED["assistant_answer"] | {"output_tokens": agent.MAX_TOKENS})


def month(plan_reads: int, asks: int) -> float:
    return (plan_reads * PLAN_READ + asks * ANSWER_WORST) * DAYS


def test_the_recorded_costs_match_the_launch_doc():
    assert agent.MAX_TOKENS == 1000
    assert round(PLAN_READ, 4) == 0.0268
    assert round(cost(MEASURED["assistant_answer"]), 4) == 0.0175
    assert round(ANSWER_WORST, 4) == 0.0254


def test_the_plan_reading_is_still_the_dearest_call():
    """An answer at its full max_tokens costs less than a plan reading, so one combined cap would have stayed 10."""
    assert ANSWER_WORST < PLAN_READ
    assert math.floor(PER_DAY / PLAN_READ) == 10


def test_a_month_at_the_default_caps_stays_under_9_dollars(monkeypatch):
    monkeypatch.delenv("PERMIT_DAILY_PLAN_READS", raising=False)
    monkeypatch.delenv("PERMIT_DAILY_ASK_CALLS", raising=False)
    reads, asks = config.daily_plan_reads(), config.daily_ask_calls()
    assert (reads, asks) == (config.DEFAULT_DAILY_PLAN_READS, config.DEFAULT_DAILY_ASK_CALLS) and reads > 0 and asks > 0
    assert month(reads, asks) < MONTHLY_CEILING_USD
    assert round(month(reads, asks), 2) == 8.92


def test_one_more_of_either_would_not_fit():
    """The split is not set lower than the budget needs: one more plan read or one more answer reaches $9."""
    reads, asks = config.DEFAULT_DAILY_PLAN_READS, config.DEFAULT_DAILY_ASK_CALLS
    assert month(reads + 1, asks) >= MONTHLY_CEILING_USD
    assert month(reads, asks + 1) >= MONTHLY_CEILING_USD
