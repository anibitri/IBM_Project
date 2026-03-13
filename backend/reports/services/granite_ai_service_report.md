# Granite AI Service Report (`granite_ai_service.py`)

## Overview
`AIService` provides text-generation based reasoning over document context. It wraps Granite chat model inference and exposes analysis, Q&A, summarization, and insight-generation interfaces.

## Core Responsibilities
- Robust generation with OOM retries and context truncation (`_generate_text`).
- Prompt cleanup and output sanitization (`_clean_response`).
- Query-aware context chunk selection for long text (`_select_relevant_chunks`).
- Multi-source context assembly from text, vision summaries, components, and connections.

## Public APIs
- `analyze_context(...) -> Dict[str, Any]`
- `chat_with_document(query, context, chat_history=None) -> Dict[str, Any]`
- `summarize_components(components, relationships=None, document_type='general') -> Dict[str, Any]`
- `generate_insights(vision_analysis=None, ar_components=None, text_content=None, insight_type='general') -> Dict[str, Any]`

Module-level compatibility wrappers:
- `analyze_context`, `chat_with_document`, `summarize_components`, `generate_insights`

## Runtime Behavior
- Uses `model_manager.manager.chat_model` and tokenizer.
- Optionally injects live visual answer via `query_image` from vision service.
- Caps context size to reduce VRAM pressure and hallucination risk.

## Dependencies
- `torch`
- `app.services.model_manager.manager`
- `app.services.granite_vision_service.query_image`

## Risks / Notes
- Prompt-based behavior can vary by context quality.
- If context is sparse or inconsistent (especially component labels), answer quality drops.
- Strongly tied to model availability and GPU memory health.
