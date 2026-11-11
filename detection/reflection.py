import re
from typing import Any, Dict, List, Optional, Tuple

# Retained for backwards compatibility; classification is now performed by
# the HTML/script tokenizer below.
URL_ATTR_REGEX = re.compile(
    r"(href|src|action|formaction|data|poster)\s*=\s*[\"'][^\"']*$",
    re.IGNORECASE,
)
ATTR_REGEX = re.compile(r"\w+\s*=\s*[\"'][^\"']*$", re.IGNORECASE)
TAG_REGEX = re.compile(r"<([a-zA-Z0-9]+)([^>]*)")

_URL_ATTRIBUTE_NAMES = frozenset(
    ("href", "src", "action", "formaction", "data", "poster")
)
_SCRIPT_CLOSE_RE = re.compile(r"</script(?=[\s/>]|$)", re.IGNORECASE)
_WHITESPACE = " \t\r\n\f"

# Fallback labels for segments still open when the document ends.
_EOF_LABELS = {
    "DATA": "html",
    "COMMENT": "comment",
    "CDATA": "cdata",
    "DOCTYPE": "doctype",
    "SCRIPT": "javascript",
    "SCRIPT_LINE_COMMENT": "javascript",
    "SCRIPT_BLOCK_COMMENT": "javascript",
    "SCRIPT_DQ": "javascript_string",
    "SCRIPT_SQ": "javascript_string",
    "SCRIPT_TPL": "javascript_string",
}


def _tokenize(html_content: str) -> List[Tuple[int, int, str, Optional[str]]]:
    """Split *html_content* into contiguous ``(start, end, label, tag)`` segments.

    ``label`` describes the lexical position of every character while ``tag``
    is the lowercased name of the nearest tag opened/closed before the segment
    (``None`` when no tag has been seen yet).
    """
    n = len(html_content)
    segments: List[Tuple[int, int, str, Optional[str]]] = []
    seg_start = 0
    i = 0
    last_tag: Optional[str] = None
    state = "DATA"
    current_tag: Optional[str] = None
    pending_attr: Optional[str] = None
    current_attr: Optional[str] = None

    def emit(end: int, label: str) -> None:
        nonlocal seg_start
        if end > seg_start:
            segments.append((seg_start, end, label, last_tag))
        seg_start = end

    def script_close_at(pos: int) -> bool:
        if not html_content.startswith("</script", pos):
            return False
        terminator = pos + len("</script")
        return terminator == n or html_content[terminator] in _WHITESPACE + "/>"

    while i < n:
        if state == "DATA":
            if html_content.startswith("<!--", i):
                emit(i, "html")
                state = "COMMENT"
                i += 4
            elif html_content.startswith("<![CDATA[", i):
                emit(i, "html")
                state = "CDATA"
                i += 9
            elif html_content.startswith("<!", i):
                emit(i, "html")
                state = "DOCTYPE"
                i += 2
            elif html_content.startswith("</", i):
                emit(i, "html")
                state = "CLOSING_TAG"
                i += 2
            elif html_content.startswith("<", i) and i + 1 < n and html_content[i + 1].isalpha():
                emit(i, "html")
                state = "TAG_NAME"
                current_tag = ""
                i += 1
            else:
                i += 1

        elif state == "COMMENT":
            close = html_content.find("-->", i)
            if close == -1:
                emit(n, "comment")
                i = n
            else:
                emit(close + 3, "comment")
                i = close + 3
                state = "DATA"

        elif state == "CDATA":
            close = html_content.find("]]>", i)
            if close == -1:
                emit(n, "cdata")
                i = n
            else:
                emit(close + 3, "cdata")
                i = close + 3
                state = "DATA"

        elif state == "DOCTYPE":
            close = html_content.find(">", i)
            if close == -1:
                emit(n, "doctype")
                i = n
            else:
                emit(close + 1, "doctype")
                i = close + 1
                state = "DATA"

        elif state == "CLOSING_TAG":
            close = html_content.find(">", i)
            end = n if close == -1 else close + 1
            name_match = re.match(
                r"\s*([A-Za-z0-9][A-Za-z0-9:._-]*)", html_content[i:end]
            )
            if name_match:
                last_tag = name_match.group(1).lower()
            emit(end, "markup")
            i = end
            state = "DATA"

        elif state == "TAG_NAME":
            name_start = i
            while i < n and html_content[i] not in _WHITESPACE + "/>":
                i += 1
            current_tag = html_content[name_start:i].lower()
            # The opening tag is itself the nearest tag for reflections that
            # land in its name or its attribute list.
            last_tag = current_tag
            emit(i, "tag_name")
            state = "TAG_INNER"

        elif state == "TAG_INNER":
            ch = html_content[i]
            if ch == ">":
                last_tag = current_tag
                emit(i + 1, "markup")
                i += 1
                if current_tag == "script":
                    state = "SCRIPT"
                else:
                    state = "DATA"
            elif ch == "=":
                i += 1
                emit(i, "markup")
                while i < n and html_content[i] in _WHITESPACE:
                    i += 1
                emit(i, "markup")
                current_attr = pending_attr
                if i < n and html_content[i] == '"':
                    state = "ATTR_VALUE_DQ"
                elif i < n and html_content[i] == "'":
                    state = "ATTR_VALUE_SQ"
                else:
                    state = "ATTR_VALUE_NQ"
            elif ch == "/":
                # Self-closing slash; stay inside the tag.
                i += 1
            elif ch in _WHITESPACE:
                i += 1
            else:
                state = "ATTR_NAME"

        elif state == "ATTR_NAME":
            name_start = i
            while i < n and html_content[i] not in _WHITESPACE + "=/>":
                i += 1
            emit(i, "attribute_name")
            pending_attr = html_content[name_start:i].lower()
            state = "TAG_INNER"

        elif state in ("ATTR_VALUE_DQ", "ATTR_VALUE_SQ", "ATTR_VALUE_NQ"):
            value_label = (
                "url" if current_attr in _URL_ATTRIBUTE_NAMES else "attribute"
            )
            if state == "ATTR_VALUE_DQ":
                close = html_content.find('"', i + 1)
                if close == -1:
                    emit(n, value_label)
                    i = n
                else:
                    emit(close + 1, value_label)
                    i = close + 1
                    state = "TAG_INNER"
            elif state == "ATTR_VALUE_SQ":
                close = html_content.find("'", i + 1)
                if close == -1:
                    emit(n, value_label)
                    i = n
                else:
                    emit(close + 1, value_label)
                    i = close + 1
                    state = "TAG_INNER"
            else:
                end = i
                while end < n and html_content[end] not in _WHITESPACE + ">":
                    end += 1
                emit(end, value_label)
                i = end
                state = "TAG_INNER"

        elif state == "SCRIPT":
            close_match = _SCRIPT_CLOSE_RE.search(html_content, i)
            next_close = close_match.start() if close_match else n
            if i == next_close:
                emit(i, "javascript")
                gt = html_content.find(">", i)
                end = n if gt == -1 else gt + 1
                emit(end, "markup")
                last_tag = "script"
                i = end
                state = "DATA"
            elif html_content.startswith("//", i):
                emit(i, "javascript")
                state = "SCRIPT_LINE_COMMENT"
                i += 2
            elif html_content.startswith("/*", i):
                emit(i, "javascript")
                state = "SCRIPT_BLOCK_COMMENT"
                i += 2
            elif html_content[i] in "\"'`":
                emit(i, "javascript")
                quote = html_content[i]
                state = {
                    '"': "SCRIPT_DQ",
                    "'": "SCRIPT_SQ",
                    "`": "SCRIPT_TPL",
                }[quote]
                i += 1
            else:
                i += 1

        elif state in ("SCRIPT_DQ", "SCRIPT_SQ", "SCRIPT_TPL"):
            quote = {
                "SCRIPT_DQ": '"',
                "SCRIPT_SQ": "'",
                "SCRIPT_TPL": "`",
            }[state]
            j = i
            while j < n:
                if script_close_at(j):
                    break
                if html_content[j] == "\\":
                    j += 2
                    continue
                if html_content[j] == quote:
                    j += 1
                    break
                j += 1
            emit(j, "javascript_string")
            i = j
            state = "SCRIPT"

        elif state == "SCRIPT_LINE_COMMENT":
            j = i
            while j < n and html_content[j] != "\n" and not script_close_at(j):
                j += 1
            emit(j, "javascript")
            i = j
            state = "SCRIPT"

        elif state == "SCRIPT_BLOCK_COMMENT":
            j = i
            while j < n and not html_content.startswith("*/", j) and not script_close_at(j):
                j += 1
            if j < n and html_content.startswith("*/", j):
                j += 2
            emit(j, "javascript")
            i = j
            state = "SCRIPT"

    if seg_start < n:
        segments.append((seg_start, n, _EOF_LABELS.get(state, "markup"), last_tag))

    return segments


def detect_all_reflections(html_content: str, value: str) -> List[Dict[str, Any]]:
    """Locate every reflection of *value* inside *html_content*.

    Returns one dict per occurrence, each containing a lexical ``context``
    label and the nearest preceding tag name in ``tags`` (``None`` when no
    tag precedes the reflection).
    """
    reflections: List[Dict[str, Any]] = []
    if not value or not html_content:
        return reflections

    segments = _tokenize(html_content)
    val_len = len(value)
    search_pos = 0
    seg_idx = 0

    while True:
        pos = html_content.find(value, search_pos)
        if pos == -1:
            break

        while seg_idx < len(segments) and segments[seg_idx][1] <= pos:
            seg_idx += 1

        if seg_idx < len(segments):
            _, _, label, tag = segments[seg_idx]
        else:  # pragma: no cover - segments cover the whole document
            label, tag = "html", None

        # Text before any tag remains "unknown" for backwards compatibility.
        if label == "html" and tag is None:
            context = "unknown"
        else:
            context = label

        reflections.append({"context": context, "tags": tag})
        search_pos = pos + val_len

    return reflections
