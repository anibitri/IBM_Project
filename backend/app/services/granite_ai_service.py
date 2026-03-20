import torch
from typing import Dict, List, Optional, Any
from app.services.model_manager import manager
from app.services.granite_vision_service import query_image
from app.services.prompt_builder import (
    AI_ANALYZE_SYSTEM_PROMPT,
    AI_CHAT_SYSTEM_PROMPT,
    get_context_analysis_task,
    get_insight_task,
    build_analyze_context_prompt,
    build_chat_with_document_prompt,
    build_component_summary_prompt,
    build_generate_insights_prompt,
)


class AIService:
    """Enhanced AI service for technical document analysis"""
    
    def __init__(self):
        self.max_context_length = 3072
        self.default_max_tokens = 400
    
    # ── IBM OTel mock responses (used when GRANITE_MOCK=1) ──────────────────
    _MOCK_SUMMARY = (
        "This diagram illustrates the IBM OpenTelemetry to Instana observability pipeline. "
        "An instrumented application emits telemetry data (traces, metrics, logs) using the "
        "OpenTelemetry SDK. The OTel Collector receives and processes this data, then forwards "
        "it via the OTLP/Instana Exporter over HTTPS to the Instana Agent running on the host. "
        "The Instana Agent delivers the data to the Instana backend for monitoring and analysis."
    )

    _MOCK_CHAT = {
        "component": (
            "The diagram contains five components: the instrumented Application (source of telemetry), "
            "the OpenTelemetry Collector (receives and processes spans/metrics/logs), the OTLP/Instana "
            "Exporter (formats and sends data to Instana), the Instana Agent (host-level receiver), "
            "and the Instana backend (monitoring platform)."
        ),
        "flow": (
            "Data flows left to right: the Application sends telemetry via OTLP to the OTel Collector. "
            "The Collector processes the data and passes it to the OTLP/Instana Exporter, which sends "
            "it over HTTPS to the Instana Agent. The Agent forwards it to the Instana backend."
        ),
        "collector": (
            "The OpenTelemetry Collector is a vendor-agnostic proxy that receives, processes, and "
            "exports telemetry data. It decouples instrumentation from the backend, allowing batching, "
            "filtering, and routing without changes to application code."
        ),
        "instana": (
            "Instana is IBM's AI-powered APM and observability platform. It provides automatic "
            "discovery, continuous monitoring, and AI-driven root cause analysis for distributed "
            "applications and infrastructure."
        ),
        "otlp": (
            "OTLP (OpenTelemetry Protocol) is the native wire protocol for OpenTelemetry. It uses "
            "gRPC or HTTP/protobuf to transport traces, metrics, and logs efficiently between "
            "OTel-compatible components."
        ),
        "default": (
            "This is an IBM OpenTelemetry observability pipeline connecting an instrumented "
            "application to the Instana monitoring backend via the OTel Collector and Instana Agent. "
            "The pipeline carries distributed traces, metrics, and logs in real time."
        ),
    }

    def _mock_chat_response(self, query: str) -> str:
        """Return an IBM OTel-specific canned response based on keywords in the query."""
        q = query.lower()
        if any(w in q for w in ["component", "part", "element", "what is", "what are"]):
            return self._MOCK_CHAT["component"]
        if any(w in q for w in ["flow", "path", "route", "travel", "move", "send", "data"]):
            return self._MOCK_CHAT["flow"]
        if any(w in q for w in ["collector", "otel", "opentelemetry"]):
            return self._MOCK_CHAT["collector"]
        if any(w in q for w in ["instana", "ibm", "backend", "monitor"]):
            return self._MOCK_CHAT["instana"]
        if any(w in q for w in ["otlp", "protocol", "grpc", "http"]):
            return self._MOCK_CHAT["otlp"]
        return self._MOCK_CHAT["default"]

    def _generate_text(
        self,
        prompt: str,
        max_tokens: int = None,
        temperature: float = 0.7,
        top_p: float = 0.9
    ) -> str:
        """
        Generate text using the IBM Granite Vision model.
        The vision model handles both image analysis and text-only chat.
        In mock mode, returns IBM OTel-specific canned responses.
        """
        if manager.mock_mode:
            return self._mock_chat_response(prompt)

        if not manager.vision_model or not manager.vision_processor:
            return "Error: AI model not loaded."

        try:
            # Text-only generation — pass text only (no image) for chat tasks.
            device = manager.vision_model.device
            chat_text = manager.vision_processor.apply_chat_template(
                [{"role": "user", "content": prompt}],
                tokenize=False,
                add_generation_prompt=True,
            )
            inputs = manager.vision_processor(
                text=chat_text,
                return_tensors="pt",
            ).to(device)

            max_new = max_tokens or self.default_max_tokens
            with torch.no_grad():
                output_ids = manager.vision_model.generate(
                    **inputs,
                    max_new_tokens=max_new,
                    do_sample=temperature > 0,
                    temperature=temperature if temperature > 0 else 1.0,
                    top_p=top_p,
                    repetition_penalty=1.1,
                )

            prompt_len = inputs["input_ids"].shape[1]
            new_tokens = output_ids[:, prompt_len:]
            text = manager.vision_processor.batch_decode(new_tokens, skip_special_tokens=True)[0]
            return self._clean_response(text)

        except Exception as e:
            logger.exception("Text generation failed")
            return f"Error generating response: {str(e)}"
    
    def _clean_response(self, text: str) -> str:
        """Clean up generated response"""
        import re
        
        # Remove common prefixes
        prefixes_to_remove = [
            "Answer:", "Response:", "Summary:", "AI:",
            "Provide a clear, structured analysis:",
            "Provide a clear, concise answer:",
            "Analysis:",
        ]
        for prefix in prefixes_to_remove:
            if text.startswith(prefix):
                text = text[len(prefix):].strip()
        
        # Remove any residual prompt fragments that start with known markers
        prompt_markers = [
            AI_ANALYZE_SYSTEM_PROMPT,
            AI_CHAT_SYSTEM_PROMPT,
            "Task:",
            "Context:",
        ]
        for marker in prompt_markers:
            idx = text.find(marker)
            if idx != -1 and idx < 60:
                # Prompt text leaked at the start — find where the actual answer begins
                # Look for the closing marker "analysis:" or "answer:"
                answer_start = text.lower().find("analysis:", idx)
                if answer_start == -1:
                    answer_start = text.lower().find("answer:", idx)
                if answer_start != -1:
                    text = text[answer_start:].split(":", 1)[-1].strip()
                else:
                    text = text[idx + len(marker):].strip()
        
        # Collapse multiple newlines
        text = re.sub(r'\n{3,}', '\n\n', text)
        
        # Truncate at self-generated dialogue (model continuing as if it's a conversation)
        dialogue_markers = [
            r'\n\s*(?:User|Human|Question|Q)\s*[:\?]',
            r'\n\s*(?:Follow[\s-]?up|Additional|Note to)',
            r'\n\s*(?:Let me know|Do you have|Would you like|If you have|Feel free)',
            r'\n\s*---+',
        ]
        for marker in dialogue_markers:
            m = re.search(marker, text, re.IGNORECASE)
            if m and m.start() > 40:  # Only if we already have some content
                text = text[:m.start()].rstrip()
        
        # Remove incomplete sentences at the end
        if text and text[-1] not in '.!?:':
            last_punct = max(
                text.rfind('.'),
                text.rfind('!'),
                text.rfind('?')
            )
            if last_punct > len(text) * 0.5:  # Only if we're past halfway
                text = text[:last_punct + 1]
        
        return text.strip()

    def _select_relevant_chunks(
        self,
        full_text: str,
        query: str,
        max_chars: int = 4000,
        chunk_size: int = 600,
    ) -> str:
        """Select the most query-relevant portions of a long document.

        Splits the text into overlapping chunks, scores each by keyword
        overlap with the query, and returns the top-scoring chunks in
        document order so the model gets the most useful context.
        """
        if not full_text or not query:
            return (full_text or '')[:max_chars]

        if len(full_text) <= max_chars:
            return full_text

        import re

        # Normalise query into keyword set (words ≥ 3 chars)
        stop_words = {
            'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all',
            'can', 'has', 'her', 'was', 'one', 'our', 'out', 'what',
            'with', 'this', 'that', 'from', 'have', 'been', 'will',
            'does', 'how', 'about', 'which', 'when', 'where', 'there',
        }
        query_words = {
            w.lower()
            for w in re.findall(r'\w+', query)
            if len(w) >= 3 and w.lower() not in stop_words
        }

        if not query_words:
            return full_text[:max_chars]

        # Split into chunks with ~20% overlap
        overlap = chunk_size // 5
        chunks = []
        pos = 0
        while pos < len(full_text):
            end = pos + chunk_size
            chunk_text = full_text[pos:end]
            chunks.append((pos, chunk_text))
            pos += chunk_size - overlap

        # Score each chunk by fraction of query keywords it contains
        scored = []
        for idx, (start_pos, chunk_text) in enumerate(chunks):
            chunk_lower = chunk_text.lower()
            hits = sum(1 for w in query_words if w in chunk_lower)
            score = hits / len(query_words)
            scored.append((score, idx, start_pos, chunk_text))

        # Always include the first chunk (document intro) with a bonus
        scored[0] = (scored[0][0] + 0.15, *scored[0][1:])

        # Sort by score descending, pick top chunks
        scored.sort(key=lambda x: x[0], reverse=True)

        selected = []
        total_len = 0
        for score, idx, start_pos, chunk_text in scored:
            if total_len + len(chunk_text) > max_chars:
                remaining = max_chars - total_len
                if remaining > 100:
                    selected.append((start_pos, chunk_text[:remaining]))
                break
            selected.append((start_pos, chunk_text))
            total_len += len(chunk_text)

        # Re-order by document position so output reads naturally
        selected.sort(key=lambda x: x[0])

        return '\n...\n'.join(text for _, text in selected)

    def _build_context_string(
        self,
        text_excerpt: str = None,
        vision: Dict = None,
        components: List[Dict] = None,
        connections: List[Dict] = None,
        ai_summary: str = None,
        query: str = None,
    ) -> str:
        """Build a comprehensive context string from available data, kept compact for VRAM."""
        context_parts = []

        # AI summary is the most information-dense source — include first
        if ai_summary:
            context_parts.append(f"Document Summary:\n{ai_summary[:1200]}\n")

        if text_excerpt:
            # When a query is provided, select the most relevant portions
            # of the document text instead of blindly taking the first N chars.
            if query and len(text_excerpt) > 4000:
                excerpt = self._select_relevant_chunks(text_excerpt, query, max_chars=4500)
            else:
                excerpt = text_excerpt[:4500]
            context_parts.append(f"Document Text:\n{excerpt}\n")
        
        if vision and isinstance(vision, dict):
            vision_summary = vision.get('analysis', {}).get('summary', '')
            if vision_summary:
                context_parts.append(f"Visual Analysis:\n{vision_summary[:1000]}\n")
        
        if components and isinstance(components, list):
            comp_list = []
            for comp in components[:15]:
                if isinstance(comp, dict):
                    label = comp.get('label', 'Unknown')
                    desc = comp.get('description', '')
                    comp_str = f"- {label}"
                    if desc:
                        comp_str += f": {desc[:80]}"
                else:
                    comp_str = f"- {comp}"
                comp_list.append(comp_str)
            
            if comp_list:
                context_parts.append(f"Identified Components:\n" + "\n".join(comp_list))
        
        # Add connection / relationship information
        if connections and isinstance(connections, list):
            conn_lines = []
            for conn in connections[:15]:  # Limit to 15 connections
                src = conn.get('from_label') or conn.get('from', '?')
                tgt = conn.get('to_label') or conn.get('to', '?')
                conn_lines.append(f"- {src} connects to {tgt}")
            if conn_lines:
                context_parts.append(
                    "Component Connections (which components are linked to each other):\n"
                    + "\n".join(conn_lines)
                )
        
        result = "\n".join(context_parts)
        # Cap at ~8000 chars (~2000 tokens) to leave room for prompt + generation
        if len(result) > 8000:
            result = result[:8000] + "\n[Context truncated]"
        return result
    
    def analyze_context(
        self,
        text_excerpt: str = None,
        vision: Dict = None,
        components: List[Dict] = None,
        context_type: str = "general",
        connections: List[Dict] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Analyze technical content and generate comprehensive summary.
        
        Args:
            text_excerpt: Text content from document
            vision: Vision analysis results
            components: AR component data
            context_type: Type of document (general, software, electronics, etc.)
            connections: List of connection dicts {from_label, to_label, ...}
        
        Returns:
            Dictionary with analysis results
        """
        print(f"🤖 AI Service: Analyzing context [Type: {context_type}]")
        
        # Handle legacy 'message' parameter
        if 'message' in kwargs and not text_excerpt:
            text_excerpt = kwargs['message']
        
        # Build context
        context_str = self._build_context_string(text_excerpt, vision, components, connections)
        
        if not context_str.strip():
            return {
                "status": "error",
                "error": "No content to analyze",
                "answer": "No content provided for analysis."
            }
        
        if manager.mock_mode:
            return {
                "status": "ok",
                "answer": self._MOCK_SUMMARY,
                "context_type": context_type,
            }

        task = get_context_analysis_task(context_type)
        prompt = build_analyze_context_prompt(context_str, task)

        answer = self._generate_text(prompt, max_tokens=400)

        return {
            "status": "ok",
            "answer": answer,
            "context_type": context_type
        }
    
    def chat_with_document(
        self,
        query: str,
        context: Any,
        chat_history: List[Dict] = None,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Interactive Q&A with document context.
        
        When an image_path is available in the context, the vision model is
        asked the same question first.  Its visual answer is injected into
        the chat-model prompt so the text model can reason over both the
        pre-existing document context *and* fresh visual evidence.
        
        Args:
            query: User question
            context: Document context (dict, string, or structured data)
            chat_history: Previous conversation messages
        
        Returns:
            Dictionary with chat response
        """
        if chat_history is None:
            chat_history = []
        
        print(f"💬 AI Chat: {query[:50]}...")
        
        # ── Resolve image path for vision Q&A ──
        image_path = None
        if isinstance(context, dict):
            image_path = context.get('image_path')
        
        # ── Ask the vision model the same question (if image available) ──
        vision_answer = ""
        if image_path:
            try:
                vision_answer = query_image(image_path, query)
            except Exception as e:
                print(f"⚠️ Vision Q&A skipped: {e}")
        
        # ── Build context string from structured data ──
        if isinstance(context, dict):
            # Accept both 'vision' (internal format) and 'analysis' (vision route response format)
            vision_ctx = context.get('vision') or (
                {'analysis': context['analysis']} if context.get('analysis') else None
            )
            context_str = self._build_context_string(
                text_excerpt=context.get('text_excerpt'),
                vision=vision_ctx,
                components=context.get('components'),
                connections=context.get('connections'),
                ai_summary=context.get('ai_summary'),
                query=query,
            )
        elif isinstance(context, str):
            context_str = context
        else:
            context_str = str(context)
        
        # Inject vision answer as extra context
        if vision_answer:
            context_str += f"\n\nVisual Observation (from looking at the image):\n{vision_answer}\n"
        
        # Build conversation history (keep short for VRAM)
        history_str = ""
        for msg in chat_history[-3:]:
            role = "User" if msg.get('role') == 'user' else "Assistant"
            text = msg.get('text', '') or msg.get('content', '')
            if text:
                history_str += f"{role}: {text}\n"
        
        prompt = build_chat_with_document_prompt(context_str, query, history_str)
        
        answer = self._generate_text(prompt, max_tokens=400, temperature=0.3)
        
        return {
            "status": "ok",
            "answer": answer,
            "query": query
        }
    
    def summarize_components(
        self,
        components: List[Dict],
        relationships: Dict = None,
        document_type: str = "general"
    ) -> Dict[str, Any]:
        """
        Generate natural language summary of AR components.
        
        Args:
            components: List of component dictionaries
            relationships: Component relationship data
            document_type: Type of document
        
        Returns:
            Dictionary with summary
        """
        print(f"📝 Summarizing {len(components)} components")
        
        if not components:
            return {
                "status": "error",
                "error": "No components provided",
                "summary": ""
            }
        
        # Build component description
        comp_descriptions = []
        for i, comp in enumerate(components[:15], 1):  # Limit to 15
            label = comp.get('label', f'Component {i}')
            desc = comp.get('description', '')
            confidence = comp.get('confidence', 0)
            
            comp_str = f"{i}. {label}"
            if desc:
                comp_str += f" - {desc}"
            if confidence > 0.8:
                comp_str += " (high confidence)"
            
            comp_descriptions.append(comp_str)
        
        component_list = "\n".join(comp_descriptions)
        
        # Add relationship info
        relationship_str = ""
        if relationships and relationships.get('connections'):
            connections = relationships['connections'][:5]  # First 5
            rel_list = [
                f"- {c['from']} connects to {c['to']}"
                for c in connections
            ]
            relationship_str = "\n\nConnections:\n" + "\n".join(rel_list)
        
        prompt = build_component_summary_prompt(document_type, component_list, relationship_str)
        
        summary = self._generate_text(prompt, max_tokens=256)
        
        return {
            "status": "ok",
            "summary": summary,
            "component_count": len(components)
        }
    
    def generate_insights(
        self,
        vision_analysis: Dict = None,
        ar_components: List[Dict] = None,
        text_content: str = None,
        insight_type: str = "general"
    ) -> Dict[str, Any]:
        """
        Generate technical insights from combined analysis.
        
        Args:
            vision_analysis: Vision model results
            ar_components: AR component data
            text_content: Text content
            insight_type: Type of insights to generate
        
        Returns:
            Dictionary with insights
        """
        

        if not any([vision_analysis, ar_components, text_content]):
            return {
                "status": "ok",
                "insights": ["No insights available because no data was provided."],
                "insight_type": "general",
            }
        
        print(f"💡 Generating insights: {insight_type}")
        
        context_str = self._build_context_string(
            text_excerpt=text_content,
            vision=vision_analysis,
            components=ar_components
        )
        
        if not context_str.strip():
            return {
                "status": "error",
                "error": "No data for insight generation",
                "insights": []
            }
        
        task = get_insight_task(insight_type)
        prompt = build_generate_insights_prompt(context_str, task)
        
        insights_text = self._generate_text(prompt, max_tokens=256)
        
        # Parse into list if possible
        insights_list = [
            line.strip("- •*123456789.").strip()
            for line in insights_text.split('\n')
            if line.strip() and len(line.strip()) > 10
        ]
        
        return {
            "status": "ok",
            "insights": insights_list if insights_list else [insights_text],
            "insight_type": insight_type
        }


# Singleton instance
ai_service = AIService()


# Exported functions for backward compatibility
def analyze_context(*args, **kwargs):
    """Legacy function wrapper"""
    return ai_service.analyze_context(*args, **kwargs)


def chat_with_document(*args, **kwargs):
    """Legacy function wrapper"""
    return ai_service.chat_with_document(*args, **kwargs)


def summarize_components(*args, **kwargs):
    """New function"""
    return ai_service.summarize_components(*args, **kwargs)


def generate_insights(*args, **kwargs):
    """New function"""
    return ai_service.generate_insights(*args, **kwargs)