# Prompt Builder Report (`prompt_builder.py`)

## Overview

`prompt_builder.py` centralizes every prompt template and label post-processing utility used across the AR and AI pipelines. Keeping all prompts here means wording changes and tuning happen in one place without touching service logic.

The module serves three consumers:
- **`granite_vision_service`** — vision model prompts for diagram analysis, component extraction, and diagram classification.
- **`granite_ai_service`** — text model prompts for analysis, chat, summarization, and insight generation.
- **`ar_service`** (ARv1) — component labeling and connection detection prompts with coordinate injection.

---

## Prompt Templates

### `AR_EXTRACTION_PROMPT`

The primary prompt used when `analyze_images` is called in `ar_extraction` mode. This prompt has two key jobs:

1. **Diagram type classification** — the model is instructed to output exactly one of: `sequence`, `uml`, `flowchart`, `architecture`, `other` on a line beginning with `DIAGRAM_TYPE:`. This line is parsed by `_extract_diagram_type` in `granite_vision_service.py` and forwarded to the AR service as its first hint.

2. **Component listing** — the model lists every component in `NAME — ROLE` format (one per line), enabling reliable structured extraction without free-form parsing.

Example expected output:
```
DIAGRAM_TYPE: architecture
API Gateway — routes incoming requests
Redis Cache — caches session data
PostgreSQL — primary data store
```

**Why this format works well on small models:**
- Short, directive instructions outperform verbose prompts on 2B-parameter models.
- Few-shot examples anchor format better than rule-based constraints.
- Negative instructions ("Do NOT include…") are often ignored by small models; this prompt avoids them entirely.
- Putting the desired format last keeps it freshest in the model's context window.

### `COMPONENT_LABEL_PROMPT`

Used by `ar_service` (ARv1) to label individual cropped components. It instructs the model to read text inside the element first (highest priority), then nearby captions, then infer from shape. Provides 8 one-phrase examples to anchor the output format. Returns 1–4 words only.

### `CONNECTION_PROMPT_TEMPLATE`

Used to detect connections between components. Takes a list of component labels and their normalized (x, y) center coordinates and asks the model to identify arrows connecting them. Outputs one `SOURCE -> TARGET` line per connection. Built by `build_connection_prompt(components)`.

### `GENERAL_IMAGE_ANALYSIS_PROMPT`

Simple fallback for non-AR analysis tasks: `"Describe the image in detail and list all visible technical components."` Used when task is not `ar_extraction`.

### `DIAGRAM_CLASSIFICATION_PROMPT`

Used in the PDF pipeline to decide whether a page is a diagram worth processing. Returns only `"yes"` or `"no"`. Explicitly lists non-diagram types (photos, gantt charts, UI mocks, schedules) to reduce false positives.

### System Prompts

```python
AI_ANALYZE_SYSTEM_PROMPT = "You are an expert technical analyst."
AI_CHAT_SYSTEM_PROMPT    = "You are a helpful technical assistant answering questions about a document."
AI_INSIGHTS_SYSTEM_PROMPT = "You are a senior technical analyst."
```

These are prepended to AI service prompts to frame the model's role.

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
The `<image>` token signals where `pixel_values` should be integrated during forward pass. Without this exact format, the vision model receives the prompt as text-only and ignores the image.

### `build_vision_qa_prompt(question: str) -> str`

Builds a focused visual Q&A prompt: "Look at this technical diagram carefully. Question: {question}. Give a direct, concise answer based on what you see in the image." Avoids general analysis framing so the model gives a specific answer to the question rather than describing the whole diagram.

### `build_analyze_context_prompt(context_str, task) -> str`

Builds the full prompt for `ai_service.analyze_context`. Prepends the system prompt, then document context, then the task instruction. Ends with `"Provide a clear, structured analysis based ONLY on the context above:"` to prevent hallucination beyond the provided context.

### `build_chat_with_document_prompt(context_str, query, history_str='') -> str`

Builds the chat prompt for document Q&A. Includes:
- System prompt framing the model as a document assistant.
- Full document context.
- Optional conversation history (previous turns).
- The user's question.
- Explicit instruction: "Do not make up information. If the context doesn't cover the topic, say so." — this significantly reduces hallucinated answers for questions the document doesn't address.

### `build_component_summary_prompt(document_type, component_list, relationship_str='') -> str`

Used by `ai_service.summarize_components`. Tells the model what type of diagram it's analyzing, lists the detected components, and optionally includes relationship/connection data. Returns a brief technical summary explaining what the diagram shows.

### `build_generate_insights_prompt(context_str, task) -> str`

Used by `ai_service.generate_insights`. Instructs the model to produce 3–5 specific, actionable insights from the technical data. The `task` parameter specializes the insight type (architecture, complexity, optimization, relationships, or general).

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
5. Extract quoted names if present (e.g., `The component is called "API Gateway"` → `API Gateway`).
6. Strip common prefix patterns (e.g., "The component name is…", "This is a…", "Label: …") using `_PREFIX_PATTERNS`.
7. Remove trailing filler words (component, element, block, box, node, module).
8. Strip leading articles that survived prefix cleaning.
9. Enforce 4-word maximum.
10. Enforce 50-character length cap.

Returns `None` for empty input and `"Unknown"` for explicit refusals.

### `build_connection_prompt(components: List[Dict]) -> str`

Formats the `CONNECTION_PROMPT_TEMPLATE` with the list of detected component labels and their normalized center coordinates. Caps at 25 components to avoid prompt overflow. Used to ask the vision model to identify arrows between already-detected components.

### `make_unique_labels(labels: list[str]) -> list[str]`

Ensures no two components share the same label by appending numeric suffixes to duplicates:
```
["CPU", "CPU", "GPU", "Unknown", "Unknown"] → ["CPU 1", "CPU 2", "GPU", "Unknown", "Unknown"]
```
`"Unknown"` is deliberately never deduplicated — it's a placeholder label and there's no semantic value in distinguishing `Unknown 1` from `Unknown 2`.

---

## Design Principles

The module comment summarizes the prompt design rules that produced good results with Granite Vision 2B:
- Short, directive prompts outperform verbose ones.
- Few-shot output examples anchor format better than rule-based descriptions.
- Avoid "Do NOT" — small models frequently ignore negations.
- Put the desired output format last so it's freshest in context.

These rules were arrived at through iterative testing and directly influence why `AR_EXTRACTION_PROMPT` uses examples rather than a detailed rule list.

---

## Dependencies

- Standard library: `re`, `typing`
