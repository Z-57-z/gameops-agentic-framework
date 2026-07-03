"""Bundled Markdown knowledge loading for GameOps workflows."""

from __future__ import annotations

import re
from dataclasses import dataclass
from importlib import resources
from pathlib import Path

from omnigent.gameops.schemas import KnowledgeChunk

_DATA_PATH = "omnigent/gameops/data"
_SOURCE_TITLES = {
    "event_rebate_policy": "充值返利政策",
    "compensation_policy": "补偿政策",
    "support_faq": "客服 FAQ",
    "incident_runbook": "事故手册",
    "campaign_checklist": "活动检查清单",
}

_SECTION_TITLES = {
    "Overview": "概览",
    "Missed recharge rebate": "错过充值返利",
    "Eligibility checks": "资格核验",
    "Manual grant guardrails": "人工补发约束",
    "Standard compensation limits": "标准补偿限制",
    "Incident compensation": "事故补偿",
    "Player communication": "玩家沟通",
    "Missing rewards": "奖励未到账",
    "Account access": "账号访问",
    "Launch readiness": "上线准备",
    "Announcement review": "公告复核",
    "Rollback plan": "回滚方案",
    "Severity levels": "事故等级",
    "Communication cadence": "通信节奏",
    "Escalation path": "升级路径",
}


@dataclass(frozen=True)
class KnowledgeStore:
    """In-memory collection of curated GameOps knowledge chunks."""

    _chunks: tuple[KnowledgeChunk, ...]

    def chunks(self) -> list[KnowledgeChunk]:
        """Return a copy of loaded chunks."""
        return list(self._chunks)


def load_default_knowledge_base() -> KnowledgeStore:
    """Load the repository-bundled GameOps knowledge base."""
    data_root = resources.files("omnigent.gameops").joinpath("data")
    chunks: list[KnowledgeChunk] = []
    for entry in sorted(data_root.iterdir(), key=lambda item: item.name):
        if not entry.name.endswith(".md"):
            continue
        source_id = Path(entry.name).stem
        text = entry.read_text(encoding="utf-8")
        chunks.extend(_split_markdown(source_id, text))
    return KnowledgeStore(tuple(chunks))


def _split_markdown(source_id: str, text: str) -> list[KnowledgeChunk]:
    lines = text.splitlines()
    title = _SOURCE_TITLES.get(source_id, source_id.replace("_", " ").title())
    document_title = title
    chunks: list[KnowledgeChunk] = []
    current_section = "Overview"
    current_start = 1
    current_lines: list[str] = []

    for index, line in enumerate(lines, start=1):
        if line.startswith("# "):
            document_title = line[2:].strip() or title
            continue
        if line.startswith("## "):
            if current_lines:
                chunks.append(
                    _build_chunk(
                        source_id,
                        document_title,
                        current_section,
                        current_start,
                        index - 1,
                        current_lines,
                    )
                )
            current_section = line[3:].strip() or "Untitled"
            current_start = index
            current_lines = [line]
            continue
        if current_lines or line.strip():
            if not current_lines:
                current_start = index
            current_lines.append(line)

    if current_lines:
        chunks.append(
            _build_chunk(
                source_id,
                document_title,
                current_section,
                current_start,
                len(lines),
                current_lines,
            )
        )
    return chunks


def _build_chunk(
    source_id: str,
    title: str,
    section: str,
    line_start: int,
    line_end: int,
    lines: list[str],
) -> KnowledgeChunk:
    slug = re.sub(r"[^a-z0-9]+", "-", section.lower()).strip("-") or "overview"
    return KnowledgeChunk(
        source_id=source_id,
        title=_SOURCE_TITLES.get(source_id, title),
        section=_SECTION_TITLES.get(section, section),
        path=f"{_DATA_PATH}/{source_id}.md",
        chunk_id=f"{source_id}#{slug}",
        text="\n".join(lines).strip(),
        line_start=line_start,
        line_end=line_end,
    )
