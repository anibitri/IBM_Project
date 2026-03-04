"""
prompt_builder.py – Centralised prompt templates for AR labelling.

Keeps prompt logic out of ar_service.py and makes it easy to iterate
on wording without touching detection code.

Prompt design notes (Granite Vision 2B):
- Short, directive prompts outperform verbose ones on small models.
- Few-shot examples anchor output format better than negative rules.
- Avoid "Do NOT" — small models often ignore negations.
- Put the desired output format last so it's freshest in context.
"""

import re
from typing import Optional, List, Dict


# ── Vision model prompt for labelling a single cropped component ──

COMPONENT_LABEL_PROMPT = (
    "This is a cropped element from a technical diagram. "
    "The surrounding area may also be visible.\n\n"
    "What is the name of this component? Follow these steps:\n"
    "1. Read any text printed INSIDE the element (highest priority).\n"
    "2. Read any label or caption placed NEAR or BELOW the element.\n"
    "3. If no text is visible, identify the element type from its shape and colour.\n\n"
    "Examples of good answers:\n"
    "User Corrections\n"
    "read corrections\n"
    "API Gateway\n"
    "Training algorithm\n"
    "External User\n"
    "store prompt\n"
    "validate login\n"
    "LLM interface\n\n"
    "Reply with ONLY the component name (1-4 words). No explanation."
)


# ── Vision model prompt for detecting connections between components ──

CONNECTION_PROMPT_TEMPLATE = (
    "This is a technical architecture diagram. "
    "These labelled components are present at the following positions "
    "(x,y = normalised centre coordinates, 0-1 range):\n\n"
    "{component_list}\n\n"
    "Identify every arrow, line, or connector drawn between these components. "
    "For each connection state the source and destination using the exact "
    "labels above, and the direction of data or control flow.\n\n"
    "Format — one connection per line:\n"
    "SOURCE -> TARGET\n\n"
    "Example output:\n"
    "Client -> API Gateway\n"
    "API Gateway -> Auth Service\n"
    "Auth Service -> Database\n\n"
    "Only list connections that have a visible line or arrow in the diagram. "
    "If no connections are visible, reply: NONE"
)


# ── Vision model prompt for whole-diagram analysis / AR extraction ──

AR_EXTRACTION_PROMPT = (
    "Analyse this technical architecture diagram. "
    "List every distinct component, service, or module shown.\n\n"
    "For each component provide:\n"
    "1. Its name (read the label text)\n"
    "2. Its role (one short phrase, e.g. 'handles authentication')\n\n"
    "Format — one component per line:\n"
    "NAME — ROLE\n\n"
    "Example:\n"
    "API Gateway — routes incoming requests\n"
    "Redis Cache — caches session data\n"
    "PostgreSQL — primary data store\n\n"
    "List components only. Be concise."
)


# ── Post-processing helpers ──

_REFUSAL_MARKERS = [
    'i am unable', 'i cannot', "i'm unable", 'sorry',
    "i don't", 'not possible', 'no text', 'cannot determine',
    'unable to', "i can't", 'not visible', 'cannot identify',
    'no readable', 'no meaningful', 'cannot read', 'not able',
    'there is no', 'does not contain', 'no name',
]

_PREFIX_PATTERNS = [
    r'^the\s+(?:component|element|box|service|block|text|label)\s+(?:name\s+)?(?:is\s+)?(?:called\s+)?(?:reads?\s+)?',
    r'^this\s+(?:is\s+)?(?:a|an|the)\s+',
    r'^it\s+(?:is\s+)?(?:a|an|the)\s+',
    r'^(?:the\s+)?(?:name|text|label)\s+(?:of\s+(?:this|the)\s+(?:component|element)\s+)?(?:is|reads?|says?)\s+',
    r'^(?:component|element)\s+(?:name|label):\s*',
    r'^(?:name|label|text):\s*',
    r'^the\s+(?:text|name|label)\s+(?:here\s+)?(?:reads?|says?|is)\s+',
    r'^(?:it|the\s+box)\s+(?:reads?|says?)\s+',
    r'^(?:answer|response):\s*',
    r'^the\s+(?:image|diagram|picture)\s+shows?\s+',
]


def clean_label(raw: str) -> Optional[str]:
    """Normalise a raw vision-model response into a concise component name.

    Returns ``None`` when the response is empty or a refusal.
    Returns ``"Unknown"`` when the model explicitly says it cannot identify.
    """
    if not raw:
        return None

    label = re.sub(r'\s+', ' ', raw).strip()

    # Strip common model noise tokens
    for noise in [
        '<|end_of_text|>', '<fim_prefix>', '<|system|>',
        '<|user|>', '<|assistant|>',
    ]:
        label = label.replace(noise, '')
    label = label.strip('.-:; ')

    # Reject outright refusals
    lower = label.lower()
    for marker in _REFUSAL_MARKERS:
        if marker in lower:
            return 'Unknown'

    # Extract quoted name if present
    quoted = re.search(r"['\"]([^'\"]{1,40})['\"]", label)
    if quoted:
        label = quoted.group(1).strip()
    else:
        for pat in _PREFIX_PATTERNS:
            label = re.sub(pat, '', label, flags=re.IGNORECASE).strip()

    # Strip trailing filler
    label = re.sub(r'[.;,!?]+$', '', label).strip()
    label = re.sub(r'\s+(?:component|element|block|box|node|module)$', '', label, flags=re.IGNORECASE).strip()
    # Strip leading articles that survived prefix cleaning
    label = re.sub(r'^(?:a|an|the)\s+', '', label, flags=re.IGNORECASE).strip()

    # Enforce 4-word max (increased from 3 to keep compound names like
    # "API Gateway Service" or "Message Queue Broker")
    words = label.split()
    if len(words) > 4:
        label = ' '.join(words[:4])

    # Length cap
    if len(label) > 50:
        label = label[:50].rsplit(' ', 1)[0]

    return label if label else None


def build_connection_prompt(components: List[Dict]) -> str:
    """Build the connection-detection prompt with component positions.

    Each component dict must have at least 'label' (or 'id') and
    'center_x', 'center_y' (normalised 0-1).
    """
    lines = []
    for c in components[:25]:  # cap to avoid prompt overflow
        name = c.get('label') or c.get('id', '?')
        cx = c.get('center_x', 0)
        cy = c.get('center_y', 0)
        lines.append(f"  {name}  (x={cx:.2f}, y={cy:.2f})")

    comp_list_str = "\n".join(lines)
    return CONNECTION_PROMPT_TEMPLATE.format(component_list=comp_list_str)


def make_unique_labels(labels: list[str]) -> list[str]:
    """Given a list of labels, append numeric suffixes to duplicates.

    >>> make_unique_labels(['CPU', 'CPU', 'GPU', 'Unknown', 'Unknown'])
    ['CPU 1', 'CPU 2', 'GPU', 'Unknown', 'Unknown']

    'Unknown' is never deduplicated (it's a placeholder).
    """
    from collections import Counter

    lower_counts = Counter(l.lower() for l in labels if l.lower() not in ('unknown', 'unlabeled'))
    duplicated = {k for k, v in lower_counts.items() if v > 1}

    counters: dict[str, int] = {}
    result: list[str] = []

    for label in labels:
        key = label.lower()
        if key in duplicated:
            counters[key] = counters.get(key, 0) + 1
            result.append(f"{label} {counters[key]}")
        else:
            result.append(label)

    return result
