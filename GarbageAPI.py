from flask import Flask, request, jsonify, render_template, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO, emit
from werkzeug.utils import secure_filename
import os
import cv2
import numpy as np
import base64
import time
from ultralytics import YOLO
import torch

# Setup
app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg'}
MODEL_PATH = 'model/my_model.pt'

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
model = YOLO(MODEL_PATH)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def classify_image(image):
    try:
        results = model.predict(source=image, save=False, verbose=False)
        result = results[0]
        boxes = result.boxes
        names = model.names

        detected_objects = []
        class_counts = {}

        for box in boxes:
            cls_id = int(box.cls[0])
            class_name = names[cls_id]
            conf = float(box.conf[0])
            x1, y1, x2, y2 = map(float, box.xyxy[0])

            detected_objects.append({
                "class": class_name,
                "confidence": conf,
                "bbox": [x1, y1, x2, y2]
            })

            class_counts[class_name] = class_counts.get(class_name, 0) + 1

        return {
            "detected_objects": detected_objects,
            "class_counts": class_counts,
            "total_objects": len(detected_objects)
        }, 200

    except Exception as e:
        return {"error": str(e)}, 500

# === ROUTES ===
@app.route('/')
def home():
    return render_template('login.html')

@app.route('/login')
def login():
    return render_template('login.html')

@app.route('/dashboard')
def dashboard():
    return render_template('index.html')

@app.route('/camera')
def camera():
    return render_template('camera.html')

@app.route('/api/classify-upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)

        image = cv2.imread(filepath)
        if image is None:
            return jsonify({"error": "Could not read image"}), 400

        result, status_code = classify_image(image)
        return jsonify(result), status_code

    return jsonify({"error": "File type not allowed"}), 400

# WebSocket
@socketio.on('connect')
def handle_connect():
    print('Client connected')

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')

@socketio.on('frame')
def handle_frame(data):
    try:
        image_data = data['image']
        if 'data:image' in image_data:
            image_data = image_data.split(',')[1]
        image_bytes = base64.b64decode(image_data)
        nparr = np.frombuffer(image_bytes, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if image is None:
            emit('classification_result', {"error": "Could not decode image"})
            return
        result, _ = classify_image(image)
        emit('classification_result', result)
    except Exception as e:
        emit('classification_result', {"error": f"Error processing frame: {str(e)}"})

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        "status": "healthy",
        "model_loaded": model is not None,
        "device": str(device),
        "timestamp": time.time()
    })

if __name__ == '__main__':
    print(f"Starting server with YOLO model on {device}") 
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)
