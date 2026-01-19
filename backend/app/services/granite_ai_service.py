import torch
from app.services.model_manager import manager

def analyze_context(message, context=""):
    """
    Uses the pre-loaded Quantized/Float16 Granite Chat model from RAM.
    """
    # 1. Safety Check
    if not manager.chat_model or not manager.chat_tokenizer:
        return "Error: Chat Model not loaded in ModelManager."

    try:
        print(f"--- AI SERVICE: Generating response for: {message[:30]}... ---")

        # 2. Construct Prompt (Granite Instruct Format)
        # This specific format helps the model understand it's a chat
        input_text = (
            f"Context: {context}\n"
            f"Question: {message}\n"
            f"Answer:"
        )

        # 3. Tokenize & Move to Device (GPU/MPS)
        input_ids = manager.chat_tokenizer(
            input_text, 
            return_tensors="pt"
        ).input_ids.to(manager.device)

        # 4. Generate Response
        with torch.no_grad():
            output_ids = manager.chat_model.generate(
                input_ids,
                max_new_tokens=150,
                do_sample=True,
                temperature=0.7,
                top_p=0.9
            )

        # 5. Decode
        generated_response = manager.chat_tokenizer.decode(
            output_ids[0], 
            skip_special_tokens=True
        )

        # 6. Cleanup (Remove the prompt from the answer)
        # Often the model returns "Context: ... Question: ... Answer: The valve is..."
        # We only want "The valve is..."
        if "Answer:" in generated_response:
            final_answer = generated_response.split("Answer:")[-1].strip()
        else:
            final_answer = generated_response

        return final_answer

    except Exception as e:
        print(f"❌ ERROR in AI Service: {e}")
        return f"I encountered an error processing your request: {str(e)}"