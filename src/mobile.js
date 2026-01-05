// PDF Scanner - Mobile Camera JavaScript
// Handles camera access, image capture, and upload to server

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
        await this.startCamera();
        this.bindEvents();
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

        // Convert to data URL
        this.capturedImageData = canvas.toDataURL('image/jpeg', 0.9);

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

    async uploadImage() {
        if (!this.capturedImageData) return;

        const previewModal = document.getElementById('preview-modal');
        const uploadToast = document.getElementById('upload-toast');
        const successToast = document.getElementById('success-toast');

        // Close preview and show upload toast
        previewModal.classList.remove('active');
        uploadToast.classList.add('active');

        try {
            // Convert base64 to blob
            const response = await fetch(this.capturedImageData);
            const blob = await response.blob();

            // Create form data
            const formData = new FormData();
            formData.append('image', blob, `capture-${Date.now()}.jpg`);

            // Upload to server
            const uploadResponse = await fetch(`/api/upload/${this.sessionId}`, {
                method: 'POST',
                body: formData
            });

            if (!uploadResponse.ok) {
                throw new Error('Upload failed');
            }

            // Success
            this.captureCount++;
            this.updateCaptureCount();

            uploadToast.classList.remove('active');
            successToast.classList.add('active');

            setTimeout(() => {
                successToast.classList.remove('active');
            }, 2000);

        } catch (error) {
            console.error('Upload error:', error);
            uploadToast.classList.remove('active');
            alert('Failed to upload image. Please try again.');
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
            this.uploadImage();
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
                // Pause camera when page is hidden
                if (this.stream) {
                    this.stream.getTracks().forEach(track => track.enabled = false);
                }
            } else {
                // Resume camera when page is visible
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
