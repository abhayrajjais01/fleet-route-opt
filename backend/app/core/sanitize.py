"""
sanitize.py - Input sanitization for every user-facing text field (Week 14 · Track B: Abhayraj Jaiswal)

User text reaches three places where it can do harm: the dashboard (rendered as HTML), the audit trail and exports
(read by auditors and spreadsheets), and the copilot (sent to agents and, optionally, to an LLM). Each field is cleaned
once, at the schema boundary, so the services behind it only ever see clean text:

  - Unicode is NFKC-normalised, so look-alike full-width / compatibility characters collapse to their plain form
  - control characters are removed (newlines and tabs survive only in multi-line fields such as chat and notes)
  - zero-width and bidirectional-override characters are removed: they hide or reorder text ("Trojan Source")
  - HTML / XML tags are stripped from names, addresses and notes; the frontend escapes output as well
  - runs of whitespace collapse, and the result is trimmed
  - a value that starts with = + - @ in an export cell is neutralised by `csv_safe` (spreadsheet formula injection)

Length limits stay with each field (Pydantic `max_length`), and are checked after cleaning.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Annotated, Any, Optional

from pydantic import BeforeValidator

# Zero-width characters, bidi embeddings / overrides / isolates, BOM, soft hyphen, word joiner and friends.
_INVISIBLE = re.compile("[­؜᠎​-‏‪-‮⁠-⁤⁦-⁩﻿]")
# A tag must start with a letter, "/" or "!" right after "<", so "delay <30 min" or "a < b > c" are left alone.
_TAG = re.compile(r"<\s*(?:/\s*)?[a-zA-Z!][^<>]*>")
_SCRIPT_BLOCK = re.compile(r"<\s*(script|style)\b[^>]*>.*?<\s*/\s*\1\s*>", re.IGNORECASE | re.DOTALL)
_SPACES = re.compile(r"[ \t\f\v]+")
_BLANK_LINES = re.compile(r"\n{3,}")
_FORMULA_PREFIX = ("=", "+", "-", "@", "\t", "\r")


def _drop_controls(text: str, keep_newlines: bool) -> str:
    keep = {"\n", "\t"} if keep_newlines else set()
    return "".join(ch for ch in text if ch in keep or unicodedata.category(ch) != "Cc")


def clean_text(value: Any, *, multiline: bool = False, strip_tags: bool = True) -> Any:
    """Cleans one text value. Non-strings pass through unchanged so Pydantic can report the type error."""
    if not isinstance(value, str):
        return value
    text = unicodedata.normalize("NFKC", value)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = _INVISIBLE.sub("", text)
    text = _drop_controls(text, keep_newlines=multiline)
    if strip_tags:
        text = _SCRIPT_BLOCK.sub("", text)
        text = _TAG.sub("", text)
    if multiline:
        text = "\n".join(_SPACES.sub(" ", line).strip() for line in text.split("\n"))
        text = _BLANK_LINES.sub("\n\n", text)
    else:
        text = _SPACES.sub(" ", text.replace("\n", " "))
    return text.strip()


def clean_line(value: Any) -> Any:
    return clean_text(value)


def clean_multiline(value: Any) -> Any:
    return clean_text(value, multiline=True)


def clean_chat(value: Any) -> Any:
    """Chat and search: keep line breaks and angle brackets the dispatcher typed, drop real markup and invisibles."""
    return clean_text(value, multiline=True)


# Annotated types used by the schemas: `name: CleanStr = Field(..., max_length=255)`.
CleanStr = Annotated[str, BeforeValidator(clean_line)]
CleanText = Annotated[str, BeforeValidator(clean_multiline)]
ChatText = Annotated[str, BeforeValidator(clean_chat)]


def like_pattern(term: str) -> str:
    """A safe SQL LIKE pattern for a free-text search: wildcards typed by the user match literally (escape '\\')."""
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def csv_safe(value: Optional[Any]) -> Any:
    """Prefixes a cell that a spreadsheet would run as a formula (=, +, -, @) with an apostrophe."""
    if isinstance(value, str) and value and value[0] in _FORMULA_PREFIX and not _is_number(value):
        return "'" + value
    return value


def _is_number(value: str) -> bool:
    try:
        float(value)
        return True
    except ValueError:
        return False
