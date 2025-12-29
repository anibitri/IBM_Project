import os
import logging
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

# NEW: Import Docling
from docling.document_converter import DocumentConverter

# Import AI services
from app.services.granite_vision_service import analyze_images
from app.services.granite_ai_service import analyze_context as ai_analyze

# Thread pool for background tasks
executor = ThreadPoolExecutor(max_workers=1)
doc_converter = DocumentConverter() # Initialize Docling

def _run_background_vision_task(file_path):
    """Runs Granite Vision on GPU in background."""
    try:
        logging.info(f"BACKGROUND: Starting Vision Analysis for {os.path.basename(file_path)}...")
        result = analyze_images(file_path)
        summary = result.get('analysis', {}).get('summary', 'No summary.')
        logging.info(f"BACKGROUND: Vision Complete. Summary: {summary[:50]}...")
    except Exception as e:
        logging.error(f"BACKGROUND ERROR: {e}")

def preprocess_document(file_path, mock=False):
    filename = os.path.basename(file_path)
    file_ext = filename.lower().split('.')[-1]
    
    logging.info(f"Preprocessing: {file_path}")

    try:
        # --- PATH A: PDF Processing (Using IBM DOCLING) ---
        if file_ext == 'pdf':
            logging.info("Using Docling to parse PDF structure...")
            
            # Docling reads the PDF and converts it to Markdown (Markdown is native language for LLMs!)
            result = doc_converter.convert(file_path)
            markdown_text = result.document.export_to_markdown()
            
            # Send the clean Markdown to the Chat Model for summarization
            summary = ai_analyze(text=markdown_text)

            return {
                "status": "success",
                "type": "pdf",
                "text_excerpt": markdown_text[:2000], # Store clean markdown
                "ai_summary": summary
            }

        # --- PATH B: Image Processing (Background GPU) ---
        elif file_ext in ['png', 'jpg', 'jpeg', 'bmp', 'tiff']:
            try:
                with Image.open(file_path) as img:
                    img.verify() 
            except Exception as e:
                return {"status": "error", "message": f"Invalid image: {str(e)}"}

            # Fire background vision task
            executor.submit(_run_background_vision_task, file_path)
            
            return {
                "status": "success",
                "type": "image",
                "text_excerpt": "Image uploaded. Analysis running in background.",
                "ai_summary": "Pending...", 
                "vision_data": {"status": "processing"}
            }

        else:
            return {"status": "error", "message": "Unsupported format"}

    except Exception as e:
        logging.error(f"Preprocessing failed: {e}")
        return {"status": "error", "message": str(e)}