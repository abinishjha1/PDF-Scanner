// PDF Scanner - Mobile Camera JavaScript
// Uploads images to local server

class MobileScanner {
    constructor() {
        this.sessionId = this.getSessionId();
        this.captureCount = 0;
        this.stream = null;

        if (!this.sessionId) {
            this.showError('Invalid session. Please scan the QR code again.');
            return;
        }

        this.init();
    }

    getSessionId() {
        const params = new URLSearchParams(window.location.search);
        return params.get('session');
    }

    async init() {
        await this.startCamera();
        this.bindEvents();
    }

    async startCamera() {
        const video = document.getElementById('camera-video');
        const loading = document.getElementById('camera-loading');
        const error = document.getElementById('camera-error');
        const captureBtn = document.getElementById('capture-btn');

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: 'environment' },
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                },
                audio: false
            });

            video.srcObject = this.stream;

            video.onloadedmetadata = () => {
                loading.style.display = 'none';
                captureBtn.disabled = false;
            };
        } catch (err) {
            console.error('Camera access error:', err);
            loading.style.display = 'none';
            error.style.display = 'flex';

            let errorMessage = 'Camera access denied';
            if (err.name === 'NotAllowedError') {
                errorMessage = 'Please allow camera access';
            } else if (err.name === 'NotFoundError') {
                errorMessage = 'No camera found';
            } else if (err.name === 'NotReadableError') {
                errorMessage = 'Camera in use by another app';
            }

            document.getElementById('error-message').textContent = errorMessage;
        }
    }

    showError(message) {
        const loading = document.getElementById('camera-loading');
        const error = document.getElementById('camera-error');

        loading.style.display = 'none';
        error.style.display = 'flex';
        document.getElementById('error-message').textContent = message;
    }

    captureImage() {
        const video = document.getElementById('camera-video');
        const canvas = document.getElementById('capture-canvas');

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);

        this.showFlash();

        // Convert to blob and upload
        canvas.toBlob((blob) => {
            this.uploadImage(blob);
        }, 'image/jpeg', 0.8);
    }

    showFlash() {
        const flash = document.createElement('div');
        flash.className = 'flash-overlay';
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), 300);
    }

    async uploadImage(blob) {
        const uploadToast = document.getElementById('upload-toast');
        const successToast = document.getElementById('success-toast');

        uploadToast.classList.add('active');

        try {
            const formData = new FormData();
            formData.append('image', blob, `capture-${Date.now()}.jpg`);

            const response = await fetch(`/api/upload/${this.sessionId}`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('Upload failed');
            }

            const result = await response.json();
            console.log('Upload success:', result);

            this.captureCount++;
            this.updateCaptureCount();

            uploadToast.classList.remove('active');
            successToast.classList.add('active');
            setTimeout(() => successToast.classList.remove('active'), 2000);

        } catch (error) {
            console.error('Upload error:', error);
            uploadToast.classList.remove('active');
            alert('Failed to upload. Make sure you\'re on the same WiFi as the computer.');
        }
    }

    async handleFileSelect(files) {
        for (const file of files) {
            if (file.type.startsWith('image/')) {
                await this.uploadImage(file);
            }
        }
    }

    updateCaptureCount() {
        document.getElementById('capture-count').textContent = `${this.captureCount} captured`;
    }

    bindEvents() {
        document.getElementById('capture-btn').addEventListener('click', () => this.captureImage());

        document.getElementById('file-input').addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFileSelect(e.target.files);
                e.target.value = '';
            }
        });

        document.getElementById('done-btn').addEventListener('click', () => {
            alert(`${this.captureCount} image(s) captured! Check desktop to generate PDF.`);
        });

        document.getElementById('retry-btn').addEventListener('click', () => {
            document.getElementById('camera-error').style.display = 'none';
            document.getElementById('camera-loading').style.display = 'flex';
            this.startCamera();
        });

        window.addEventListener('beforeunload', () => {
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => new MobileScanner());
