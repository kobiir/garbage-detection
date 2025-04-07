let socket;
let isProcessing = false;
let processingInterval;
const PROCESS_INTERVAL = 500;

function connectWebSocket() {
    const socketURL = window.location.origin;
    socket = io(socketURL);


    socket.on('connect', () => {
        console.log('Connected to server');
        document.getElementById('status').textContent = 'Connected';
        document.getElementById('status').classList.replace('bg-red-500', 'bg-green-500');
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        document.getElementById('status').textContent = 'Disconnected';
        document.getElementById('status').classList.replace('bg-green-500', 'bg-red-500');
    });

    socket.on('classification_result', (result) => {
        displayResult(result);
        if (result.detected_objects && result.detected_objects.length > 0) {
            drawDetections(result.detected_objects);
        }
        isProcessing = false;
    });
}

function startProcessing() {
    const video = document.getElementById('video'); 
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    processingInterval = setInterval(() => {
        if (isProcessing || !socket.connected) return;
        isProcessing = true;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = canvas.toDataURL('image/jpeg', 0.8);
        socket.emit('frame', { image: imageData });
    }, PROCESS_INTERVAL);

    document.getElementById('startBtn').classList.add('hidden');
    document.getElementById('stopBtn').classList.remove('hidden');
}

function stopProcessing() {
    clearInterval(processingInterval);
    document.getElementById('startBtn').classList.remove('hidden');
    document.getElementById('stopBtn').classList.add('hidden');
}

function drawDetections(detections) {
    const video = document.getElementById('video');
    const overlay = document.getElementById('detectionOverlay');
    const ctx = overlay.getContext('2d');

    overlay.width = video.videoWidth;
    overlay.height = video.videoHeight;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    const colors = {
            'bottle': '#0000FF',  // Bright Blue
            'can': '#00FFFF',     // Cyan
            'carton': '#F0F0F0',  // Light Gray
            'cup': '#00E5C0',     // Teal
            'paper': '#1A237E',   // Dark Blue
            'default': '#00FF00'  // Bright Green fallback
        
    };

    detections.forEach(detection => {
        const [x1, y1, x2, y2] = detection.bbox;
        const color = colors[detection.class] || colors.default;

        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

        ctx.fillStyle = color;
        const label = `${detection.class}: ${(detection.confidence * 100).toFixed(1)}%`;
        const textWidth = ctx.measureText(label).width;
        ctx.fillRect(x1, y1 - 30, textWidth + 10, 30);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = '20px Arial';
        ctx.fillText(label, x1 + 5, y1 - 5);
    });
}

function displayResult(result) {
    const resultDiv = document.getElementById('result');

    if (result.error) {
        resultDiv.innerHTML = `<div class="bg-red-500 p-4 rounded-lg">${result.error}</div>`;
        return;
    }

    if (result.total_objects === 0) {
        resultDiv.innerHTML = `<div class="bg-gray-800 p-4 rounded-lg">No objects detected</div>`;
        return;
    }

    let classCountsHTML = '';
    for (const [className, count] of Object.entries(result.class_counts)) {
        classCountsHTML += `
            <div class="mb-2">
                <div class="flex justify-between mb-1">
                    <span class="font-medium">${className}</span>
                    <span>${count} ${count === 1 ? 'item' : 'items'}</span>
                </div>
                <div class="w-full bg-gray-700 rounded-full h-2.5">
                    <div class="${getColorForClass(className)} h-2.5 rounded-full" style="width: ${Math.min(count * 20, 100)}%"></div>
                </div>
            </div>
        `;
    }

    let topDetectionsHTML = '';
    const topDetections = result.detected_objects.slice(0, 5);
    topDetections.forEach(detection => {
        topDetectionsHTML += `
            <div class="flex justify-between mb-1 py-1 border-b border-gray-700">
                <span>${detection.class}</span>
                <span>${(detection.confidence * 100).toFixed(1)}%</span>
            </div>
        `;
    });

    resultDiv.innerHTML = `
        <div class="bg-gray-800 p-4 rounded-lg shadow-lg">
            <h2 class="text-xl font-bold mb-2">Detection Results</h2>
            <div class="text-lg mb-4">Total objects: <span class="font-bold">${result.total_objects}</span></div>
            <h3 class="text-lg font-semibold mb-2">Objects by Type:</h3>
            ${classCountsHTML}
            <h3 class="text-lg font-semibold mt-4 mb-2">Top Detections:</h3>
            ${topDetectionsHTML}
        </div>
    `;
}

function getColorForClass(className) {
    const colorMap = {
        'bottle': 'bg-blue-600',
        'can': 'bg-cyan-400',
        'carton': 'bg-gray-200',
        'cup': 'bg-teal-400',
        'paper': 'bg-blue-900'
    };
    return colorMap[className] || 'bg-green-500';
}

async function uploadImage() {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    if (!file) return alert('Please select a file first');

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/api/classify-upload', {
            method: 'POST',
            body: formData
        });
        const result = await response.json();
        displayResult(result);
    } catch (error) {
        console.error('Error uploading image:', error);
        displayResult({ error: 'Failed to upload image' });
    }
}

window.addEventListener('DOMContentLoaded', connectWebSocket);
