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

The AI service uses `manager.vision_model` for text generation — **there is no separate language model**. The Granite Vision model is a multimodal model that also handles text-only generation through `apply_chat_template` without passing any `pixel_values`. This means:
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

Generates a plain-language summary of detected AR components and their relationships. The `document_type` (from the vision model's diagram classification) shapes the language: a sequence diagram gets "interactions between actors" framing, while an architecture diagram gets "services and data flow" framing. Returns `{"summary": str, "status": "success" | "error"}`.

### `generate_insights(vision_analysis, ar_components, text_content, insight_type='general') -> Dict`

Assembles all available context and asks the model for 3–5 specific, actionable insights. `insight_type` choices: `architecture`, `complexity`, `optimization`, `relationships`, `general`. Returns `{"insights": str, "status": "success" | "error"}`.

---

## Core Internal Methods

### `_generate_text(prompt, max_tokens, temperature, top_p) -> str`

All four public APIs ultimately call `_generate_text`. It:

1. Checks mock mode — if `GRANITE_MOCK=1`, returns a keyword-matched IBM OTel canned response (for demo purposes without GPU hardware).
2. Checks model availability — returns an error string if the vision model is not loaded.
3. Formats the prompt using `apply_chat_template` with `role: "user"` — this is the Granite chat format, equivalent to `<|user|>\n{prompt}\n<|assistant|>`.
4. Runs `manager.vision_model.generate` with:
   - `do_sample=True` (sampling enabled for chat, unlike the deterministic vision extraction).
   - `temperature=0.7`, `top_p=0.9` for coherent but varied responses.
   - `repetition_penalty=1.1` to prevent looping.
5. Slices the output to decode only new tokens.
6. Passes through `_clean_response`.

### `_clean_response(text) -> str`

Multi-stage output sanitizer:

1. **Prefix stripping** — removes common prefixes that bleed through (`"Answer:"`, `"Summary:"`, `"Analysis:"`, `"AI:"`, etc.).
2. **Prompt leak detection** — if a system prompt fragment appears in the first 60 characters of the output, finds the actual answer start (after `"analysis:"` or `"answer:"` markers) and strips the leaked context.
3. **Newline normalization** — collapses runs of 3+ newlines to 2.
4. **Dialogue truncation** — if the model continues as if writing a multi-turn dialogue (patterns like `"\nUser:"`, `"\nLet me know"`, `"\n---"`), truncates at that point. This prevents the common issue of small models inventing follow-up questions.
5. **Sentence boundary cleanup** — if the output ends without a sentence-final punctuation mark, backtracks to the last complete sentence. Only applied if the last sentence starts at least halfway through the response (to avoid truncating very short answers).

### `_select_relevant_chunks(full_text, query, max_chars, chunk_size) -> str`

Used when the document text is too long to fit in the context window. Rather than naively truncating from the end, this method:

1. Splits `full_text` into overlapping chunks (20 % overlap, default 600 chars per chunk).
2. Scores each chunk by the fraction of query keywords it contains. Keywords are extracted from the query with stop-word removal.
3. Gives the first chunk a +0.15 bonus score — document introductions tend to be highly informative even if they don't contain query keywords.
4. Selects the top-scoring chunks up to `max_chars`, re-ordered by document position.
5. Joins selected chunks with `"...\n"` separators so the model knows they're non-contiguous.

This means a query about "authentication flow" will retrieve the chunks that discuss authentication rather than arbitrary slices from the beginning of the document.

### `_build_context_string(text_excerpt, vision, components, connections, ai_summary, query) -> str`

Assembles all available information sources into a single context string:
- **Text excerpt** — Docling-extracted text from the document, run through `_select_relevant_chunks` if query is provided.
- **Vision summary** — the Granite Vision model's diagram description.
- **AI summary** — pre-generated summary from a prior analysis run.
- **Components** — AR-detected component list with positions and labels.
- **Connections** — inferred connection graph edges.

The method caps total context at `self.max_context_length` (3072 characters) to reduce VRAM pressure and keep the model's effective attention focused on relevant content.

---

## Mock Mode

When `GRANITE_MOCK=1` is set, `_generate_text` routes through `_mock_chat_response(query)` instead of the model. The mock responses are IBM OTel-specific canned strings selected by keyword matching on the query:
- `"component"`, `"what is"`, `"what are"` → component description.
- `"flow"`, `"route"`, `"send"`, `"data"` → data flow description.
- `"collector"`, `"otel"` → OTel Collector explanation.
- `"instana"`, `"ibm"`, `"monitor"` → Instana explanation.
- `"otlp"`, `"protocol"`, `"grpc"` → OTLP protocol explanation.
- Default → general pipeline description.

---

## Why This Works Well

- **Query-relevant chunk selection** prevents the model from answering based on irrelevant document sections when the full text doesn't fit in context. Relevant context is significantly better than truncated context.
- **Dialogue truncation** in `_clean_response` prevents a common failure mode where small models begin inventing the continuation of a Q&A session, generating spurious follow-up questions and answers.
- **Shared model for text and vision** means all context from a prior `analyze_images` call can be directly incorporated into subsequent chat — the model's internal representation of the diagram is consistent because it's the same model.
- **Sentence boundary cleanup** ensures responses end at complete thoughts rather than mid-sentence, improving perceived quality even when the model generates slightly more tokens than needed.

---

## Risks and Notes

- **Context quality is the primary driver of output quality.** If AR component labels are wrong or vision summaries are vague, the chat and analysis responses will reflect that. The service cannot compensate for poor upstream analysis.
- **3072-character context cap** means very long documents lose some detail. The chunk selector mitigates this for specific queries but broad "explain everything" requests may miss content.
- **Temperature 0.7** produces varied responses on repeated calls with the same input. If deterministic output is required (e.g., for testing), pass `temperature=0` to `_generate_text`.
- **Text-only generation quality** is limited by the 2B parameter count. For complex multi-step reasoning tasks, a larger language model would produce more accurate results.

---

## Dependencies

- `torch`
- `app.services.model_manager.manager` (Granite Vision model, used for text generation)
- `app.services.granite_vision_service.query_image` (visual Q&A for chat context injection)
- `app.services.prompt_builder` (all prompt construction functions and system prompts)
