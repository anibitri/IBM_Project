import torch
from typing import Dict, List, Optional, Any
from app.services.model_manager import manager


class AIService:
    """Enhanced AI service for technical document analysis"""
    
    def __init__(self):
        self.max_context_length = 4096
        self.default_max_tokens = 300
    
    def _generate_text(
        self, 
        prompt: str, 
        max_tokens: int = None,
        temperature: float = 0.7,
        top_p: float = 0.9
    ) -> str:
        """
        Generate text using the chat model with proper token management.
        """
        if not manager.chat_model or not manager.chat_tokenizer:
            return "Error: AI Model not available."
        
        if max_tokens is None:
            max_tokens = self.default_max_tokens
        
        try:
            # Tokenize with truncation
            enc = manager.chat_tokenizer(
                prompt,
                return_tensors="pt",
                padding=True,
                truncation=True,
                max_length=self.max_context_length
            )

            # Move to device
            enc = {k: v.to(manager.device) for k, v in enc.items()}
            if "attention_mask" in enc:
                enc["attention_mask"] = enc["attention_mask"].long()

            # Generate
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
            
            # Decode
            response = manager.chat_tokenizer.decode(
                output_ids[0], 
                skip_special_tokens=True
            )
            
            # Clean up prompt echo
            if prompt in response:
                response = response.replace(prompt, "").strip()
            
            # Remove common artifacts
            response = self._clean_response(response)
            
            return response
        
        except Exception as e:
            print(f"❌ Text generation error: {e}")
            return f"Error generating response: {str(e)}"
    
    def _clean_response(self, text: str) -> str:
        """Clean up generated response"""
        # Remove common prefixes
        prefixes_to_remove = ["Answer:", "Response:", "Summary:", "AI:"]
        for prefix in prefixes_to_remove:
            if text.startswith(prefix):
                text = text[len(prefix):].strip()
        
        # Remove incomplete sentences at the end
        if text and not text[-1] in '.!?':
            last_punct = max(
                text.rfind('.'),
                text.rfind('!'),
                text.rfind('?')
            )
            if last_punct > len(text) * 0.7:  # Only if we're near the end
                text = text[:last_punct + 1]
        
        return text.strip()
    
    def _build_context_string(
        self,
        text_excerpt: str = None,
        vision: Dict = None,
        components: List[Dict] = None
    ) -> str:
        """Build a comprehensive context string from available data"""
        context_parts = []
        
        if text_excerpt:
            context_parts.append(f"Document Text:\n{text_excerpt}\n")
        
        if vision and isinstance(vision, dict):
            vision_summary = vision.get('analysis', {}).get('summary', '')
            if vision_summary:
                context_parts.append(f"Visual Analysis:\n{vision_summary}\n")
        
        if components and isinstance(components, list):
            comp_list = []
            for comp in components[:10]:  # Limit to first 10
                label = comp.get('label', 'Unknown')
                desc = comp.get('description', '')
                comp_str = f"- {label}"
                if desc:
                    comp_str += f": {desc}"
                comp_list.append(comp_str)
            
            if comp_list:
                context_parts.append(f"Identified Components:\n" + "\n".join(comp_list))
        
        return "\n".join(context_parts)
    
    def analyze_context(
        self,
        text_excerpt: str = None,
        vision: Dict = None,
        components: List[Dict] = None,
        context_type: str = "general",
        **kwargs
    ) -> Dict[str, Any]:
        """
        Analyze technical content and generate comprehensive summary.
        
        Args:
            text_excerpt: Text content from document
            vision: Vision analysis results
            components: AR component data
            context_type: Type of document (general, software, electronics, etc.)
        
        Returns:
            Dictionary with analysis results
        """
        print(f"🤖 AI Service: Analyzing context [Type: {context_type}]")
        
        # Handle legacy 'message' parameter
        if 'message' in kwargs and not text_excerpt:
            text_excerpt = kwargs['message']
        
        # Build context
        context_str = self._build_context_string(text_excerpt, vision, components)
        
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
            f"Provide a clear, structured analysis:\n"
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
        
        # Build context string
        if isinstance(context, dict):
            context_str = self._build_context_string(
                text_excerpt=context.get('text_excerpt'),
                vision=context.get('vision'),
                components=context.get('components')
            )
        elif isinstance(context, str):
            context_str = context
        else:
            context_str = str(context)
        
        # Build conversation history
        history_str = ""
        for msg in chat_history[-5:]:  # Last 5 messages only
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
        
        prompt += f"User Question: {query}\n\nProvide a clear, concise answer:\n"
        
        answer = self._generate_text(prompt, max_tokens=350)
        
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
            f"Task: Provide a concise technical summary explaining what this diagram shows, "
            f"the main components, and how they relate to each other.\n\n"
            f"Summary:\n"
        )
        
        summary = self._generate_text(prompt, max_tokens=300)
        
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
        
        insights_text = self._generate_text(prompt, max_tokens=350)
        
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