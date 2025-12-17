The backend communication follows a **Sequential Pipeline** architecture. The request hits a single endpoint, which acts as an orchestrator, passing data through three distinct "layers" of intelligence before returning the final result to the frontend.

### 1. The Entry Point: Route Layer

* **Frontend Action:** The React app POSTs a file to `/api/upload`.
* **Route Handler:** `routes/upload_routes.py` receives the file.
* **Action:** It saves the raw image to the disk (`static/uploads`).
* **Handoff:** It does *not* process the data itself. It passes the file path to the **Orchestrator**.



### 2. The Orchestrator: `preprocess_service.py`

This service is the "Traffic Controller." It manages the workflow so your route functions don't get messy. It calls the other services in a specific order:

#### Step A: Vision Service ("The Eyes")

* **Call:** `granite_vision_service.analyze_images(task="ar_extraction")`
* **Input:** The raw image.
* **Action:** The **Granite Vision** model looks at the image to identify objects (e.g., "This is a valve", "This is a battery").
* **Output:** **"Hints"** (Bounding Boxes & Labels). It knows *roughly* where things are, but only as simple rectangles.

#### Step B: AR Service ("The Hands")

* **Call:** `ar_service.extract_document_features(hints=vision_output)`
* **Input:** The raw image + the "Hints" from Step A.
* **Action:** The **SAM (Segment Anything)** model takes those rough boxes and refines them. It finds the exact pixel contours of the object inside the box.
* **Output:** **"AR Elements"**. These are now precise polygons or cleaned-up hitboxes ready for the 3D viewer.

#### Step C: AI Service ("The Brain")

* **Call:** `granite_ai_service.analyze_context(vision_data=ar_elements)`
* **Input:** The list of AR elements found in Step B.
* **Action:** The **Granite LLM** generates a text summary. It uses the list of parts to say something intelligent like, *"I identified a hydraulic circuit with a pump and two valves."*
* **Output:** A natural language summary.

### 3. The Return Trip

The Orchestrator packages all three outputs (Vision metadata, AR polygons, AI summary) into one JSON object.

* **Route Handler:** Receives the package.
* **Response:** Sends `200 OK` to React with the complete bundle.

### Summary of Data Flow

1. **React** `-->` **Upload Route** (Saves File)
2. **Upload Route** `-->` **Preprocess Service** (Starts Job)
3. **Preprocess** `-->` **Vision Service** (Get Bounding Boxes)
4. **Preprocess** `-->` **AR Service** (Refine into Polygons)
5. **Preprocess** `-->` **AI Service** (Summarize Context)
6. **Preprocess** `-->` **React** (Return Final JSON)

**Ready to move to the Frontend?** We can start building the React component that receives this JSON and renders the 3D scene.