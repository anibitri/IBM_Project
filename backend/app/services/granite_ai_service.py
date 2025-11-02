import os
import logging
from typing import Optional, Dict, Any

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

logger = logging.getLogger(__name__)

MODEL_ID = "ibm-granite/granite-4.0-micro"
# Mock mode ON by default. Set to False (or pass mock=False) to use real model.
IS_MOCK = True

# _device = "cuda" if torch.cuda.is_available() else "cpu"

_tokenizer = None
_model = None

def _ensure_llm_loaded():
	global _tokenizer, _model
	if _tokenizer is not None and _model is not None:
		logger.info('LLM model already loaded')
		return
	try:
		_tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
		_model = AutoModelForCausalLM.from_pretrained(MODEL_ID, dtype="auto", device_map="auto")
		logger.info('LLM model loaded successfully.')
		# _model.to(_device)
		_model.eval()
	except Exception as e:
		logger.error(f'LLM model load failed: {e}')
		_tokenizer = None
		_model = None

def _is_mock(override: Optional[bool]) -> bool:
	# Honor global mock switch or explicit override.
	return IS_MOCK or (override is True)

def analyze_context(text_excerpt: str, vision: Dict[str, Any], mock: Optional[bool] = None, max_new_tokens: int = 320) -> dict:
	"""
	Combine document text (excerpt) with vision output to produce a synthesized analysis.
	vision: { "vision_answer"?: str, "ar_elements"?: list, "meta"?: any }
	Returns: { status: 'ok', answer: str, meta?: {...} } or { status: 'error', error: str }
	"""
	
    
	try:
		logger.info('Starting AI synthesis analysis')
		vision_answer = (vision.get('vision_answer') or '').strip() if isinstance(vision, dict) else ''
		ar_elements = vision.get('ar_elements') if isinstance(vision, dict) else None
		ar_count = len(ar_elements) if isinstance(ar_elements, list) else 0

		prompt = (
			"You are an AI assistant synthesizing a technical document.\n"
			"Given the text excerpt and the vision findings (objects/diagrams), produce:\n"
			"1) A concise summary\n2) Key entities and relationships\n3) Detected components/diagrams and their roles\n"
			"Be specific and structured.\n\n"
			f"Text Excerpt:\n{text_excerpt[:4000]}\n\n"
			f"Vision Findings Summary:\n{vision_answer[:1500]}\n\n"
			f"AR Elements Count: {ar_count}\n"
		)

		if _is_mock(mock):
			logger.info('Returning mock AI synthesis response')
			return {
				'status': 'ok',
				'answer': (
					"[MOCK AI] Synthesized understanding based on provided text excerpt and vision output.\n"
					"- Summary: The document covers key technical aspects and components.\n"
					"- Entities/Relationships: Derived from text and visual elements.\n"
					"- Visual Components: Interpreted from detected AR elements and vision summary."
				),
				'meta': {
					'used_mock': True,
					'ar_elements_count': ar_count
				}
			}

		_ensure_llm_loaded()
		if _model is None or _tokenizer is None:
			return {'status': 'error', 'error': 'LLM not initialized. Check server logs for load errors.'}

		input_ids = _tokenizer.encode(prompt, return_tensors='pt')  # removed .to(_device)
		with torch.no_grad():
			gen_ids = _model.generate(
				input_ids,
				max_new_tokens=max_new_tokens,
				do_sample=True,
				temperature=0.7,
				top_p=0.9,
				eos_token_id=_tokenizer.eos_token_id
			)

		logger.info('AI synthesis generation completed')

		output = _tokenizer.decode(gen_ids[0], skip_special_tokens=True)
		# Keep only the completion after the prompt if needed
		answer = output[len(_tokenizer.decode(input_ids[0], skip_special_tokens=True)):]
		answer = answer.strip() if answer else output.strip()
		
		logger.info('AI synthesis analysis completed successfully')
		
		return {
			'status': 'ok',
			'answer': answer,
			'meta': {
				'ar_elements_count': ar_count
			}
		}
	except Exception as e:
		logger.exception('AI synthesis failed')
		return {'status': 'error', 'error': f'AI synthesis failed: {e}'}

