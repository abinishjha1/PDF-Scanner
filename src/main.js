// PDF Scanner - Desktop Main JavaScript
// Handles QR generation, WebSocket connection, gallery, and PDF generation

class PDFScanner {
    constructor() {
        this.sessionId = this.generateSessionId();
        this.images = [];
        this.ws = null;
        this.selectedImageId = null;

        this.init();
    }

    generateSessionId() {
        return 'session-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now().toString(36);
    }

    async init() {
        await this.fetchQRCode();
        this.connectWebSocket();
        this.bindEvents();
    }

    async fetchQRCode() {
        const qrContainer = document.getElementById('qr-container');
        const mobileUrl = document.getElementById('mobile-url');

        try {
            const response = await fetch(`/api/qrcode/${this.sessionId}`);
            const data = await response.json();

            if (data.qrCode) {
                qrContainer.innerHTML = `<img src="${data.qrCode}" alt="Scan to connect">`;
                mobileUrl.textContent = data.mobileUrl;
            }
        } catch (error) {
            console.error('Failed to fetch QR code:', error);
            qrContainer.innerHTML = `
        <div class="qr-loading">
          <span>Failed to generate QR code</span>
        </div>
      `;
        }
    }

    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}?session=${this.sessionId}`;

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            this.updateConnectionStatus(true);
        };

        this.ws.onclose = () => {
            this.updateConnectionStatus(false);
            // Attempt to reconnect after 3 seconds
            setTimeout(() => this.connectWebSocket(), 3000);
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.type === 'init') {
                // Load existing images
                data.images.forEach(image => this.addImage(image));
            } else if (data.type === 'new-image') {
                // Add new image
                this.addImage(data.image);
                this.showNotification('New image received!');
            }
        };
    }

    updateConnectionStatus(connected) {
        const statusText = document.getElementById('connection-status');
        const statusDot = document.querySelector('.status-dot');

        if (connected) {
            statusText.textContent = 'Connected';
            statusDot.classList.add('connected');
        } else {
            statusText.textContent = 'Reconnecting...';
            statusDot.classList.remove('connected');
        }
    }

    addImage(image) {
        this.images.push(image);
        this.renderGallery();
        this.updateControls();
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
        <img src="${image.url}" alt="Captured document ${index + 1}" loading="lazy">
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
        modalImage.src = image.url;
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

                // Load image and add to PDF
                try {
                    const imgData = await this.loadImageAsBase64(image.url);
                    const imgProps = await this.getImageDimensions(image.url);

                    // Calculate dimensions to fit page
                    const maxWidth = pageWidth - (margin * 2);
                    const maxHeight = pageHeight - (margin * 2);

                    let width = imgProps.width;
                    let height = imgProps.height;

                    // Scale to fit
                    const scale = Math.min(maxWidth / width, maxHeight / height);
                    width *= scale;
                    height *= scale;

                    // Center on page
                    const x = (pageWidth - width) / 2;
                    const y = (pageHeight - height) / 2;

                    doc.addImage(imgData, 'JPEG', x, y, width, height);
                } catch (error) {
                    console.error(`Failed to add image ${i + 1}:`, error);
                }
            }

            // Save the PDF
            const timestamp = new Date().toISOString().slice(0, 10);
            doc.save(`scanned-document-${timestamp}.pdf`);

            this.showNotification('PDF generated successfully!');
        } catch (error) {
            console.error('PDF generation error:', error);
            alert('Failed to generate PDF: ' + error.message);
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    loadImageAsBase64(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/jpeg', 0.9));
            };
            img.onerror = reject;
            img.src = url;
        });
    }

    getImageDimensions(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                resolve({ width: img.width, height: img.height });
            };
            img.onerror = reject;
            img.src = url;
        });
    }

    showNotification(message) {
        // Simple notification - could be enhanced with a toast library
        console.log(message);
    }

    bindEvents() {
        // Clear all button
        document.getElementById('clear-btn').addEventListener('click', () => {
            this.clearAllImages();
        });

        // Generate PDF button
        document.getElementById('generate-pdf-btn').addEventListener('click', () => {
            this.generatePDF();
        });

        // Modal close
        document.getElementById('modal-close').addEventListener('click', () => {
            this.closeModal();
        });

        document.querySelector('.modal-overlay').addEventListener('click', () => {
            this.closeModal();
        });

        // Delete image button
        document.getElementById('delete-image-btn').addEventListener('click', () => {
            if (this.selectedImageId) {
                this.removeImage(this.selectedImageId);
            }
        });

        // Escape key to close modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            }
        });
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new PDFScanner();
});
