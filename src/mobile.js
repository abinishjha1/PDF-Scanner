// PDF Scanner - Mobile Camera JavaScript
// Syncs images to desktop via API polling

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
        // Load existing images
        this.loadImages();

        await this.startCamera();
        this.bindEvents();
    }

    loadImages() {
        try {
            const stored = localStorage.getItem(`images_${this.sessionId}`);
            if (stored) {
                this.images = JSON.parse(stored);
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
        const previewModal = document.getElementById('preview-modal');
        const previewImage = document.getElementById('preview-image');

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);

        this.capturedImageData = canvas.toDataURL('image/jpeg', 0.7);

        previewImage.src = this.capturedImageData;
        previewModal.classList.add('active');

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
            const image = {
                id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                data: dataToSave,
                timestamp: Date.now()
            };

            // Add to local array
            this.images.push(image);

            // Save to localStorage
            localStorage.setItem(`images_${this.sessionId}`, JSON.stringify(this.images));

            // Trigger storage event for cross-tab sync
            const event = JSON.stringify({
                type: 'new-image',
                image: image,
                timestamp: Date.now()
            });
            localStorage.setItem(`scanner_${this.sessionId}`, event);
            // Immediately remove and set again to trigger event
            localStorage.removeItem(`scanner_${this.sessionId}`);
            localStorage.setItem(`scanner_${this.sessionId}`, event);

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

        if (this.images.length > 0) {
            container.style.display = 'block';
            countSpan.textContent = `${this.images.length} image${this.images.length !== 1 ? 's' : ''} captured`;
        } else {
            container.style.display = 'none';
        }
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

        // File input for gallery
        document.getElementById('file-input').addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFileSelect(e.target.files);
                e.target.value = ''; // Reset input
            }
        });

        // Done button - go back to inform user
        document.getElementById('done-btn').addEventListener('click', () => {
            if (this.images.length > 0) {
                alert(`${this.images.length} image(s) captured! Check your desktop to generate PDF.`);
            } else {
                alert('No images captured yet. Take some photos first!');
            }
        });

        // Retry camera button
        document.getElementById('retry-btn').addEventListener('click', () => {
            document.getElementById('camera-error').style.display = 'none';
            document.getElementById('camera-loading').style.display = 'flex';
            this.startCamera();
        });

        // Handle page visibility change
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
