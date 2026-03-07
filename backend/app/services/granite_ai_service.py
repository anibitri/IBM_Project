import torch
from typing import Dict, List, Optional, Any
from app.services.model_manager import manager
from app.services.granite_vision_service import query_image


class AIService:
    """Enhanced AI service for technical document analysis"""
    
    def __init__(self):
        self.max_context_length = 3072
        self.default_max_tokens = 400
    
    def _generate_text(
        self, 
        prompt: str, 
        max_tokens: int = None,
        temperature: float = 0.7,
        top_p: float = 0.9
    ) -> str:
        """
        Generate text using the chat model with proper token management.
        Includes OOM retry with progressive context truncation.
        """
        if not manager.chat_model or not manager.chat_tokenizer:
            return "Error: AI Model not available."
        
        if max_tokens is None:
            max_tokens = self.default_max_tokens

        # Try generation with progressively shorter context on OOM
        for attempt, max_len in enumerate([self.max_context_length, 1536, 768]):
            try:
                # Free cached VRAM before generation
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()

                # Tokenize with truncation
                enc = manager.chat_tokenizer(
                    prompt,
                    return_tensors="pt",
                    padding=True,
                    truncation=True,
                    max_length=max_len
                )

                # Move to same device as the chat model
                enc = {k: v.to(manager.chat_device) for k, v in enc.items()}
                if "attention_mask" in enc:
                    enc["attention_mask"] = enc["attention_mask"].long()

                # Generate
                prompt_len = enc["input_ids"].shape[1]
                with torch.no_grad():
                    output_ids = manager.chat_model.generate(
                        **enc,
                        max_new_tokens=max_tokens,
                        do_sample=True,
                        temperature=temperature,
                        top_p=top_p,
                        repetition_penalty=1.1,
                        pad_token_id=manager.chat_tokenizer.pad_token_id,
                        eos_token_id=manager.chat_tokenizer.eos_token_id
                    )
                
                # Decode only newly generated tokens (skip the prompt)
                new_token_ids = output_ids[0][prompt_len:]
                response = manager.chat_tokenizer.decode(
                    new_token_ids, 
                    skip_special_tokens=True
                ).strip()
                
                # Remove common artifacts
                response = self._clean_response(response)
                
                return response

            except torch.cuda.OutOfMemoryError:
                print(f"⚠️ OOM on attempt {attempt+1} (max_len={max_len}), retrying shorter...")
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                if attempt == 2:
                    return "Error: Not enough GPU memory to generate a response. Try a shorter question."
        
            except Exception as e:
                print(f"❌ Text generation error: {e}")
                return f"Error generating response: {str(e)}"
        
        return "Error generating response."
    
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
            "You are an expert technical analyst.",
            "You are a helpful technical assistant",
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
    
    def _build_context_string(
        self,
        text_excerpt: str = None,
        vision: Dict = None,
        components: List[Dict] = None,
        connections: List[Dict] = None,
        ai_summary: str = None
    ) -> str:
        """Build a comprehensive context string from available data, kept compact for VRAM."""
        context_parts = []

        # AI summary is the most information-dense source — include first
        if ai_summary:
            context_parts.append(f"Document Summary:\n{ai_summary[:1200]}\n")

        if text_excerpt:
            # Allow more text so the model can actually reference document content
            excerpt = text_excerpt[:4000]
            context_parts.append(f"Document Text:\n{excerpt}\n")
        
        if vision and isinstance(vision, dict):
            vision_summary = vision.get('analysis', {}).get('summary', '')
            if vision_summary:
                context_parts.append(f"Visual Analysis:\n{vision_summary[:1000]}\n")
        
        if components and isinstance(components, list):
            comp_list = []
            for comp in components[:15]:  # Show more components
                label = comp.get('label', 'Unknown')
                desc = comp.get('description', '')
                comp_str = f"- {label}"
                if desc:
                    comp_str += f": {desc[:80]}"
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
        # Cap at ~7000 chars (~1750 tokens) to leave room for prompt + generation
        if len(result) > 7000:
            result = result[:7000] + "\n[Context truncated]"
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
        
        # Build prompt based on context type
        if context_type == "software":
            task = "Analyze this software architecture diagram or code documentation. Explain the system design, key components, and their interactions."
        elif context_type == "electronics":
            task = "Analyze this circuit or electronics diagram. Explain the circuit function, key components, and how they work together."
        elif context_type == "mechanical":
            task = "Analyze this mechanical or engineering diagram. Explain the design, key parts, and their functions."
        elif context_type == "network":
            task = "Analyze this network or infrastructure diagram. Explain the architecture, components, and data flow."
        else:
            task = "Provide a comprehensive technical analysis of this document. Explain the key components and their relationships."
        
        prompt = (
            f"You are an expert technical analyst.\n\n"
            f"Context:\n{context_str}\n\n"
            f"Task: {task}\n\n"
            f"Provide a clear, structured analysis based ONLY on the context above:\n"
        )
        
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
            context_str = self._build_context_string(
                text_excerpt=context.get('text_excerpt'),
                vision=context.get('vision'),
                components=context.get('components'),
                connections=context.get('connections'),
                ai_summary=context.get('ai_summary')
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
        
        # Build prompt
        prompt = (
            f"You are a helpful technical assistant answering questions about a document.\n\n"
            f"Document Context:\n{context_str}\n\n"
        )
        
        if history_str:
            prompt += f"Previous Conversation:\n{history_str}\n"
        
        prompt += f"User Question: {query}\n\nProvide a clear, concise answer based ONLY on the document context above. Do not make up information. If the context doesn't cover the topic, say so. Do not generate follow-up questions or continue the conversation:\n"
        
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
        
        prompt = (
            f"You are analyzing a {document_type} technical diagram.\n\n"
            f"Components identified:\n{component_list}\n"
            f"{relationship_str}\n\n"
            f"Task: Provide a brief and concise technical summary explaining what this diagram shows, "
            f"the main components, and how they relate to each other.\n\n"
            f"Summary:\n"
        )
        
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
        
        insight_prompts = {
            "architecture": "Analyze the system architecture. What are the key design patterns and architectural decisions?",
            "complexity": "Assess the technical complexity. What are the most complex parts and potential challenges?",
            "optimization": "Identify potential optimization opportunities. Where could performance or efficiency be improved?",
            "relationships": "Analyze component relationships. How do the parts interact and depend on each other?",
            "general": "Provide key technical insights about this system. What are the most important things to understand?"
        }
        
        task = insight_prompts.get(insight_type, insight_prompts["general"])
        
        prompt = (
            f"You are a senior technical analyst.\n\n"
            f"Technical Data:\n{context_str}\n\n"
            f"Task: {task}\n\n"
            f"Provide 3-5 specific, actionable insights:\n"
        )
        
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