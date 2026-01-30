import os
import logging
from PIL import Image

# Docling
try:
    from docling.document_converter import DocumentConverter
    doc_converter = DocumentConverter()
    HAS_DOCLING = True
except ImportError:
    HAS_DOCLING = False
    logging.warning("docling not installed. PDF parsing will be limited.")

# Services
from app.services.granite_vision_service import analyze_images
from app.services.granite_ai_service import analyze_context as ai_analyze


def preprocess_document(file_path, mock=False):
    """
    Central preprocessing pipeline.
    - PDFs: parse -> AI summarize
    - Images: run vision synchronously (safe)
    """
    filename = os.path.basename(file_path)
    file_ext = filename.lower().split('.')[-1]

    logging.info(f"Preprocessing: {file_path}")

    try:
        # -----------------------------
        # PATH A: PDF Processing
        # -----------------------------
        if file_ext == "pdf":
            if not HAS_DOCLING:
                return {
                    "status": "error",
                    "type": "pdf",
                    "message": "PDF parser missing"
                }

            logging.info("Using Docling to parse PDF...")
            result = doc_converter.convert(file_path)

            markdown_text = result.document.export_to_markdown()
            excerpt = markdown_text[:2000]

            ai_result = ai_analyze(text_excerpt=excerpt)
            summary = ai_result.get("answer", "") if isinstance(ai_result, dict) else ""

            return {
                "status": "success",
                "type": "pdf",
                "text_excerpt": excerpt,
                "ai_summary": summary,
                "ai": ai_result
            }

        # -----------------------------
        # PATH B: Image Processing
        # -----------------------------
        elif file_ext in {"png", "jpg", "jpeg", "bmp", "tiff", "webp"}:
            # Validate image safely
            try:
                with Image.open(file_path) as img:
                    img.load()
            except Exception as e:
                return {
                    "status": "error",
                    "type": "image",
                    "message": f"Invalid image: {str(e)}"
                }

            logging.info("Running vision analysis synchronously...")

            vision_result = analyze_images(file_path)

            if not isinstance(vision_result, dict):
                raise RuntimeError("Vision service returned invalid result")

            vision_summary = vision_result.get("analysis", {}).get(
                "summary", "No summary generated."
            )

            return {
                "status": "success",
                "type": "image",
                "text_excerpt": "Image processed successfully.",
                "ai_summary": vision_summary,
                "vision": vision_result
            }

        # -----------------------------
        # UNSUPPORTED FORMAT
        # -----------------------------
        else:
            return {
                "status": "error",
                "message": f"Unsupported format: .{file_ext}"
            }

    except Exception as e:
        logging.exception("Preprocessing failed")
        return {
            "status": "error",
            "message": str(e)
        }
