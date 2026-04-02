# Granite AI Service Report (`granite_ai_service.py`)

## Overview

`AIService` provides text-generation reasoning over document context. It wraps the IBM Granite Vision 3.3-2B model's text generation capability (no image input needed for these tasks) and exposes four high-level interfaces: context analysis, document Q&A, component summarization, and insight generation.

All four interfaces share the same `_generate_text` backend, the same `_clean_response` output sanitizer, and the same context assembly pipeline.

Singleton instance:
```python
ai_service = AIService()
```

---

## Architecture Note

The AI service uses `manager.vision_model` for text generation — **there is no separate language model**. The Granite Vision model is a multimodal model that also handles text-only generation without passing any `pixel_values`. This means:
- Text responses use the same 2B parameter model as image analysis.
- No additional VRAM is consumed for the chat capability.
- Context window and generation quality reflect the base vision model's text capabilities.

---

## Public APIs

### `analyze_context(text_excerpt, vision, components, connections, context_type, image_path) -> Dict`

Assembles full document context from all available sources (text excerpt, vision summary, component list, connection graph) and asks the model to analyze it. The `context_type` parameter selects a specialized task instruction (software architecture, electronics, mechanical, network, or general). Returns `{"analysis": str, "status": "success" | "error"}`.

### `chat_with_document(query, context, chat_history=None) -> Dict`

Answers a user question grounded in the document context. Optionally injects a live visual answer from `query_image` if the question seems visual in nature. Returns `{"answer": str, "status": "success" | "error"}`.

### `summarize_components(components, relationships=None, document_type='general') -> Dict`

Generates a plain-language summary of detected AR components and their relationships. The `document_type` (from the vision model's diagram classification) shapes the language. Returns `{"summary": str, "status": "success" | "error"}`.

### `generate_insights(vision_analysis, ar_components, text_content, insight_type='general') -> Dict`

Assembles all available context and asks the model for 3–5 specific, actionable insights. `insight_type` choices: `architecture`, `complexity`, `optimization`, `relationships`, `general`. Returns `{"insights": str, "status": "success" | "error"}`.

---

## Core Internal Methods

### `_generate_text(prompt, max_tokens, temperature, top_p, system_prompt=None) -> str`

All four public APIs ultimately call `_generate_text`. It:

1. Checks mock mode — if `GRANITE_MOCK=1`, returns a keyword-matched IBM OTel canned response.
2. Checks model availability — returns an error string if the vision model is not loaded.
3. Builds the chat string manually (rather than using `apply_chat_template`):
   - With system prompt: `"<|system|>\n{system_prompt}\n<|user|>\n{prompt}\n<|assistant|>\n"`
   - Without system prompt: `"<|user|>\n{prompt}\n<|assistant|>\n"`
   - Note: `apply_chat_template` requires typed content dicts for this model and does not work reliably for text-only generation — manual construction avoids this incompatibility.
4. Runs `manager.vision_model.generate` with:
   - `do_sample=True` (sampling enabled for chat).
   - `temperature=0.7`, `top_p=0.9` for coherent but varied responses.
   - `repetition_penalty=1.1` to prevent looping.
5. **Frees input tensors immediately** (`del inputs`, `gc.collect()`, `torch.cuda.empty_cache()`) before decoding — this returns intermediate buffers to the allocator before the decode step, reducing peak VRAM.
6. Slices `output_ids` to decode only new tokens.
7. **Frees output tensors** (`del output_ids`, `gc.collect()`, `torch.cuda.empty_cache()`) after decoding.
8. Passes through `_clean_response`.

### System Prompt Usage

Each public method passes its appropriate system prompt to `_generate_text`:

| Method                   | System Prompt              |
|--------------------------|----------------------------|
| `analyze_context`        | `AI_ANALYZE_SYSTEM_PROMPT` |
| `chat_with_document`     | `AI_CHAT_SYSTEM_PROMPT`    |
| `summarize_components`   | (none — uses default user turn only) |
| `generate_insights`      | `AI_INSIGHTS_SYSTEM_PROMPT` |

The system prompt is injected at the `<|system|>` position of the chat format string, separate from the user prompt. This mirrors the separation in `prompt_builder.py`, which no longer embeds system prompts inside individual prompt-builder functions.

### `_clean_response(text) -> str`

Multi-stage output sanitizer:

1. **Prefix stripping** — removes common prefixes (`"Answer:"`, `"Summary:"`, `"Analysis:"`, `"AI:"`, etc.).
2. **Prompt leak detection** — if a system prompt fragment appears in the first 60 characters of the output, finds the actual answer start and strips the leaked context.
3. **Newline normalization** — collapses runs of 3+ newlines to 2.
4. **Dialogue truncation** — if the model continues as if writing a multi-turn dialogue (patterns like `"\nUser:"`, `"\nLet me know"`, `"\n---"`), truncates at that point.
5. **Sentence boundary cleanup** — if the output ends without sentence-final punctuation, backtracks to the last complete sentence.

### `_select_relevant_chunks(full_text, query, max_chars, chunk_size) -> str`

Used when the document text is too long to fit in the context window. Rather than naively truncating from the end, this method:

1. Splits `full_text` into overlapping chunks (20 % overlap, default 600 chars per chunk).
2. Scores each chunk by the fraction of query keywords it contains.
3. Gives the first chunk a +0.15 bonus score (document introductions tend to be highly informative).
4. Selects the top-scoring chunks up to `max_chars`, re-ordered by document position.
5. Joins selected chunks with `"...\n"` separators.

### `_build_context_string(text_excerpt, vision, components, connections, ai_summary, query) -> str`

Assembles all available information sources into a single context string:
- **Text excerpt** — Docling-extracted text, run through `_select_relevant_chunks` if query is provided.
- **Vision summary** — the Granite Vision model's diagram description.
- **AI summary** — pre-generated summary from a prior analysis run.
- **Components** — AR-detected component list with positions and labels.
- **Connections** — inferred connection graph edges.

Total context is capped at `self.max_context_length` (3072 characters).

---

## Mock Mode

When `GRANITE_MOCK=1` is set, `_generate_text` routes through `_mock_chat_response(query)` instead of the model. The mock responses are IBM OTel-specific canned strings selected by keyword matching on the query.

---

## VRAM Management

Explicit tensor management in `_generate_text` helps prevent VRAM fragmentation across sequential inference calls:

1. Input tensors are deleted immediately after the forward pass (before decode).
2. Output token tensors are deleted after decoding.
3. `gc.collect()` and `torch.cuda.empty_cache()` are called after each deletion.

These steps return intermediate memory to the allocator so the next call starts with a cleaner allocation state. The adaptive cleanup methods (`maybe_cleanup_before/after_inference`) in `model_manager` provide a complementary layer at the route level.

---

## Risks and Notes

- **Context quality is the primary driver of output quality.** If AR component labels are wrong or vision summaries are vague, the chat and analysis responses will reflect that.
- **3072-character context cap** means very long documents lose some detail.
- **Temperature 0.7** produces varied responses on repeated calls with the same input. Pass `temperature=0` for deterministic output.
- **Text-only generation quality** is limited by the 2B parameter count.

---

## Dependencies

- `torch`, `logging`
- `app.services.model_manager.manager` (Granite Vision model)
- `app.services.granite_vision_service.query_image` (visual Q&A for chat context injection)
- `app.services.prompt_builder` (all prompt construction functions and system prompts)
