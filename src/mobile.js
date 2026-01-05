// PDF Scanner - Mobile Camera JavaScript
// Uses Supabase Realtime for cross-device image sync

// Supabase configuration
const SUPABASE_URL = 'https://pntieelizxhmezasqzed.supabase.co';
const SUPABASE_KEY = 'sb_publishable_UXZ8961wiUjnY5zRVGwymg__2twvxum';

class MobileScanner {
    constructor() {
        this.sessionId = this.getSessionId();
        this.captureCount = 0;
        this.stream = null;
        this.capturedImageData = null;
        this.supabase = null;
        this.channel = null;

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
        // Initialize Supabase
        this.initSupabase();

        // Load existing capture count
        this.loadCaptureCount();

        await this.startCamera();
        this.bindEvents();
    }

    initSupabase() {
        if (typeof supabase !== 'undefined' && supabase.createClient) {
            try {
                this.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
                this.channel = this.supabase.channel(`scanner:${this.sessionId}`);
                this.channel.subscribe((status) => {
                    console.log('Mobile channel status:', status);
                });
                console.log('Supabase initialized on mobile');
            } catch (err) {
                console.warn('Supabase init failed:', err);
            }
        }
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

    async saveImage() {
        if (!this.capturedImageData) return;

        const previewModal = document.getElementById('preview-modal');
        const uploadToast = document.getElementById('upload-toast');
        const successToast = document.getElementById('success-toast');

        previewModal.classList.remove('active');
        uploadToast.classList.add('active');

        try {
            const image = {
                id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                data: this.capturedImageData,
                timestamp: Date.now()
            };

            // Save to localStorage
            let images = [];
            try {
                const stored = localStorage.getItem(`images_${this.sessionId}`);
                if (stored) {
                    images = JSON.parse(stored);
                }
            } catch (e) {
                images = [];
            }

            images.push(image);
            localStorage.setItem(`images_${this.sessionId}`, JSON.stringify(images));

            // Trigger storage event for cross-tab sync
            localStorage.setItem(`scanner_${this.sessionId}`, JSON.stringify({
                type: 'new-image',
                image: image
            }));

            // Send via Supabase Realtime
            if (this.channel) {
                try {
                    await this.channel.send({
                        type: 'broadcast',
                        event: 'new-image',
                        payload: { image: image }
                    });
                    console.log('Image sent via Supabase Realtime');
                } catch (err) {
                    console.warn('Supabase broadcast failed:', err);
                }
            }

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
        document.getElementById('capture-btn').addEventListener('click', () => {
            this.captureImage();
        });

        document.getElementById('retake-btn').addEventListener('click', () => {
            this.closePreview();
        });

        document.getElementById('use-btn').addEventListener('click', () => {
            this.saveImage();
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
            if (this.channel) {
                this.channel.unsubscribe();
            }
        });
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new MobileScanner();
});
