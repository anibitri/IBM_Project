import os
import uuid
import logging
from typing import Optional, List, Dict
from PIL import Image
from io import BytesIO

from services.granite_vision_service import analyze_images  # use images-only analyzer
from services.granite_ai_service import analyze_context as ai_analyze
from services.ar_service import extract_document_features
from PyPDF2 import PdfReader  # for text and fallback image extraction

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

def _merge_ar_elements(paths: List[str]) -> List[Dict]:
    merged = []
    for p in paths:
        try:
            merged.extend(extract_document_features(p) or [])
        except Exception as e:
            logger.warning(f'AR extraction failed for {p}: {e}')
    return merged

def _extract_pdf_text(file_path: str, max_chars: int = 12000) -> str:
    """
    Extract raw text from a PDF using PyPDF2. Returns possibly-empty string.
    """
    try:
        reader = PdfReader(file_path)
        parts = []
        total = 0
        for page in reader.pages:
            try:
                txt = page.extract_text() or ""
            except Exception:
                txt = ""
            if txt:
                parts.append(txt)
                total += len(txt)
            if total > max_chars:
                break
        text = "\n".join(parts)
        return text[:max_chars]
    except Exception as e:
        logger.warning(f'PDF text extraction failed via PyPDF2: {e}')
        return ""

def _extract_images_from_pdf(file_path: str, max_pages: int = 5, max_images: int = 6) -> List[Image.Image]:
    """
    Extract embedded images from a PDF without poppler/pdf2image.
    - Tries PyMuPDF (fitz) first; falls back to PyPDF2 XObject traversal.
    Returns a list of PIL.Image.
    """
    images: List[Image.Image] = []
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(file_path)
        for page_index in range(min(len(doc), max_pages)):
            page = doc.load_page(page_index)
            for img in page.get_images(full=True):
                xref = img[0]
                try:
                    base = doc.extract_image(xref)
                    img_bytes = base.get("image", None)
                    if not img_bytes:
                        continue
                    pil_img = Image.open(BytesIO(img_bytes)).convert('RGB')
                    images.append(pil_img)
                    if len(images) >= max_images:
                        break
                except Exception as e:
                    logger.debug(f'PyMuPDF image extract failed on page {page_index}, xref {xref}: {e}')
            if len(images) >= max_images:
                break
        doc.close()
        if images:
            logger.info(f'Extracted {len(images)} embedded images via PyMuPDF.')
            return images
    except Exception as e:
        logger.debug(f'PyMuPDF not available or failed: {e}')

    # PyPDF2 fallback
    try:
        reader = PdfReader(file_path)
        for page_i, page in enumerate(reader.pages[:max_pages]):
            try:
                resources = page.get("/Resources")
                if not resources:
                    continue
                xobjects = resources.get("/XObject")
                if not xobjects:
                    continue
                for name, xobj in xobjects.items():
                    try:
                        obj = xobj.get_object()
                        subtype = obj.get("/Subtype")
                        if subtype and subtype == "/Image":
                            data = obj.get_data()
                            pil_img = None
                            # Best-effort decodes
                            try:
                                pil_img = Image.open(BytesIO(data)).convert('RGB')
                            except Exception:
                                pil_img = None
                            if pil_img:
                                images.append(pil_img)
                                if len(images) >= max_images:
                                    break
                    except Exception as e:
                        logger.debug(f'PyPDF2 XObject image extract failed: {e}')
            except Exception as e:
                logger.debug(f'PyPDF2 page parse failed: {e}')
        if images:
            logger.info(f'Extracted {len(images)} embedded images via PyPDF2 fallback.')
    except Exception as e:
        logger.debug(f'PyPDF2 image extraction failed: {e}')

    return images

def preprocess_document(file_path: str, mock: Optional[bool] = None) -> Dict:
    """
    Orchestrate preprocessing:
    - Image: Vision -> AR -> AI (with vision + optional text from vision)
    - PDF: Text extraction -> AI (initial) -> Image extraction -> Vision per image -> AR -> AI (final)
    Returns a structured dict describing the pipeline outputs.
    """
    try:
        logger.info(f'Starting preprocessing for document: {file_path}')
        ext = os.path.splitext(file_path)[1].lower()
        is_image = ext in IMG_EXTS
        is_pdf = ext == '.pdf'

        if not (is_image or is_pdf):
            return {'status': 'error', 'error': f'Unsupported file type: {ext}'}

        if is_image:
            logger.info('Processing as image document')
            # Load single image and analyze
            img = Image.open(file_path).convert('RGB')
            logger.info('Starting vision analysis on image')
            vision_res = analyze_images([img], mock=mock)
            logger.info('Vision analysis completed.')
            ar_elems = []
            try:
                ar_elems = extract_document_features(file_path) or []
            except Exception as e:
                logger.warning(f'AR extraction on image failed: {e}')

            text_excerpt = vision_res.get('text_excerpt') or ""  # if provided by upstream model
            vision_ctx = {
                'vision_answer': vision_res.get('answer') or "",
                'ar_elements': ar_elems
            }
            ai_res = ai_analyze(text_excerpt=text_excerpt, vision=vision_ctx, mock=mock)

            return {
                'status': 'ok',
                'kind': 'image',
                'vision': vision_res,
                'ar': { 'status': 'ok', 'elements': ar_elems },
                'ai': ai_res
            }

        if is_pdf:
            # 1) Text extraction
            logger.info('Starting PDF text extraction')
            text = _extract_pdf_text(file_path) or ""
            logger.info(f'Extracted {len(text)} characters of text from PDF.')

            # 2) Initial AI on text-only
            logger.info('Starting initial AI synthesis on extracted text')
            ai_initial = ai_analyze(text_excerpt=text, vision={}, mock=mock)
            logger.info('Initial AI synthesis completed.')

            # 3) Extract embedded images (no poppler)
            logger.info('Starting embedded image extraction from PDF')
            extracted_imgs = _extract_images_from_pdf(file_path, max_pages=5, max_images=6) or []
            logger.info(f'Extracted {len(extracted_imgs)} images from PDF for vision analysis.')

            # Save and analyze each image
            saved_paths: List[str] = []
            for img in extracted_imgs:
                try:
                    saved_paths.append(_save_pil_image(img, stem=os.path.splitext(os.path.basename(file_path))[0]))
                except Exception:
                    continue

            per_image_vision = []
            for img_path in saved_paths:
                try:
                    pil = Image.open(img_path).convert('RGB')
                    per_image_vision.append({
                        'path': img_path,
                        'analysis': analyze_images([pil], mock=mock)
                    })
                except Exception as e:
                    logger.warning(f'Vision analysis failed for derived image {img_path}: {e}')

            # 4) AR on derived images
            ar_elems = _merge_ar_elements(saved_paths)

            # 5) Final AI synthesis using text + concatenated vision summaries
            vision_summary = "\n\n".join(
                (v.get('analysis', {}) or {}).get('answer', '')
                for v in per_image_vision
                if isinstance(v, dict)
            )[:3000]

            ai_final = ai_analyze(
                text_excerpt=text,
                vision={ 'vision_answer': vision_summary, 'ar_elements': ar_elems },
                mock=mock
            )

            return {
                'status': 'ok',
                'kind': 'pdf',
                'text_chars': len(text),
                'vision_per_image': per_image_vision,
                'ar': { 'status': 'ok', 'elements': ar_elems },
                'ai_initial': ai_initial,
                'ai_final': ai_final
            }

        return {'status': 'error', 'error': 'Unrecognized document type'}
    except Exception as e:
        logger.exception('Preprocessing failed')
        return {'status': 'error', 'error': f'Preprocessing failed: {e}'}
