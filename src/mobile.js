// PDF Scanner - Mobile Camera JavaScript
// Uses Supabase for cross-device image sync

// Supabase configuration
const SUPABASE_URL = 'https://pntieelizxhmezasqzed.supabase.co';
const SUPABASE_KEY = 'sb_publishable_UXZ8961wiUjnY5zRVGwymg__2twvxum';

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
        this.loadCaptureCount();
    }

    async loadCaptureCount() {
        try {
            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/scanner_images?session_id=eq.${this.sessionId}&select=id`,
                {
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`
                    }
                }
            );
            if (response.ok) {
                const data = await response.json();
                this.captureCount = data.length;
                this.updateCaptureCount();
            }
        } catch (err) {
            console.log('Count load skipped');
        }
    }

    async startCamera() {
        const video = document.getElementById('camera-video');
        const loading = document.getElementById('camera-loading');
        const error = document.getElementById('camera-error');
        const captureBtn = document.getElementById('capture-btn');

        // Try different resolutions with fallback
        const resolutions = [
            { width: 3840, height: 2160 }, // 4K
            { width: 2560, height: 1440 }, // QHD
            { width: 1920, height: 1080 }, // Full HD
            { width: 1280, height: 720 }   // HD fallback
        ];

        for (const res of resolutions) {
            try {
                this.stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: { ideal: 'environment' },
                        width: { ideal: res.width },
                        height: { ideal: res.height }
                    },
                    audio: false
                });

                video.srcObject = this.stream;
                console.log(`Camera started at ${res.width}x${res.height}`);

                video.onloadedmetadata = () => {
                    console.log(`Actual video size: ${video.videoWidth}x${video.videoHeight}`);
                    loading.style.display = 'none';
                    captureBtn.disabled = false;
                };
                return; // Success, exit loop
            } catch (err) {
                console.log(`Resolution ${res.width}x${res.height} failed, trying lower...`);
            }
        }

        // All resolutions failed
        loading.style.display = 'none';
        error.style.display = 'flex';
        document.getElementById('error-message').textContent = 'Camera access denied';
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

        // Use full video resolution
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // High quality canvas rendering
        const ctx = canvas.getContext('2d', {
            willReadFrequently: true,
            alpha: false
        });
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Maximum quality JPEG
        const imageData = canvas.toDataURL('image/jpeg', 0.98);

        this.showFlash();
        this.saveImage(imageData);
    }

    showFlash() {
        const flash = document.createElement('div');
        flash.className = 'flash-overlay';
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), 300);
    }

    async saveImage(imageData) {
        const uploadToast = document.getElementById('upload-toast');
        const successToast = document.getElementById('success-toast');

        uploadToast.classList.add('active');

        try {
            // Save to Supabase via REST API
            const response = await fetch(`${SUPABASE_URL}/rest/v1/scanner_images`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({
                    session_id: this.sessionId,
                    image_data: imageData,
                    created_at: new Date().toISOString()
                })
            });

            if (!response.ok) {
                throw new Error(`Upload failed: ${response.status}`);
            }

            this.captureCount++;
            this.updateCaptureCount();

            uploadToast.classList.remove('active');
            successToast.classList.add('active');
            setTimeout(() => successToast.classList.remove('active'), 2000);

        } catch (error) {
            console.error('Save error:', error);
            uploadToast.classList.remove('active');
            alert('Failed to save. Error: ' + error.message);
        }
    }

    async handleFileSelect(files) {
        for (const file of files) {
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (e) => this.saveImage(e.target.result);
                reader.readAsDataURL(file);
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
