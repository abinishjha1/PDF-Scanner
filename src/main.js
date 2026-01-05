// PDF Scanner - Desktop Main JavaScript
// Uses Supabase Realtime for cross-device image sync

// Supabase configuration
const SUPABASE_URL = 'https://pntieelizxhmezasqzed.supabase.co';
const SUPABASE_KEY = 'sb_publishable_UXZ8961wiUjnY5zRVGwymg__2twvxum';

class PDFScanner {
    constructor() {
        this.sessionId = this.generateSessionId();
        this.images = [];
        this.selectedImageId = null;
        this.supabase = null;
        this.channel = null;

        this.init();
    }

    generateSessionId() {
        return 'scan-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now().toString(36);
    }

    async init() {
        // Initialize Supabase
        this.initSupabase();

        // Generate QR code client-side
        await this.generateQRCode();

        // Setup real-time sync
        this.setupRealtimeSync();

        this.bindEvents();
    }

    initSupabase() {
        if (typeof supabase !== 'undefined' && supabase.createClient) {
            try {
                this.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
                console.log('Supabase initialized');
            } catch (err) {
                console.warn('Supabase init failed, using localStorage fallback:', err);
            }
        }
    }

    async generateQRCode() {
        const qrContainer = document.getElementById('qr-container');
        const mobileUrlElement = document.getElementById('mobile-url');

        try {
            // Generate mobile URL
            const baseUrl = window.location.origin;
            const mobileUrl = `${baseUrl}/mobile.html?session=${this.sessionId}`;

            // Use qrcode-generator library from CDN
            if (typeof qrcode !== 'undefined') {
                const qr = qrcode(0, 'M');
                qr.addData(mobileUrl);
                qr.make();

                // Create image from QR code
                const qrImg = document.createElement('img');
                qrImg.src = qr.createDataURL(8, 0);
                qrImg.alt = 'Scan to connect';
                qrImg.style.width = '240px';
                qrImg.style.height = '240px';
                qrImg.style.borderRadius = '12px';

                // Apply white filter for dark theme
                qrImg.style.filter = 'invert(1)';

                qrContainer.innerHTML = '';
                qrContainer.appendChild(qrImg);
                mobileUrlElement.textContent = mobileUrl;

                this.updateConnectionStatus('ready');
            } else {
                throw new Error('QRCode library not loaded');
            }
        } catch (error) {
            console.error('QR generation error:', error);
            const baseUrl = window.location.origin;
            qrContainer.innerHTML = `
        <div class="qr-error">
          <p>QR Code</p>
          <p style="font-size: 0.75rem; margin-top: 8px; word-break: break-all;">
            ${baseUrl}/mobile.html?session=${this.sessionId}
          </p>
        </div>
      `;
            mobileUrlElement.textContent = `${baseUrl}/mobile.html?session=${this.sessionId}`;
        }
    }

    setupRealtimeSync() {
        // Try Supabase Realtime first
        if (this.supabase) {
            try {
                this.channel = this.supabase.channel(`scanner:${this.sessionId}`);

                this.channel
                    .on('broadcast', { event: 'new-image' }, (payload) => {
                        console.log('Received image via Supabase:', payload);
                        if (payload.payload && payload.payload.image) {
                            this.addImage(payload.payload.image, false);
                        }
                    })
                    .subscribe((status) => {
                        console.log('Supabase channel status:', status);
                        if (status === 'SUBSCRIBED') {
                            this.updateConnectionStatus('connected');
                        }
                    });

                console.log('Supabase Realtime channel created');
            } catch (err) {
                console.warn('Supabase Realtime failed:', err);
            }
        }

        // Also listen for localStorage events (fallback)
        window.addEventListener('storage', (e) => {
            if (e.key === `scanner_${this.sessionId}`) {
                try {
                    const data = JSON.parse(e.newValue);
                    if (data.type === 'new-image') {
                        this.addImage(data.image, false);
                    }
                } catch (err) {
                    console.error('Storage event error:', err);
                }
            }
        });

        // Poll localStorage for same-tab testing
        this.pollInterval = setInterval(() => this.pollForImages(), 1000);

        this.updateConnectionStatus('connected');
    }

    pollForImages() {
        try {
            const stored = localStorage.getItem(`images_${this.sessionId}`);
            if (stored) {
                const images = JSON.parse(stored);
                if (images.length > this.images.length) {
                    const newImages = images.slice(this.images.length);
                    newImages.forEach(img => this.addImage(img, false));
                }
            }
        } catch (err) {
            console.error('Poll error:', err);
        }
    }

    updateConnectionStatus(status) {
        const statusText = document.getElementById('connection-status');
        const statusDot = document.getElementById('status-dot');

        if (status === 'connected' || status === 'ready') {
            statusText.textContent = 'Ready';
            statusDot.classList.add('connected');
        } else {
            statusText.textContent = 'Connecting...';
            statusDot.classList.remove('connected');
        }
    }

    addImage(image, save = true) {
        // Check if image already exists
        if (this.images.some(img => img.id === image.id)) {
            return;
        }

        this.images.push(image);
        this.renderGallery();
        this.updateControls();

        if (save) {
            localStorage.setItem(`images_${this.sessionId}`, JSON.stringify(this.images));
        }
    }

    removeImage(imageId) {
        this.images = this.images.filter(img => img.id !== imageId);
        localStorage.setItem(`images_${this.sessionId}`, JSON.stringify(this.images));
        this.renderGallery();
        this.updateControls();
        this.closeModal();
    }

    clearAllImages() {
        if (confirm('Are you sure you want to clear all images?')) {
            this.images = [];
            localStorage.removeItem(`images_${this.sessionId}`);
            this.renderGallery();
            this.updateControls();
        }
    }

    renderGallery() {
        const galleryEmpty = document.getElementById('gallery-empty');
        const galleryGrid = document.getElementById('gallery-grid');
        const imageCount = document.getElementById('image-count');

        imageCount.textContent = `${this.images.length} image${this.images.length !== 1 ? 's' : ''}`;

        if (this.images.length === 0) {
            galleryEmpty.style.display = 'flex';
            galleryGrid.innerHTML = '';
            return;
        }

        galleryEmpty.style.display = 'none';

        galleryGrid.innerHTML = this.images.map((image, index) => `
      <div class="gallery-item fade-in" data-id="${image.id}">
        <img src="${image.data}" alt="Captured document ${index + 1}" loading="lazy">
        <div class="gallery-item-overlay">
          <div class="gallery-item-number">${index + 1}</div>
        </div>
      </div>
    `).join('');

        // Bind click events
        galleryGrid.querySelectorAll('.gallery-item').forEach(item => {
            item.addEventListener('click', () => {
                const imageId = item.dataset.id;
                const image = this.images.find(img => img.id === imageId);
                if (image) {
                    this.openModal(image);
                }
            });
        });
    }

    updateControls() {
        const pdfControls = document.getElementById('pdf-controls');
        pdfControls.style.display = this.images.length > 0 ? 'flex' : 'none';
    }

    openModal(image) {
        const modal = document.getElementById('image-modal');
        const modalImage = document.getElementById('modal-image');

        this.selectedImageId = image.id;
        modalImage.src = image.data;
        modal.classList.add('active');
    }

    closeModal() {
        const modal = document.getElementById('image-modal');
        modal.classList.remove('active');
        this.selectedImageId = null;
    }

    async generatePDF() {
        if (this.images.length === 0) {
            alert('No images to convert');
            return;
        }

        const btn = document.getElementById('generate-pdf-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = `
      <div class="spinner" style="width: 18px; height: 18px; border-width: 2px;"></div>
      Generating...
    `;
        btn.disabled = true;

        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 10;

            for (let i = 0; i < this.images.length; i++) {
                if (i > 0) {
                    doc.addPage();
                }

                const image = this.images[i];

                try {
                    const imgProps = await this.getImageDimensions(image.data);

                    const maxWidth = pageWidth - (margin * 2);
                    const maxHeight = pageHeight - (margin * 2);

                    let width = imgProps.width;
                    let height = imgProps.height;

                    const scale = Math.min(maxWidth / width, maxHeight / height);
                    width *= scale;
                    height *= scale;

                    const x = (pageWidth - width) / 2;
                    const y = (pageHeight - height) / 2;

                    doc.addImage(image.data, 'JPEG', x, y, width, height);
                } catch (error) {
                    console.error(`Failed to add image ${i + 1}:`, error);
                }
            }

            const timestamp = new Date().toISOString().slice(0, 10);
            doc.save(`scanned-document-${timestamp}.pdf`);

        } catch (error) {
            console.error('PDF generation error:', error);
            alert('Failed to generate PDF: ' + error.message);
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    getImageDimensions(dataUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                resolve({ width: img.width, height: img.height });
            };
            img.onerror = reject;
            img.src = dataUrl;
        });
    }

    bindEvents() {
        document.getElementById('clear-btn').addEventListener('click', () => {
            this.clearAllImages();
        });

        document.getElementById('generate-pdf-btn').addEventListener('click', () => {
            this.generatePDF();
        });

        document.getElementById('modal-close').addEventListener('click', () => {
            this.closeModal();
        });

        document.querySelector('.modal-overlay').addEventListener('click', () => {
            this.closeModal();
        });

        document.getElementById('delete-image-btn').addEventListener('click', () => {
            if (this.selectedImageId) {
                this.removeImage(this.selectedImageId);
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            }
        });

        window.addEventListener('beforeunload', () => {
            if (this.pollInterval) {
                clearInterval(this.pollInterval);
            }
            if (this.channel) {
                this.channel.unsubscribe();
            }
        });
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new PDFScanner();
});
