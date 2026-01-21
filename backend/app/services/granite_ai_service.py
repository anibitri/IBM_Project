import torch
from app.services.model_manager import manager

def _generate_text(prompt, max_tokens=200):
    if not manager.chat_model or not manager.chat_tokenizer:
        return "Error: AI Model offline."

    input_ids = manager.chat_tokenizer(
        prompt, return_tensors="pt"
    ).input_ids.to("cpu")

    with torch.no_grad():
        output_ids = manager.chat_model.generate(
            input_ids,
            max_new_tokens=max_tokens,
            do_sample=True,
            temperature=0.7,
            top_p=0.9
        )
    
    response = manager.chat_tokenizer.decode(output_ids[0], skip_special_tokens=True)
    
    # Simple cleanup of prompt echo if it happens
    if prompt in response:
        response = response.replace(prompt, "").strip()
    return response

def analyze_context(text_excerpt=None, vision=None, mock=False, **kwargs):
    """
    Summarizes content (e.g. from Docling PDF or Vision).
    Handles 'message' argument if passed positionally.
    """
    # Handle the 'message' arg if called as analyze_context(msg, context=...)
    # This aligns with your pasted service signature.
    msg_input = kwargs.get('message', "")
    if not text_excerpt and msg_input:
        text_excerpt = msg_input

    print(f"--- AI SERVICE: Analyzing Context ---")
    
    context_str = ""
    if text_excerpt: context_str += f"Text Data: {text_excerpt}\n"
    if vision: context_str += f"Visual Data: {str(vision)}\n"
    
    prompt = (
        f"Context:\n{context_str}\n"
        f"Task: Provide a concise technical summary of this data.\n"
        f"Answer:"
    )
    
    answer = _generate_text(prompt, max_tokens=250)
    
    # Strip "Answer:" if present
    if "Answer:" in answer:
        answer = answer.split("Answer:")[-1].strip()

    return {"status": "ok", "answer": answer}

def chat_with_document(query, context, chat_history=[], mock=False):
    """
    Handles conversational Q&A.
    """
    print(f"--- AI SERVICE: Chat Query: {query} ---")
    
    # Build History String
    history_str = ""
    for msg in chat_history:
        role = "User" if msg.get('role') == 'user' else "AI"
        text = msg.get('text', '') or msg.get('content', '')
        history_str += f"{role}: {text}\n"

    # Build Prompt
    full_prompt = (
        f"You are a helpful technical assistant.\n"
        f"Context: {str(context)}\n"
        f"History:\n{history_str}\n"
        f"User: {query}\n"
        f"AI:"
    )

    answer = _generate_text(full_prompt, max_tokens=300)
    
    # Cleanup
    if "AI:" in answer:
        answer = answer.split("AI:")[-1].strip()
        
    return {"status": "ok", "answer": answer}