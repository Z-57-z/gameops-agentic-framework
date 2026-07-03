"""Deterministic lexical retrieval for curated GameOps knowledge."""

from __future__ import annotations

import re
from collections import Counter

from omnigent.gameops.knowledge_store import KnowledgeStore
from omnigent.gameops.schemas import RetrievalResult

_STOP_WORDS = {
    "a",
    "an",
    "and",
    "are",
    "can",
    "do",
    "does",
    "for",
    "from",
    "how",
    "is",
    "of",
    "or",
    "should",
    "the",
    "to",
    "we",
    "what",
    "when",
    "with",
}


class LexicalRetriever:
    """Simple deterministic retriever for small bundled knowledge bases."""

    def __init__(self, store: KnowledgeStore) -> None:
        self._store = store

    def search(self, query: str, *, limit: int = 4) -> list[RetrievalResult]:
        """Return top matching chunks, filtering zero-score results."""
        query_terms = _tokens(_expand_query(query))
        if not query_terms:
            return []
        results: list[RetrievalResult] = []
        for chunk in self._store.chunks():
            text_terms = Counter(_tokens(f"{chunk.title} {chunk.section} {chunk.text}"))
            matched = sorted(term for term in query_terms if term in text_terms)
            if not matched:
                continue
            score = float(sum(text_terms[term] for term in matched))
            if any(term in _tokens(chunk.title) for term in query_terms):
                score += 2.0
            if any(term in _tokens(chunk.section) for term in query_terms):
                score += 3.0
            results.append(RetrievalResult(chunk=chunk, score=score, matched_terms=matched))
        results.sort(key=lambda result: (-result.score, result.chunk.source_id, result.chunk.chunk_id))
        return results[:limit]


def _tokens(text: str) -> set[str]:
    raw = re.findall(r"[a-z0-9]+", text.lower())
    normalized = {_normalize_token(token) for token in raw if len(token) > 2}
    return {token for token in normalized if token and token not in _STOP_WORDS}


def _expand_query(text: str) -> str:
    """Append English aliases for common Chinese GameOps terms."""
    aliases: list[str] = []
    lower = text.lower()
    phrase_aliases = {
        "充值返利": "recharge rebate reward missed reward event rebate policy",
        "返利": "rebate reward event rebate policy",
        "错过": "missed delivery failure support promise",
        "奖励": "reward reward table delivery",
        "客服": "support player ticket support faq",
        "补偿": "compensation premium currency approval incident",
        "高级货币": "premium currency compensation approval",
        "宝石": "gems premium currency compensation approval",
        "全服": "all players compensation public announcement",
        "登录故障": "login outage login issue incident runbook",
        "事故": "incident runbook severity outage",
        "活动": "campaign event launch announcement checklist reward table",
        "上线": "launch checklist campaign readiness",
        "回滚": "rollback plan campaign checklist",
        "工单": "ticket support ticket player ticket triage",
        "支付": "payment order receipt refund ticket",
        "退款": "refund payment critical",
        "封禁": "ban account action ticket",
    }
    for phrase, alias in phrase_aliases.items():
        if phrase in lower:
            aliases.append(alias)
    if aliases:
        return f"{text} {' '.join(aliases)}"
    return text


def _normalize_token(token: str) -> str:
    if token.endswith("ies") and len(token) > 4:
        return f"{token[:-3]}y"
    if token.endswith("ing") and len(token) > 5:
        return token[:-3]
    if token.endswith("ed") and len(token) > 4:
        return token[:-2]
    if token.endswith("s") and len(token) > 4:
        return token[:-1]
    return token
