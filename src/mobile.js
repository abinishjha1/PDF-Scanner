// PDF Scanner - Mobile Camera JavaScript
// Handles camera access, image capture, and sync via localStorage

class MobileScanner {
    constructor() {
        this.sessionId = this.getSessionId();
        this.captureCount = 0;
        this.stream = null;
        this.capturedImageData = null;

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
        // Load existing capture count
        this.loadCaptureCount();

        await this.startCamera();
        this.bindEvents();
    }

    loadCaptureCount() {
        try {
            const stored = localStorage.getItem(`images_${this.sessionId}`);
            if (stored) {
                const images = JSON.parse(stored);
                this.captureCount = images.length;
                this.updateCaptureCount();
            }
        } catch (err) {
            console.error('Load count error:', err);
        }
    }

    async startCamera() {
        const video = document.getElementById('camera-video');
        const loading = document.getElementById('camera-loading');
        const error = document.getElementById('camera-error');
        const captureBtn = document.getElementById('capture-btn');

        try {
            // Request camera with rear-facing preference for document scanning
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
        const previewModal = document.getElementById('preview-modal');
        const previewImage = document.getElementById('preview-image');

        // Set canvas size to video size
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Draw video frame to canvas
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);

        // Convert to data URL (compressed for storage)
        this.capturedImageData = canvas.toDataURL('image/jpeg', 0.7);

        // Show preview
        previewImage.src = this.capturedImageData;
        previewModal.classList.add('active');

        // Flash effect
        this.showFlash();
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

    async saveImage() {
        if (!this.capturedImageData) return;

        const previewModal = document.getElementById('preview-modal');
        const uploadToast = document.getElementById('upload-toast');
        const successToast = document.getElementById('success-toast');

        // Close preview and show upload toast
        previewModal.classList.remove('active');
        uploadToast.classList.add('active');

        try {
            // Create image object
            const image = {
                id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                data: this.capturedImageData,
                timestamp: Date.now()
            };

            // Get existing images from localStorage
            let images = [];
            try {
                const stored = localStorage.getItem(`images_${this.sessionId}`);
                if (stored) {
                    images = JSON.parse(stored);
                }
            } catch (e) {
                images = [];
            }

            // Add new image
            images.push(image);

            // Save to localStorage
            localStorage.setItem(`images_${this.sessionId}`, JSON.stringify(images));

            // Trigger storage event for cross-tab sync (on same origin)
            localStorage.setItem(`scanner_${this.sessionId}`, JSON.stringify({
                type: 'new-image',
                image: image
            }));

            // Success
            this.captureCount++;
            this.updateCaptureCount();

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

    updateCaptureCount() {
        const countElement = document.getElementById('capture-count');
        countElement.textContent = `${this.captureCount} captured`;
    }

    bindEvents() {
        // Capture button
        document.getElementById('capture-btn').addEventListener('click', () => {
            this.captureImage();
        });

        // Retake button
        document.getElementById('retake-btn').addEventListener('click', () => {
            this.closePreview();
        });

        // Use photo button
        document.getElementById('use-btn').addEventListener('click', () => {
            this.saveImage();
        });

        // Retry camera button
        document.getElementById('retry-btn').addEventListener('click', () => {
            document.getElementById('camera-error').style.display = 'none';
            document.getElementById('camera-loading').style.display = 'flex';
            this.startCamera();
        });

        // Handle page visibility change (pause/resume camera)
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

        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
            }
        });
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new MobileScanner();
});
