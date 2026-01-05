// PDF Scanner - Desktop Main JavaScript
// Polls API for cross-device image sync

class PDFScanner {
    constructor() {
        this.sessionId = this.generateSessionId();
        this.images = [];
        this.selectedImageId = null;
        this.pollInterval = null;

        this.init();
    }

    generateSessionId() {
        return 'scan-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now().toString(36);
    }

    async init() {
        await this.generateQRCode();
        this.setupPolling();
        this.bindEvents();
    }

    async generateQRCode() {
        const qrContainer = document.getElementById('qr-container');
        const mobileUrlElement = document.getElementById('mobile-url');

        try {
            const baseUrl = window.location.origin;
            const mobileUrl = `${baseUrl}/mobile.html?session=${this.sessionId}`;

            if (typeof qrcode !== 'undefined') {
                const qr = qrcode(0, 'M');
                qr.addData(mobileUrl);
                qr.make();

                const qrImg = document.createElement('img');
                qrImg.src = qr.createDataURL(8, 0);
                qrImg.alt = 'Scan to connect';
                qrImg.style.width = '240px';
                qrImg.style.height = '240px';
                qrImg.style.borderRadius = '12px';
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

    setupPolling() {
        // Poll API every second for new images
        this.pollInterval = setInterval(() => {
            this.fetchImages();
        }, 1000);

        // Initial fetch
        this.fetchImages();

        this.updateConnectionStatus('connected');
    }

    async fetchImages() {
        try {
            const response = await fetch(`/api/images?sessionId=${this.sessionId}`);
            if (!response.ok) return;

            const data = await response.json();
            const fetchedImages = data.images || [];

            // Check for new images
            if (fetchedImages.length > this.images.length) {
                console.log('New images found:', fetchedImages.length - this.images.length);

                // Add only new images
                const newImages = fetchedImages.slice(this.images.length);
                newImages.forEach(img => {
                    if (!this.images.some(existing => existing.id === img.id)) {
                        this.images.push(img);
                    }
                });

                this.renderGallery();
                this.updateControls();
            }
        } catch (err) {
            console.error('Fetch error:', err);
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

    removeImage(imageId) {
        this.images = this.images.filter(img => img.id !== imageId);
        this.renderGallery();
        this.updateControls();
        this.closeModal();
    }

    clearAllImages() {
        if (confirm('Are you sure you want to clear all images?')) {
            this.images = [];
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
        });
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    new PDFScanner();
});
