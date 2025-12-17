import os
import uuid
import logging
from typing import Optional, List, Dict, Tuple
from PIL import Image
from io import BytesIO

# Services
from services.granite_vision_service import analyze_images
from services.granite_ai_service import analyze_context as ai_analyze
from services.ar_service import extract_document_features
# Updated import: PyPDF2 is deprecated, usage remains mostly the same
from pypdf import PdfReader 

logger = logging.getLogger(__name__)

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
UPLOADS_DIR = os.path.join(BASE_DIR, 'static', 'uploads')
DERIVED_DIR = os.path.join(UPLOADS_DIR, 'derived')
os.makedirs(DERIVED_DIR, exist_ok=True)

IMG_EXTS = {'.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp'}

def _save_pil_image(img: Image.Image, stem: str) -> str:
    fname = f'{stem}_{uuid.uuid4().hex}.png'
    out_path = os.path.join(DERIVED_DIR, fname)
    try:
        img.save(out_path, format='PNG')
        return out_path
    except Exception as e:
        logger.warning(f'Failed to save derived image: {e}')
        raise

def _process_single_image(img_path: str, mock: bool = False) -> Dict:
    """
    Helper to run the "Hybrid" AR flow on a single image path:
    1. Get Image Dimensions (Vital for Unity AR scaling)
    2. Granite Vision -> Finds Components & Bounding Boxes
    3. SAM (AR Service) -> Uses Granite boxes as prompts to create perfect masks
    """
    try:
        # 1. Load and Measure
        with Image.open(img_path) as pil_img:
            img = pil_img.convert('RGB')
            width, height = img.size # Unity needs these to aspect-ratio match the 3D plane

        # 2. Granite Analysis (The "Brain")
        # Ensure analyze_images returns a JSON with 'components' and 'bboxes'
        vision_res = analyze_images([img], task="ar_extraction", mock=mock)
        
        # 3. AR Generation (The "Visuals")
        # Pass the Granite 'components' (bboxes) into the AR service to guide SAM
        ar_hints = vision_res.get('components', [])
        ar_elems = extract_document_features(img_path, hints=ar_hints) or []

        return {
            'width': width,
            'height': height,
            'vision_response': vision_res,
            'ar_elements': ar_elems
        }
    except Exception as e:
        logger.error(f"Failed to process image {img_path}: {e}")
        return {}

def _extract_pdf_text(file_path: str, max_chars: int = 200000) -> str:
    try:
        reader = PdfReader(file_path)
        parts = []
        total = 0
        for page in reader.pages:
            txt = page.extract_text() or ""
            if txt:
                parts.append(txt)
                total += len(txt)
            if total > max_chars:
                break
        text = "\n".join(parts)
        return text[:max_chars]
    except Exception as e:
        logger.warning(f'PDF text extraction failed: {e}')
        return ""

def _extract_images_from_pdf(file_path: str, max_pages: int = 5, max_images: int = 6) -> List[Image.Image]:
    """
    Refined extraction. 
    Note: For AR, usually we want to render the *whole page* as an image 
    rather than extracting embedded images, but sticking to your current logic for now.
    """
    images: List[Image.Image] = []
    
    # Try PyMuPDF (fitz) first - superior for image handling
    try:
        import fitz 
        doc = fitz.open(file_path)
        for page_index in range(min(len(doc), max_pages)):
            page = doc.load_page(page_index)
            # Only grab large images likely to be diagrams (ignore icons)
            image_list = page.get_images(full=True)
            for img_info in image_list:
                xref = img_info[0]
                base = doc.extract_image(xref)
                img_bytes = base["image"]
                pil_img = Image.open(BytesIO(img_bytes)).convert('RGB')
                
                # Filter small icons
                if pil_img.width > 200 and pil_img.height > 200:
                    images.append(pil_img)
                
                if len(images) >= max_images: break
            if len(images) >= max_images: break
        doc.close()
        if images: return images
    except ImportError:
        logger.info("PyMuPDF not found, falling back to pypdf.")
    except Exception as e:
        logger.debug(f'PyMuPDF extraction failed: {e}')

    # pypdf Fallback
    try:
        reader = PdfReader(file_path)
        for page in reader.pages[:max_pages]:
            for image_file_object in page.images:
                try:
                    pil_img = Image.open(BytesIO(image_file_object.data)).convert('RGB')
                    if pil_img.width > 200: 
                        images.append(pil_img)
                    if len(images) >= max_images: break
                except Exception: continue
    except Exception as e:
        logger.debug(f'pypdf image extraction failed: {e}')

    return images

def preprocess_document(file_path: str, mock: Optional[bool] = None) -> Dict:
    try:
        logger.info(f'Starting preprocessing for document: {file_path}')
        ext = os.path.splitext(file_path)[1].lower()
        is_image = ext in IMG_EXTS
        is_pdf = ext == '.pdf'

        if not (is_image or is_pdf):
            return {'status': 'error', 'error': f'Unsupported file type: {ext}'}

        if is_image:
            logger.info('Processing as image document')
            
            # Use the new helper to get dimensions + Hybrid AR analysis
            processed_data = _process_single_image(file_path, mock=mock)
            
            vision_res = processed_data.get('vision_response', {})
            ar_elems = processed_data.get('ar_elements', [])
            
            # Pass both text AND spatial context to the final AI summary
            vision_ctx = {
                'vision_answer': vision_res.get('answer') or "",
                'ar_elements': ar_elems, # AI now knows what AR found
                'components': vision_res.get('components', []) # AI knows component names
            }
            
            text_excerpt = vision_res.get('text_excerpt') or ""
            ai_res = ai_analyze(text_excerpt=text_excerpt, vision=vision_ctx, mock=mock)

            return {
                'status': 'ok',
                'kind': 'image',
                'meta': {
                    'width': processed_data.get('width'),
                    'height': processed_data.get('height')
                },
                'vision': vision_res,
                'ar': { 'status': 'ok', 'elements': ar_elems },
                'ai': ai_res
            }

        if is_pdf:
            # 1. Text Extraction
            text = _extract_pdf_text(file_path)

            # 2. Initial AI
            ai_initial = ai_analyze(text_excerpt=text, vision={}, mock=mock)

            # 3. Image Extraction & Hybrid Analysis
            extracted_imgs = _extract_images_from_pdf(file_path)
            per_image_results = []
            
            all_ar_elems = []
            
            for img in extracted_imgs:
                saved_path = _save_pil_image(img, stem=os.path.splitext(os.path.basename(file_path))[0])
                
                # Run the full Hybrid flow on this extracted image
                p_data = _process_single_image(saved_path, mock=mock)
                
                per_image_results.append({
                    'path': saved_path,
                    'meta': {'width': p_data.get('width'), 'height': p_data.get('height')},
                    'vision': p_data.get('vision_response'),
                    'ar': p_data.get('ar_elements')
                })
                all_ar_elems.extend(p_data.get('ar_elements', []))

            # 4. Final AI Summary
            vision_summary = "\n".join(
                res['vision'].get('answer', '') for res in per_image_results if res['vision']
            )

            ai_final = ai_analyze(
                text_excerpt=text,
                vision={ 'vision_answer': vision_summary, 'ar_elements': all_ar_elems },
                mock=mock
            )

            return {
                'status': 'ok',
                'kind': 'pdf',
                'text_chars': len(text),
                'vision_per_image': per_image_results,
                'ai_initial': ai_initial,
                'ai_final': ai_final
            }

        return {'status': 'error', 'error': 'Unrecognized document type'}
    except Exception as e:
        logger.exception('Preprocessing failed')
        return {'status': 'error', 'error': f'Preprocessing failed: {e}'}