import torch
from app.services.model_manager import manager

def _generate_text(prompt, max_tokens=200):
    try:
        # Unpack 3 values: model, tokenizer, device
        model, tokenizer, device = manager.get_chat_model()

        inputs = tokenizer(prompt, return_tensors="pt").to(device)

        outputs = model.generate(
            **inputs, 
            max_new_tokens=max_tokens,
            do_sample=True,
            temperature=0.7
        )

        response = tokenizer.decode(outputs[0], skip_special_tokens=True)
        return response
    except Exception as e:
        print(f"ERROR in AI Generation: {e}")
        return ""

def analyze_context(text=None, **kwargs):
    content_to_analyze = text or kwargs.get('text_excerpt') or ""
    if not content_to_analyze: return "No text."

    print("INFO: AI Service analyzing document context...")
    prompt = (
        "System: Summarize the following technical text in 3-4 bullet points.\n"
        f"Text: {content_to_analyze[:2000]}\n"
        "Summary:"
    )
    
    raw_response = _generate_text(prompt, max_tokens=150)
    if "Summary:" in raw_response:
        return raw_response.split("Summary:")[-1].strip()
    return raw_response

def chat_with_document(query, context, **kwargs):
    print("INFO: AI Service generating chat response...")
    
    context_str = ""
    if isinstance(context, dict):
        excerpt = context.get('text_excerpt', '')
        ar_data = context.get('ar_elements', [])
        context_str = f"Context Info: {excerpt}\nAR Data: {ar_data}"
    else:
        context_str = str(context)

    prompt = (
        f"System: You are a helpful AI technical assistant.\n"
        f"{context_str}\n"
        f"User: {query}\n"
        f"Assistant:"
    )

    raw_response = _generate_text(prompt, max_tokens=200)

    if "Assistant:" in raw_response:
        final_answer = raw_response.split("Assistant:")[-1].strip()
    else:
        final_answer = raw_response.strip()

    return {"answer": final_answer, "status": "ok"}