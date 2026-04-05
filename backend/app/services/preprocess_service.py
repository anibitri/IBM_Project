import os
import logging
from typing import Dict, Any, Optional, List
from PIL import Image, ImageOps
from pathlib import Path

# PyMuPDF import (avoid crashing if wrong 'fitz' package is installed)
try:
    import pymupdf as fitz  # Preferred modern import name
    HAS_PYMUPDF = True
except Exception:
    try:
        import fitz  # Backward-compatible import name
        HAS_PYMUPDF = True
    except Exception:
        fitz = None
        HAS_PYMUPDF = False
        logging.warning("⚠️ PyMuPDF not installed or invalid fitz package detected. PDF image extraction unavailable.")

# Docling for PDF text extraction
try:
    from docling.document_converter import DocumentConverter
    doc_converter = DocumentConverter()
    HAS_DOCLING = True
except ImportError:
    HAS_DOCLING = False
    logging.warning("⚠️ Docling not installed. PDF text parsing unavailable.")

# Import services - using correct imports
from app.services.granite_vision_service import analyze_images  # Function
from app.services.granite_ai_service import ai_service  # Singleton instance
from app.services.ar_service import ar_service  # Singleton instance
from app.services.prompt_builder import DIAGRAM_CLASSIFICATION_PROMPT

logger = logging.getLogger(__name__)


def _posix(path: str) -> str:
    """Convert an OS-native path to forward-slash form for JSON / URL use.

    On Windows, os.path.join produces backslashes.  The mobile frontend
    parses image_path strings with split('uploads/'), so all paths that
    leave the server must use forward slashes regardless of the host OS.
    """
    return Path(path).as_posix() if path else path


class ProcessingCancelled(Exception):
    """Raised when a cancellation_event is set mid-pipeline."""


def _check_cancel(event):
    """Raise ProcessingCancelled if the event has been set."""
    if event is not None and event.is_set():
        raise ProcessingCancelled("Processing cancelled by client")


class PreprocessService:
    """
    Central preprocessing orchestrator for all document types.
    
    For PDFs:
    1. Extract images/diagrams → Process through Vision + AR
    2. Extract text → Send to AI for context
    3. Combine everything into comprehensive analysis
    
    For Images:
    1. Process through Vision + AR
    2. Generate AI summary
    """
    
    def __init__(self):
        self.supported_image_formats = {'png', 'jpg', 'jpeg', 'bmp', 'tiff', 'webp', 'gif'}
        self.supported_pdf_formats = {'pdf'}
        
        # Configuration
        self.min_image_size = (100, 100)  # Minimum image dimensions (filter icons/logos)
        self.max_images_per_pdf = 30  # Limit extracted images to prevent memory issues
        self.image_quality = 95  # JPEG quality for extracted images
        self.max_text_excerpt = 3000  # Max characters for AI context
    
    def preprocess_document(
        self,
        file_path: str,
        mock: bool = False,
        extract_ar: bool = True,
        generate_ai_summary: bool = True,
        cancellation_event=None,
    ) -> Dict[str, Any]:
        """
        Main preprocessing pipeline.
        
        Args:
            file_path: Path to document file
            mock: Use mock data (for testing)
            extract_ar: Extract AR components from images
            generate_ai_summary: Generate AI summary
        
        Returns:
            Dictionary with preprocessing results:
            - status: 'success' or 'error'
            - type: 'pdf' or 'image'
            - For PDFs: images, text_excerpt, ar, ai_summary
            - For Images: vision, ar, ai_summary
        """
        if not os.path.exists(file_path):
            return {
                'status': 'error',
                'error': 'File not found',
                'file_path': file_path
            }
        
        filename = os.path.basename(file_path)
        file_ext = filename.lower().split('.')[-1]
        
        logger.info(f"📋 Preprocessing: {filename}")
        
        try:
            # Route to appropriate handler based on file type
            if file_ext in self.supported_pdf_formats:
                return self._process_pdf(
                    file_path,
                    mock=mock,
                    extract_ar=extract_ar,
                    generate_ai_summary=generate_ai_summary,
                    cancellation_event=cancellation_event,
                )

            elif file_ext in self.supported_image_formats:
                return self._process_image(
                    file_path,
                    mock=mock,
                    extract_ar=extract_ar,
                    generate_ai_summary=generate_ai_summary,
                    cancellation_event=cancellation_event,
                )
            
            else:
                return {
                    'status': 'error',
                    'error': f'Unsupported format: .{file_ext}',
                    'supported_formats': list(self.supported_image_formats | self.supported_pdf_formats)
                }
        
        except Exception as e:
            logger.exception(f"Preprocessing failed for {filename}")
            return {
                'status': 'error',
                'error': str(e),
                'file_path': file_path
            }
    
    def _extract_images_from_pdf(self, pdf_path: str) -> List[Dict[str, Any]]:
        """
        Extract embedded raster images from a PDF using PyMuPDF.

        This method does not render full pages or cropped vector regions.
        It only extracts image objects that already exist in the PDF.

        Args:
            pdf_path: Path to PDF file

        Returns:
            List of dicts with image metadata:
            - path: Saved image path
            - page: Page number (1-indexed)
            - size: (width, height) tuple
            - index: Global image index
            - filename: Extracted image filename
        """
        logger.info("📸 Extracting embedded images from PDF...")

        if not HAS_PYMUPDF or fitz is None:
            logger.warning("PyMuPDF unavailable. Skipping PDF image extraction.")
            return []

        extracted_images = []

        # Create output directory for rendered pages
        pdf_name = Path(pdf_path).stem
        output_dir = os.path.join(
            os.path.dirname(pdf_path),
            f"{pdf_name}_extracted"
        )
        os.makedirs(output_dir, exist_ok=True)

        try:
            pdf_document = fitz.open(pdf_path)
            total_pages = len(pdf_document)
            pages_to_scan = min(total_pages, self.max_images_per_pdf)
            logger.info(f"  PDF has {total_pages} pages — scanning {pages_to_scan}")

            for page_num in range(pages_to_scan):
                try:
                    page = pdf_document[page_num]

                    # Extract embedded raster images directly.
                    try:
                        for img_info in page.get_images(full=True):
                            xref = img_info[0]
                            img_w, img_h = img_info[2], img_info[3]
                            if img_w < self.min_image_size[0] or img_h < self.min_image_size[1]:
                                continue
                            img_dict = pdf_document.extract_image(xref)
                            if not img_dict:
                                continue
                            ext = img_dict.get('ext', 'png')
                            img_bytes = img_dict['image']
                            idx = sum(1 for x in extracted_images if x['page'] == page_num + 1)
                            image_filename = f"page{page_num + 1}_img{idx}.{ext}"
                            image_path = os.path.join(output_dir, image_filename)
                            with open(image_path, 'wb') as f:
                                f.write(img_bytes)
                            extracted_images.append({
                                'path': image_path,
                                'page': page_num + 1,
                                'size': (img_w, img_h),
                                'index': len(extracted_images),
                                'filename': image_filename,
                            })
                            logger.info(
                                f"  ✓ Extracted embedded image from page {page_num + 1} "
                                f"({img_w}x{img_h})"
                            )
                    except Exception as e:
                        logger.warning(f"  Embedded image extraction error on page {page_num + 1}: {e}")

                except Exception as e:
                    logger.warning(f"  Failed to process page {page_num + 1}: {e}")
                    continue

            pdf_document.close()
            logger.info(f"✅ Extracted {len(extracted_images)} embedded image(s) from PDF")

        except Exception as e:
            logger.error(f"PDF image extraction failed: {e}")
            raise

        return extracted_images
    
    def _filter_extracted_images(self, images: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Filter extracted images using the Granite Vision model to keep only
        technical diagrams and discard photos, screenshots, logos, etc.

        Each image is sent to the vision model with a quick yes/no
        classification prompt.  Only images the model identifies as
        diagrams proceed to the full Vision + AR pipeline.

        Args:
            images: List of image metadata dicts (from _extract_images_from_pdf)

        Returns:
            Filtered list containing only likely-diagram images
        """
        if not images:
            return images

        from app.services.granite_vision_service import query_image

        # Keywords that signal diagram vs non-diagram in ambiguous answers
        YES_SIGNALS = {'yes', 'diagram', 'schematic', 'flowchart', 'UML', 'sequence', 'class', 'activity', 'state diagram',
                       'architecture', 'technical'}
        NO_SIGNALS  = {'no', 'photograph', 'photo', 'screenshot', 'picture',
                       'selfie', 'landscape', 'timetable', 'schedule', 'gantt'}

        filtered = []
        for img_info in images:
            try:
                answer = query_image(img_info['path'], DIAGRAM_CLASSIFICATION_PROMPT)
                answer_lower = answer.strip().lower()

                # Check for explicit yes/no first
                first_word = answer_lower.split()[0] if answer_lower else ''
                is_diagram = first_word.rstrip('.,;:!') == 'yes'

                if not is_diagram and first_word.rstrip('.,;:!') != 'no':
                    # Ambiguous answer — fall back to keyword matching
                    yes_count = sum(1 for w in YES_SIGNALS if w in answer_lower)
                    no_count  = sum(1 for w in NO_SIGNALS  if w in answer_lower)
                    is_diagram = yes_count > no_count

                if is_diagram:
                    filtered.append(img_info)
                    logger.debug(
                        f"    ✓ Diagram confirmed: {img_info['filename']} "
                        f"(vision: \"{answer[:80]}\")"
                    )
                else:
                    logger.info(
                        f"    ✗ Filtered non-diagram: {img_info['filename']} "
                        f"(vision: \"{answer[:80]}\")"
                    )

            except Exception as e:
                # If classification fails, keep the image to avoid data loss
                logger.warning(
                    f"    Could not classify {img_info['filename']}: {e} — keeping"
                )
                filtered.append(img_info)

        logger.info(
            f"  Vision filter: kept {len(filtered)}/{len(images)} images as diagrams"
        )
        return filtered

    def _extract_text_from_pdf(self, pdf_path: str) -> tuple:
        """
        Extract text from PDF using Docling.
        
        Args:
            pdf_path: Path to PDF file
        
        Returns:
            (full_text, excerpt) tuple
        """
        if not HAS_DOCLING:
            logger.warning("Docling not available for text extraction")
            return "", ""
        
        logger.info("📝 Extracting text with Docling...")
        
        try:
            result = doc_converter.convert(pdf_path)
            full_text = result.document.export_to_markdown()
            excerpt = full_text[:self.max_text_excerpt]
            
            logger.info(f"✓ Extracted {len(full_text)} characters of text")
            return full_text, excerpt
        
        except Exception as e:
            logger.error(f"Docling text extraction failed: {e}")
            raise
    
    def _process_pdf(
        self,
        file_path: str,
        mock: bool = False,
        extract_ar: bool = True,
        generate_ai_summary: bool = True,
        cancellation_event=None,
    ) -> Dict[str, Any]:
        """
        Process PDF document through full pipeline:
        1. Extract images/diagrams → Vision + AR analysis
        2. Extract text → AI context
        3. Combine into comprehensive analysis
        
        Args:
            file_path: Path to PDF file
            mock: Mock mode (unused, for future testing)
            extract_ar: Whether to extract AR components
            generate_ai_summary: Whether to generate AI summary
        
        Returns:
            Comprehensive analysis dictionary
        """
        logger.info("📄 Processing PDF document...")

        _check_cancel(cancellation_event)

        # Step 1: Extract images from PDF
        extracted_images = []
        try:
            extracted_images = self._extract_images_from_pdf(file_path)
        except Exception as e:
            logger.error(f"Image extraction failed: {e}")
            # Continue with text processing even if image extraction fails

        _check_cancel(cancellation_event)

        # Step 1b: Filter out non-diagram images (photos, screenshots, etc.)
        if extracted_images:
            extracted_images = self._filter_extracted_images(extracted_images)

        _check_cancel(cancellation_event)

        # Step 2: Extract text from PDF
        full_text = ""
        text_excerpt = ""
        
        if HAS_DOCLING:
            try:
                full_text, text_excerpt = self._extract_text_from_pdf(file_path)
            except Exception as e:
                logger.warning(f"Text extraction failed: {e}")
                text_excerpt = "PDF text extraction failed."
        else:
            text_excerpt = "PDF text extraction unavailable (Docling not installed)."
        
        # Step 3: Process each extracted image through Vision + AR pipeline
        image_analyses = []
        all_ar_components = []
        all_connections = []
        
        for img_info in extracted_images:
            _check_cancel(cancellation_event)

            img_path = img_info['path']
            page_num = img_info['page']

            logger.info(f"🔍 Analyzing image from page {page_num}...")
            
            try:
                # Vision analysis
                vision_result = analyze_images(img_path, task="ar_extraction")
                
                # Extract vision data
                vision_summary = ""
                vision_components = []
                diagram_type = 'other'
                if isinstance(vision_result, dict):
                    vision_summary = vision_result.get('analysis', {}).get('summary', '')
                    vision_components = vision_result.get('components', [])
                    diagram_type = vision_result.get('diagram_type', 'other')

                # AR extraction
                ar_components = []
                relationships = {}

                if extract_ar:
                    try:
                        ar_result = ar_service.extract_document_features(
                            img_path,
                            hints=[diagram_type] + vision_components
                        )
                        ar_components = ar_result.get('components', [])
                        relationships = ar_result.get('relationships', {})
                        
                        if ar_components:
                            all_ar_components.extend(ar_components)
                            all_connections.extend(ar_result.get('connections', []))
                    
                    except Exception as e:
                        logger.warning(f"AR extraction failed for page {page_num}: {e}")
                
                # Store analysis for this image
                image_analyses.append({
                    'page': page_num,
                    'image_path': _posix(img_path),
                    'image_filename': img_info['filename'],
                    'image_size': img_info['size'],
                    'vision': vision_result,
                    'vision_summary': vision_summary,
                    'ar_components': ar_components,
                    'ar_relationships': relationships,
                    'component_count': len(ar_components)
                })
                
                logger.info(f"  ✓ Page {page_num}: {len(ar_components)} components found")
            
            except Exception as e:
                logger.error(f"Failed to analyze image from page {page_num}: {e}")
                continue
        
        _check_cancel(cancellation_event)

        # Step 4: Generate comprehensive AI summary
        ai_summary = ""
        ai_result = {}

        if generate_ai_summary:
            logger.info("🤖 Generating comprehensive AI summary...")
            
            try:
                # Combine all vision summaries
                combined_vision_text = "\n\n".join([
                    f"Page {img['page']} - {img['vision_summary']}"
                    for img in image_analyses
                    if img.get('vision_summary')
                ])
                
                # Generate AI summary with full context
                ai_result = ai_service.analyze_context(
                    text_excerpt=text_excerpt,
                    vision={'analysis': {'summary': combined_vision_text}},
                    components=all_ar_components[:20],  # Limit to first 20 for token management
                    context_type='general',
                    connections=all_connections[:30],
                )
                
                ai_summary = ai_result.get('answer', '')
                logger.info("✓ AI summary generated")
            
            except Exception as e:
                logger.warning(f"AI summary generation failed: {e}")
                ai_summary = "AI summary unavailable."
                ai_result = {
                    'status': 'error',
                    'error': str(e),
                    'answer': ai_summary
                }
        
        # Step 5: Compile comprehensive result
        return {
            'status': 'success',
            'type': 'pdf',
            'file_path': _posix(file_path),

            # Text data
            'text_excerpt': text_excerpt,
            'full_text': full_text,
            'text_available': bool(full_text),
            
            # Image data (per-page analysis)
            'images': image_analyses,
            'image_count': len(extracted_images),
            'extracted_image_paths': [_posix(img['path']) for img in extracted_images],
            
            # AR data (combined from all images)
            'ar': {
                'status': 'success',
                'components': all_ar_components,
                'componentCount': len(all_ar_components),
                'connections': all_connections,
                'images_processed': len(image_analyses)
            },
            
            # AI summary (comprehensive)
            'ai_summary': ai_summary,
            'ai': ai_result,
            
            # Metadata
            'meta': {
                'pages_with_images': len(extracted_images),
                'total_components': len(all_ar_components),
                'text_length': len(full_text),
                'has_text': bool(full_text),
                'has_images': len(extracted_images) > 0,
                'has_docling': HAS_DOCLING
            }
        }
    
    def _process_image(
        self,
        file_path: str,
        mock: bool = False,
        extract_ar: bool = True,
        generate_ai_summary: bool = True,
        cancellation_event=None,
    ) -> Dict[str, Any]:
        """
        Process single image document through pipeline:
        1. Vision analysis
        2. AR component extraction
        3. AI summary generation
        
        Args:
            file_path: Path to image file
            mock: Mock mode (unused)
            extract_ar: Whether to extract AR components
            generate_ai_summary: Whether to generate AI summary
        
        Returns:
            Analysis dictionary
        """
        logger.info("🖼️ Processing image...")

        try:
            _check_cancel(cancellation_event)

            # Validate image
            try:
                with Image.open(file_path) as img:
                    img = ImageOps.exif_transpose(img)
                    img.load()
                    image_size = img.size
                    image_mode = img.mode
            except Exception as e:
                return {
                    'status': 'error',
                    'type': 'image',
                    'error': f'Invalid image: {str(e)}',
                    'file_path': file_path
                }
            
            # Step 1: Vision Analysis
            logger.info("🔍 Running vision analysis...")
            vision_result = analyze_images(file_path, task="ar_extraction")
            
            if not isinstance(vision_result, dict):
                vision_result = {
                    'status': 'error',
                    'error': 'Invalid vision result',
                    'analysis': {'summary': ''},
                    'components': []
                }
            
            vision_summary = vision_result.get('analysis', {}).get('summary', '')
            vision_components = vision_result.get('components', [])
            diagram_type = vision_result.get('diagram_type', 'other')

            _check_cancel(cancellation_event)

            # Step 2: AR Extraction
            ar_result = {}
            ar_components = []
            relationships = {}

            if extract_ar:
                logger.info("🎯 Extracting AR components...")
                try:
                    ar_result = ar_service.extract_document_features(
                        file_path,
                        hints=[diagram_type] + vision_components
                    )
                    ar_components = ar_result.get('components', [])
                    relationships = ar_result.get('relationships', {})
                    
                    ar_result = {
                        'status': 'success',
                        'components': ar_components,
                        'componentCount': len(ar_components),
                        'connections': ar_result.get('connections', []),
                        'relationships': relationships
                    }
                    
                    logger.info(f"✓ Extracted {len(ar_components)} components")
                
                except Exception as e:
                    logger.warning(f"AR extraction failed: {e}")
                    ar_result = {
                        'status': 'error',
                        'error': str(e),
                        'components': [],
                        'componentCount': 0
                    }
            
            _check_cancel(cancellation_event)

            # Step 3: AI Summary
            ai_summary = ""
            ai_result = {}

            if generate_ai_summary:
                logger.info("🤖 Generating AI summary...")
                try:
                    # Infer document type
                    document_type = self._infer_document_type(vision_summary)
                    
                    ai_result = ai_service.analyze_context(
                        vision=vision_result,
                        components=ar_components,
                        context_type=document_type,
                        connections=relationships.get('connections', []) if isinstance(relationships, dict) else [],
                    )
                    ai_summary = ai_result.get('answer', vision_summary)
                    logger.info("✓ AI summary generated")
                
                except Exception as e:
                    logger.warning(f"AI summary failed: {e}")
                    ai_summary = vision_summary
                    ai_result = {
                        'status': 'error',
                        'error': str(e),
                        'answer': vision_summary
                    }
            
            return {
                'status': 'success',
                'type': 'image',
                'file_path': _posix(file_path),
                
                # Vision data
                'vision': vision_result,
                
                # AR data
                'ar': ar_result,
                
                # AI data
                'ai': ai_result,
                'ai_summary': ai_summary,
                'text_excerpt': vision_summary,
                
                # Image list (single image, formatted like PDF)
                'images': [{
                    'page': 1,
                    'image_path': _posix(file_path),
                    'image_filename': os.path.basename(file_path),
                    'image_size': image_size,
                    'vision': vision_result,
                    'vision_summary': vision_summary,
                    'ar_components': ar_components,
                    'ar_relationships': relationships,
                    'component_count': len(ar_components)
                }],
                
                # Metadata
                'meta': {
                    'width': image_size[0],
                    'height': image_size[1],
                    'mode': image_mode,
                    'aspect_ratio': image_size[0] / image_size[1] if image_size[1] > 0 else 0,
                    'component_count': len(ar_components)
                }
            }
        
        except Exception as e:
            logger.exception("Image processing failed")
            return {
                'status': 'error',
                'type': 'image',
                'error': str(e),
                'file_path': file_path
            }
    
    def _infer_document_type(self, vision_summary: str) -> str:
        """
        Infer document type from vision analysis summary.
        Used to provide better AI context.
        
        Args:
            vision_summary: Vision model's description of the image
        
        Returns:
            Document type: 'software', 'electronics', 'mechanical', 'network', or 'general'
        """
        if not vision_summary:
            return 'general'
        
        summary_lower = vision_summary.lower()
        
        # Software-related keywords
        if any(term in summary_lower for term in [
            'uml', 'class diagram', 'sequence diagram', 'flowchart', 'architecture',
            'software', 'code', 'api', 'database', 'algorithm', 'data flow',
            'state machine', 'entity relationship', 'use case'
        ]):
            return 'software'
        
        # Electronics/Hardware keywords
        if any(term in summary_lower for term in [
            'circuit', 'pcb', 'schematic', 'electronic', 'resistor',
            'capacitor', 'transistor', 'board', 'wiring', 'diode',
            'voltage', 'current', 'power supply', 'oscillator'
        ]):
            return 'electronics'
        
        # Mechanical keywords
        if any(term in summary_lower for term in [
            'mechanical', 'blueprint', 'cad', 'assembly', 'dimension',
            'engineering drawing', 'part', 'component', 'isometric',
            'cross section', 'exploded view', 'tolerance'
        ]):
            return 'mechanical'
        
        # Network/Infrastructure keywords
        if any(term in summary_lower for term in [
            'network', 'topology', 'server', 'router', 'infrastructure',
            'cloud', 'deployment', 'firewall', 'load balancer',
            'switch', 'gateway', 'dns', 'vpn'
        ]):
            return 'network'
        
        return 'general'


# Singleton instance - this is what other modules should import
preprocess_service = PreprocessService()


# Exported function for backward compatibility
def preprocess_document(*args, **kwargs):
    """
    Legacy function wrapper for backward compatibility.
    Use preprocess_service.preprocess_document() directly in new code.
    """
    return preprocess_service.preprocess_document(*args, **kwargs)