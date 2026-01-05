// PDF Scanner - Mobile Camera JavaScript
// Syncs images to desktop via API

class MobileScanner {
    constructor() {
        this.sessionId = this.getSessionId();
        this.captureCount = 0;
        this.stream = null;
        this.capturedImageData = null;
        this.images = [];

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
        // Start camera FIRST - don't block on API
        await this.startCamera();
        this.bindEvents();

        // Load existing images in background (non-blocking)
        this.loadImages().catch(err => console.log('Image load skipped'));
    }

    async loadImages() {
        try {
            const response = await fetch(`/api/images?sessionId=${this.sessionId}`);
            if (response.ok) {
                const data = await response.json();
                this.images = data.images || [];
                this.captureCount = this.images.length;
                this.updateCaptureCount();
                this.updateCapturedImagesPreview();
            }
        } catch (err) {
            console.error('Load images error:', err);
            this.images = [];
        }
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
                errorMessage = 'Please allow camera access to scan documents';
            } else if (err.name === 'NotFoundError') {
                errorMessage = 'No camera found on this device';
            } else if (err.name === 'NotReadableError') {
                errorMessage = 'Camera is in use by another app';
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

        const imageData = canvas.toDataURL('image/jpeg', 0.7);

        this.showFlash();

        // Auto-upload immediately (no preview modal)
        this.saveImage(imageData);
    }

    showFlash() {
        const flash = document.createElement('div');
        flash.className = 'flash-overlay';
        document.body.appendChild(flash);

        setTimeout(() => {
            flash.remove();
        }, 300);
    }

    closePreview() {
        const previewModal = document.getElementById('preview-modal');
        previewModal.classList.remove('active');
        this.capturedImageData = null;
    }

    async saveImage(imageData = null) {
        const dataToSave = imageData || this.capturedImageData;
        if (!dataToSave) return;

        const previewModal = document.getElementById('preview-modal');
        const uploadToast = document.getElementById('upload-toast');
        const successToast = document.getElementById('success-toast');

        if (!imageData) {
            previewModal.classList.remove('active');
        }
        uploadToast.classList.add('active');

        try {
            // Upload to API
            const response = await fetch(`/api/images?sessionId=${this.sessionId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ imageData: dataToSave })
            });

            if (!response.ok) {
                throw new Error('Upload failed');
            }

            const result = await response.json();
            console.log('Image uploaded:', result);

            this.captureCount++;
            this.updateCaptureCount();
            this.updateCapturedImagesPreview();

            uploadToast.classList.remove('active');
            successToast.classList.add('active');

            setTimeout(() => {
                successToast.classList.remove('active');
            }, 2000);

        } catch (error) {
            console.error('Save error:', error);
            uploadToast.classList.remove('active');
            alert('Failed to save image. Please try again.');
        }

        this.capturedImageData = null;
    }

    async handleFileSelect(files) {
        for (const file of files) {
            if (file.type.startsWith('image/')) {
                try {
                    const dataUrl = await this.fileToDataURL(file);
                    await this.saveImage(dataUrl);
                } catch (err) {
                    console.error('File read error:', err);
                }
            }
        }
    }

    fileToDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    updateCaptureCount() {
        const countElement = document.getElementById('capture-count');
        countElement.textContent = `${this.captureCount} captured`;
    }

    updateCapturedImagesPreview() {
        const container = document.getElementById('captured-images');
        const countSpan = document.getElementById('captured-count');

        if (this.captureCount > 0) {
            container.style.display = 'block';
            countSpan.textContent = `${this.captureCount} image${this.captureCount !== 1 ? 's' : ''} captured`;
        } else {
            container.style.display = 'none';
        }
    }

    bindEvents() {
        document.getElementById('capture-btn').addEventListener('click', () => {
            this.captureImage();
        });

        document.getElementById('retake-btn').addEventListener('click', () => {
            this.closePreview();
        });

        document.getElementById('use-btn').addEventListener('click', () => {
            this.saveImage();
        });

        document.getElementById('file-input').addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFileSelect(e.target.files);
                e.target.value = '';
            }
        });

        document.getElementById('done-btn').addEventListener('click', () => {
            if (this.captureCount > 0) {
                alert(`${this.captureCount} image(s) captured! Check your desktop to generate PDF.`);
            } else {
                alert('No images captured yet. Take some photos first!');
            }
        });

        document.getElementById('retry-btn').addEventListener('click', () => {
            document.getElementById('camera-error').style.display = 'none';
            document.getElementById('camera-loading').style.display = 'flex';
            this.startCamera();
        });

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                if (this.stream) {
                    this.stream.getTracks().forEach(track => track.enabled = false);
                }
            } else {
                if (this.stream) {
                    this.stream.getTracks().forEach(track => track.enabled = true);
                }
            }
        });

        window.addEventListener('beforeunload', () => {
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
            }
        });
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    new MobileScanner();
});
