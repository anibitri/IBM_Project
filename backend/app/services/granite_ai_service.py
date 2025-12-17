import os
import logging
from typing import Optional, Dict, Any
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

from transformers import TextIteratorStreamer
from threading import Thread
import sys

logger = logging.getLogger(__name__)

# Use the exact ID from your snippet
MODEL_ID = "ibm-granite/granite-3.1-1b-a400m-instruct"
# MODEL_ID = "ibm-granite/granite-4.0-micro"
IS_MOCK = False

# Smart Device Selection
def get_device():
    if torch.backends.mps.is_available():
        return "mps"
    elif torch.cuda.is_available():
        return "cuda"
    return "cpu"

device = get_device()
_tokenizer = None
_model = None

def _ensure_llm_loaded():
    global _tokenizer, _model
    if _tokenizer is not None and _model is not None:
        return
    try:
        logger.info(f'Loading LLM model {MODEL_ID} on {device}...')
        
        # 1. Load Tokenizer
        _tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
        
        # 2. Load Model (Directly, mirroring your snippet)
        # We add torch_dtype=float16 only for GPU/MPS to make it faster.
        # CPU must use float32.
        dtype = torch.float16 if device != "cpu" else torch.float32
        
        _model = AutoModelForCausalLM.from_pretrained(
            MODEL_ID,
            torch_dtype=dtype,
            low_cpu_mem_usage=True
        ).to(device)
             
        _model.eval()
        logger.info(f'LLM loaded successfully on {device}.')
        
    except Exception as e:
        logger.error(f'LLM load failed: {e}')
        _tokenizer = None
        _model = None

def _is_mock(override: Optional[bool]) -> bool:
    return IS_MOCK or (override is True)

def _generate_response(messages, max_new_tokens=256):
    """
    Runs model generation with a Streamer to show progress in the terminal.
    """
    _ensure_llm_loaded()
    if _model is None or _tokenizer is None:
        raise Exception("LLM not initialized")

    # 1. Prepare Inputs
    inputs = _tokenizer.apply_chat_template(
        messages,
        add_generation_prompt=True,
        tokenize=True,
        return_dict=True,
        return_tensors="pt"
    ).to(_model.device)

    # 2. Setup Streamer (This decodes tokens one by one)
    streamer = TextIteratorStreamer(
        _tokenizer, 
        skip_prompt=True,       # Don't print the huge system prompt, just the new answer
        skip_special_tokens=True
    )

    # 3. Configure Generation Arguments
    generation_kwargs = dict(
        inputs, 
        streamer=streamer, 
        max_new_tokens=max_new_tokens,
        do_sample=True,
        temperature=0.7,
        # top_p=0.9,
        # repetition_penalty=1.15,
        eos_token_id=_tokenizer.eos_token_id
    )

    # 4. Run Generation in a Separate Thread
    # We need a thread because .generate() blocks execution, but the streamer needs to read
    # from it simultaneously.
    thread = Thread(target=_model.generate, kwargs=generation_kwargs)
    thread.start()

    # 5. Consume the Stream (Print to Console & Build String)
    generated_text = ""
    print("\n--- AI IS THINKING ---")
    
    for new_text in streamer:
        # Print to terminal immediately (flush ensures it appears instantly)
        sys.stdout.write(new_text)
        sys.stdout.flush()
        generated_text += new_text

    print("\n----------------------\n")
    
    # Wait for thread to finish cleaning up
    thread.join()

    return generated_text.strip()

# --- 1. ANALYSIS / SUMMARY FUNCTION ---
def analyze_context(text_excerpt: str, vision: Dict[str, Any], mock: Optional[bool] = None) -> dict:
    if _is_mock(mock):
        return {'status': 'ok', 'answer': "[MOCK] Document analyzed."}

    try:
        vision_summary = (vision.get('vision_answer') or '').strip() if isinstance(vision, dict) else ''
        ar_elements = vision.get('ar_elements') if isinstance(vision, dict) else []
        
        # Build Context String
        context_str = f"Document Text:\n{text_excerpt[:3000]}\n\nVisual Summary:\n{vision_summary[:1000]}\n\n"
        
        if ar_elements:
            context_str += f"Diagram Components Detected ({len(ar_elements)}):\n"
            for item in ar_elements[:15]:
                context_str += f"- {item.get('label')}: {item.get('description', '')}\n"

        # Construct Chat Messages
        messages = [
            {"role": "system", "content": "You are a technical assistant. Summarize the provided document context, highlighting key components and their functions."},
            {"role": "user", "content": f"Here is the data:\n{context_str}\n\nPlease provide a structured summary."},
        ]

        logger.info("Generating summary...")
        answer = _generate_response(messages, max_new_tokens=512)
        return {'status': 'ok', 'answer': answer}

    except Exception as e:
        logger.error(f"Analysis failed: {e}")
        return {'status': 'error', 'error': str(e)}

# --- 2. CHAT FUNCTION ---
def chat_with_document(query: str, context: Dict[str, Any], chat_history: list = None, mock: Optional[bool] = None) -> dict:
    if _is_mock(mock):
        return {'status': 'ok', 'answer': f"[MOCK] You asked: {query}"}

    try:
        # Unpack Context
        doc_text = context.get('text_excerpt', '')
        vision_summary = context.get('vision_answer', '')
        ar_elements = context.get('ar_elements', [])
        focused_component = context.get('focused_component')

        # Build Context Block
        data_block = f"--- CONTEXT ---\nText: {doc_text[:2000]}\nVisuals: {vision_summary[:1000]}\n"
        
        if ar_elements:
            data_block += "Interactive Components:\n" + "\n".join([f"- {i.get('label')}" for i in ar_elements[:10]]) + "\n"
            
        if focused_component:
            data_block += f"\nUSER IS POINTING AT: {focused_component.get('label')} ({focused_component.get('description')})\n"

        # Construct Chat Messages
        messages = [
            {"role": "system", "content": "You are a helpful expert. Answer the question based strictly on the provided context."},
        ]
        
        # Add history if exists
        if chat_history:
            # You might need to map your frontend history format to {"role":, "content":}
            # Assuming frontend sends [{role: "user", content: "..."}]
            messages.extend(chat_history[-4:]) # Keep last 4 turns for context

        # Current Turn
        messages.append({"role": "user", "content": f"{data_block}\n\nQuestion: {query}"})

        logger.info(f"Chat query: {query}")
        answer = _generate_response(messages, max_new_tokens=256)
        return {'status': 'ok', 'answer': answer}

    except Exception as e:
        logger.error(f"Chat failed: {e}")
        return {'status': 'error', 'error': str(e)}