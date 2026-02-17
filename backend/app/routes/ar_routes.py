from flask import Blueprint, request, jsonify
import logging
import traceback

from app.services.ar_service import ar_service
from app.services.granite_vision_service import analyze_images
from app.utils.shared_utils import resolve_file_path

ar_bp = Blueprint('ar', __name__)
logger = logging.getLogger(__name__)


@ar_bp.route('/generate', methods=['POST'])
def generate_ar_overlay():
    """
    Generate AR overlay components from image.
    
    Accepts JSON:
    {
        "stored_name": "uuid.png",  // Required: file identifier
        "hints": ["component1", "component2"],  // Optional: component hints
        "use_vision": true  // Optional: auto-extract hints from vision (default: true)
    }
    """
    try:
        data = request.get_json(silent=True) or {}
        stored_name = data.get('stored_name')
        file_path = data.get('file_path')
        manual_hints = data.get('hints', [])
        use_vision = data.get('use_vision', True)
        
        # Resolve file path
        resolved_path, error = resolve_file_path(stored_name, file_path)
        if error:
            return jsonify(error[0]), error[1]
        
        logger.info(f"🎯 AR extraction: {resolved_path}")
        
        # Step 1: Extract hints from vision if requested
        ar_hints = list(manual_hints) if manual_hints else []
        vision_analysis = None
        
        if use_vision:
            try:
                vision_result = analyze_images(resolved_path, task="ar_extraction")
                
                if isinstance(vision_result, dict) and vision_result.get('status') != 'error':
                    vision_analysis = vision_result.get('analysis', {})
                    vision_components = vision_result.get('components', [])
                    
                    # Merge vision hints with manual hints
                    if vision_components:
                        ar_hints.extend(vision_components)
                        # Deduplicate while preserving order
                        seen = set()
                        ar_hints = [x for x in ar_hints if not (x.lower() in seen or seen.add(x.lower()))]
                    
                    logger.info(f"💡 Vision hints: {ar_hints[:10]}")  # Show first 10
            
            except Exception as e:
                logger.warning(f"Vision hint extraction failed: {e}")
                # Continue with manual hints only
        
        # Step 2: Extract AR components
        components = ar_service.extract_document_features(resolved_path, hints=ar_hints)
        
        # Step 3: Analyze relationships
        relationships = {}
        if components:
            relationships = ar_service.analyze_component_relationships(components)
        
        logger.info(f"✅ Extracted {len(components)} AR components")
        
        return jsonify({
            'status': 'success',
            'components': components,
            'componentCount': len(components),
            'relationships': relationships,
            'hints': ar_hints,
            'vision_analysis': vision_analysis,
            'file': {
                'path': resolved_path
            }
        }), 200
    
    except Exception as e:
        logger.exception("AR generation failed")
        return jsonify({
            'status': 'error',
            'error': str(e),
            'details': traceback.format_exc()
        }), 500


@ar_bp.route('/analyze-relationships', methods=['POST'])
def analyze_relationships():
    """
    Analyze spatial relationships between components.
    
    Accepts JSON:
    {
        "components": [...],  // Required: array of component objects
    }
    """
    try:
        data = request.get_json(silent=True) or {}
        components = data.get('components', [])
        
        if not components:
            return jsonify({
                'status': 'error',
                'error': 'No components provided'
            }), 400
        
        logger.info(f"🔗 Analyzing relationships for {len(components)} components")
        
        # Analyze relationships
        relationships = ar_service.analyze_component_relationships(components)
        
        return jsonify({
            'status': 'success',
            'relationships': relationships,
            'componentCount': len(components)
        }), 200
    
    except Exception as e:
        logger.exception("Relationship analysis failed")
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500


@ar_bp.route('/extract-from-multiple', methods=['POST'])
def extract_from_multiple():
    """
    Extract AR components from multiple images.
    Useful for batch processing.
    
    Accepts JSON:
    {
        "stored_names": ["file1.png", "file2.png"],  // Required
        "hints": ["component1"],  // Optional: shared hints
        "use_vision": true  // Optional
    }
    """
    try:
        data = request.get_json(silent=True) or {}
        stored_names = data.get('stored_names', [])
        shared_hints = data.get('hints', [])
        use_vision = data.get('use_vision', True)
        
        if not stored_names:
            return jsonify({
                'status': 'error',
                'error': 'stored_names array is required'
            }), 400
        
        logger.info(f"🎯 Batch AR extraction: {len(stored_names)} files")
        
        results = []
        all_components = []
        
        for stored_name in stored_names:
            try:
                # Resolve file
                resolved_path, error = resolve_file_path(stored_name=stored_name)
                if error:
                    results.append({
                        'file': stored_name,
                        'status': 'error',
                        'error': error[0]['error']
                    })
                    continue
                
                # Get vision hints if needed
                hints = list(shared_hints)
                if use_vision:
                    try:
                        vision_result = analyze_images(resolved_path, task="ar_extraction")
                        if isinstance(vision_result, dict):
                            vision_comps = vision_result.get('components', [])
                            hints.extend(vision_comps)
                    except:
                        pass
                
                # Extract components
                components = ar_service.extract_document_features(resolved_path, hints=hints)
                all_components.extend(components)
                
                results.append({
                    'file': stored_name,
                    'status': 'success',
                    'componentCount': len(components),
                    'components': components
                })
                
            except Exception as e:
                logger.error(f"Failed to process {stored_name}: {e}")
                results.append({
                    'file': stored_name,
                    'status': 'error',
                    'error': str(e)
                })
        
        # Analyze relationships across all components
        combined_relationships = {}
        if all_components:
            combined_relationships = ar_service.analyze_component_relationships(all_components)
        
        return jsonify({
            'status': 'success',
            'results': results,
            'totalComponents': len(all_components),
            'combinedRelationships': combined_relationships
        }), 200
    
    except Exception as e:
        logger.exception("Batch AR extraction failed")
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500


@ar_bp.route('/health', methods=['GET'])
def health_check():
    """Check if AR model is loaded"""
    from app.services.model_manager import manager
    
    is_loaded = manager.ar_model is not None
    
    return jsonify({
        'status': 'healthy' if is_loaded else 'degraded',
        'ar_model_loaded': is_loaded
    }), 200