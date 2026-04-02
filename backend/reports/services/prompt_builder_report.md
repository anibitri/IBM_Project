# Prompt Builder Report (`prompt_builder.py`)

## Overview

`prompt_builder.py` centralizes every prompt template and label post-processing utility used across the AR and AI pipelines. Keeping all prompts here means wording changes and tuning happen in one place without touching service logic.

The module serves three consumers:
- **`granite_vision_service`** — vision model prompts for diagram analysis, component extraction, and diagram classification.
- **`granite_ai_service`** — text model prompts for analysis, chat, summarization, and insight generation.
- **`ar_service`** — component labeling prompts.

---

## Prompt Templates

### `AR_EXTRACTION_PROMPT`

The primary prompt used when `analyze_images` is called in `ar_extraction` mode. This prompt has two key jobs:

1. **Diagram type classification** — the model is instructed to write one of five possible `DIAGRAM_TYPE:` lines. Each possible value is shown on its own line as a concrete example rather than a pipe-separated list:

```
Example outputs (pick the one that matches):
DIAGRAM_TYPE: sequence
DIAGRAM_TYPE: uml
DIAGRAM_TYPE: flowchart
DIAGRAM_TYPE: architecture
DIAGRAM_TYPE: other
```

This format change prevents the model from copying the format line literally (with `|` separators) as its answer, which was a failure mode with the previous format. The `_extract_diagram_type` function in `granite_vision_service.py` has a corresponding guard that skips any `DIAGRAM_TYPE:` value containing `|`.

2. **Component listing** — the model lists every component in `NAME — ROLE` format (one per line), enabling reliable structured extraction.

**Full example output shown to the model:**
```
DIAGRAM_TYPE: architecture
API Gateway — routes incoming requests
Redis Cache — caches session data
PostgreSQL — primary data store
```

### `COMPONENT_LABEL_PROMPT`

Used by `ar_service._try_vision_label` to label individual cropped components. It instructs the model to read text inside the element first (highest priority), then nearby captions, then infer from shape. Provides one-phrase output examples. Returns 1–4 words only.

### `CONNECTION_PROMPT_TEMPLATE`

Used to detect connections between components. Takes a list of component labels and their normalized (x, y) center coordinates and asks the model to identify arrows connecting them. Outputs one `SOURCE -> TARGET` line per connection. Built by `build_connection_prompt(components)`.

Note: connection detection is currently disabled in `ar_service.py` — this template is retained for forward compatibility.

### `GENERAL_IMAGE_ANALYSIS_PROMPT`

Simple fallback for non-AR analysis tasks: describes the image in detail and lists all visible technical components. Used when task is not `ar_extraction`.

### `DIAGRAM_CLASSIFICATION_PROMPT`

Used in the PDF pipeline to decide whether an extracted image is a diagram worth processing. The prompt has been significantly expanded to reduce false positives and false negatives:

- **YES criteria**: structured technical diagrams with components connected by lines/arrows/boxes/symbols — specifically: UML class/sequence/activity/state diagrams, architecture diagrams, flowcharts, network topologies, circuit schematics, block diagrams.
- **NO criteria**: photos, people, devices, logos, UI screenshots, tables, calendars, timetables, Gantt charts, plain text pages, paragraph-heavy pages, decorative icons, isolated illustrations without clear component relationships.
- **Uncertain default**: `"If uncertain, answer NO."` — reduces noisy pages reaching the full pipeline.
- **Output format**: `"Return exactly one word: yes or no."` — replaces the previous `"Answer with ONLY 'yes' or 'no'."` for more explicit output control.

### System Prompts

```python
AI_ANALYZE_SYSTEM_PROMPT  = "You are an expert technical analyst."
AI_CHAT_SYSTEM_PROMPT     = "You are a helpful technical assistant answering questions about a document."
AI_INSIGHTS_SYSTEM_PROMPT = "You are a senior technical analyst."
```

These constants are **exported** from `prompt_builder.py` and injected directly at the `<|system|>` level in `granite_ai_service._generate_text`. They are no longer embedded inside the individual prompt-builder functions.

---

## Prompt Builder Functions

### `build_vision_chat_text(user_prompt: str) -> str`

Wraps a vision prompt in Granite's required chat image format:
```
<|user|>
<image>
{user_prompt}
<|assistant|>
```

### `build_vision_qa_prompt(question: str) -> str`

Builds a focused visual Q&A prompt for `query_image`. Frames the question as a direct, concise answer task to prevent the model from describing the whole diagram.

### `build_analyze_context_prompt(context_str, task) -> str`

Builds the user prompt for `ai_service.analyze_context`. Contains only:
- Document context.
- Task instruction.
- "Provide a clear, structured analysis based ONLY on the context above."

The system prompt (`AI_ANALYZE_SYSTEM_PROMPT`) is passed separately via `_generate_text(system_prompt=...)`, not embedded here. This separation ensures the system prompt is placed at the `<|system|>` position of the Granite chat format rather than prepended to the user turn.

### `build_chat_with_document_prompt(context_str, query, history_str='') -> str`

Builds the user prompt for document Q&A. Contains:
- Full document context.
- Optional conversation history (previous turns).
- The user's question.
- Anti-hallucination instruction: "Do not make up information. If the context doesn't cover the topic, say so."

System prompt (`AI_CHAT_SYSTEM_PROMPT`) is passed separately.

### `build_component_summary_prompt(document_type, component_list, relationship_str='') -> str`

Used by `ai_service.summarize_components`. Lists the detected components and optionally includes relationship data.

### `build_generate_insights_prompt(context_str, task) -> str`

Used by `ai_service.generate_insights`. Instructs the model to produce 3–5 specific, actionable insights from the technical data. System prompt (`AI_INSIGHTS_SYSTEM_PROMPT`) is passed separately.

### `get_context_analysis_task(context_type: str) -> str`

Returns the task-specific analysis instruction for a given domain:
- `software` — system design and component interactions.
- `electronics` — circuit function and component analysis.
- `mechanical` — design and part functions.
- `network` — architecture and data flow.
- `general` — fallback comprehensive analysis.

### `get_insight_task(insight_type: str) -> str`

Returns the task instruction for a specific insight type:
- `architecture` — key design patterns and architectural decisions.
- `complexity` — most complex parts and potential challenges.
- `optimization` — performance and efficiency improvement opportunities.
- `relationships` — how components interact and depend on each other.
- `general` — fallback key technical insights.

---

## Post-Processing Utilities

### `clean_label(raw: str) -> Optional[str]`

Normalizes a raw vision model response into a concise 1–4 word component name. Processing steps:
1. Collapse whitespace.
2. Strip noise tokens (`<|end_of_text|>`, chat role tokens, etc.).
3. Strip trailing punctuation and structural words.
4. Check against `_REFUSAL_MARKERS` — if the model said it can't identify the component, return `"Unknown"`.
5. Extract quoted names if present.
6. Strip common prefix patterns using `_PREFIX_PATTERNS`.
7. Remove trailing filler words (component, element, block, box, node, module).
8. Strip leading articles.
9. Enforce 4-word maximum.
10. Enforce 50-character length cap.

Returns `None` for empty input and `"Unknown"` for explicit refusals.

### `build_connection_prompt(components: List[Dict]) -> str`

Formats the `CONNECTION_PROMPT_TEMPLATE` with component labels and normalized center coordinates. Caps at 25 components to avoid prompt overflow.

### `make_unique_labels(labels: list[str]) -> list[str]`

Appends numeric suffixes to duplicate labels:
```
["CPU", "CPU", "GPU"] → ["CPU 1", "CPU 2", "GPU"]
```
`"Unknown"` is never deduplicated — it's a placeholder and there's no semantic value in distinguishing `Unknown 1` from `Unknown 2`.

---

## Design Principles

The module comment summarizes the prompt design rules that produced good results with Granite Vision 2B:
- Short, directive prompts outperform verbose ones.
- Few-shot output examples anchor format better than rule-based descriptions.
- Avoid "Do NOT" — small models frequently ignore negations.
- Put the desired output format last so it's freshest in context.
- Separate system prompts from user content — inject at `<|system|>` level, not inside the user turn.

---

## Dependencies

- Standard library: `re`, `typing`
