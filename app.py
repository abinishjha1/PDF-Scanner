"""
PDF Scanner - Python Flask Server
Real-time image sync using Flask-SocketIO
"""

from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_socketio import SocketIO, emit, join_room
import qrcode
import io
import base64
import os
import socket
from datetime import datetime
from werkzeug.utils import secure_filename

app = Flask(__name__, static_folder='.', static_url_path='')
app.config['SECRET_KEY'] = 'pdf-scanner-secret'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max upload

socketio = SocketIO(app, cors_allowed_origins="*")

# Store sessions and images
sessions = {}

# Uploads directory
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def get_local_ip():
    """Get the local network IP address"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "localhost"

LOCAL_IP = get_local_ip()
PORT = 8000

# Serve static files
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/mobile.html')
def mobile():
    return send_from_directory('.', 'mobile.html')

@app.route('/src/<path:filename>')
def serve_src(filename):
    return send_from_directory('src', filename)

@app.route('/uploads/<path:filename>')
def serve_uploads(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)

# Generate QR code
@app.route('/api/qrcode/<session_id>')
def generate_qr(session_id):
    mobile_url = f"http://{LOCAL_IP}:{PORT}/mobile.html?session={session_id}"
    
    # Generate QR code
    qr = qrcode.QRCode(version=1, box_size=10, border=2)
    qr.add_data(mobile_url)
    qr.make(fit=True)
    
    img = qr.make_image(fill_color="white", back_color="transparent")
    
    # Convert to base64
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    qr_base64 = base64.b64encode(buffer.getvalue()).decode()
    
    return jsonify({
        'qrCode': f'data:image/png;base64,{qr_base64}',
        'mobileUrl': mobile_url,
        'localIP': LOCAL_IP
    })

# Handle image upload
@app.route('/api/upload/<session_id>', methods=['POST'])
def upload_image(session_id):
    if 'image' not in request.files:
        return jsonify({'error': 'No image provided'}), 400
    
    file = request.files['image']
    if file.filename == '':
        return jsonify({'error': 'No image selected'}), 400
    
    # Create session folder
    session_folder = os.path.join(UPLOAD_FOLDER, session_id)
    os.makedirs(session_folder, exist_ok=True)
    
    # Save file
    filename = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{secure_filename(file.filename)}"
    filepath = os.path.join(session_folder, filename)
    file.save(filepath)
    
    image_url = f'/uploads/{session_id}/{filename}'
    
    # Initialize session if not exists
    if session_id not in sessions:
        sessions[session_id] = {'images': []}
    
    image_data = {
        'id': filename,
        'url': image_url,
        'timestamp': datetime.now().timestamp()
    }
    sessions[session_id]['images'].append(image_data)
    
    # Broadcast to desktop via SocketIO
    socketio.emit('new_image', image_data, room=session_id)
    
    return jsonify({'success': True, 'imageUrl': image_url})

# Get all images for a session
@app.route('/api/images/<session_id>')
def get_images(session_id):
    session = sessions.get(session_id, {'images': []})
    return jsonify({'images': session['images']})

# SocketIO events
@socketio.on('connect')
def handle_connect():
    print('Client connected')

@socketio.on('join_session')
def handle_join(data):
    session_id = data.get('sessionId')
    if session_id:
        join_room(session_id)
        print(f'Desktop joined session: {session_id}')
        
        # Send existing images
        session = sessions.get(session_id, {'images': []})
        emit('init', {'images': session['images']})

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')

if __name__ == '__main__':
    print(f"\n🚀 PDF Scanner Python Server running!")
    print(f"   Local:   http://localhost:{PORT}")
    print(f"   Network: http://{LOCAL_IP}:{PORT}")
    print(f"\n📱 Mobile devices can connect via the QR code\n")
    
    socketio.run(app, host='0.0.0.0', port=PORT, debug=True)
