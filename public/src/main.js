// PDF Scanner - Desktop Main JavaScript (Vercel version with polling)
// Handles QR generation, polling for updates, gallery, and PDF generation

class PDFScanner {
    constructor() {
        this.sessionId = this.generateSessionId();
        this.images = [];
        this.selectedImageId = null;
        this.pollingInterval = null;
        this.lastImageCount = 0;

        this.init();
    }

    generateSessionId() {
        return 'session-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now().toString(36);
    }

    async init() {
        await this.fetchQRCode();
        this.startPolling();
        this.bindEvents();
    }

    async fetchQRCode() {
        const qrContainer = document.getElementById('qr-container');
        const mobileUrl = document.getElementById('mobile-url');

        try {
            const response = await fetch(`/api/qrcode?sessionId=${this.sessionId}`);
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

    startPolling() {
        // Poll every 2 seconds for new images
        this.pollingInterval = setInterval(() => this.pollImages(), 2000);
        // Initial poll
        this.pollImages();
    }

    async pollImages() {
        try {
            const response = await fetch(`/api/images?sessionId=${this.sessionId}`);
            const data = await response.json();

            if (data.images && data.images.length > this.lastImageCount) {
                // New images received
                this.images = data.images;
                this.lastImageCount = data.images.length;
                this.renderGallery();
                this.updateControls();
            }
        } catch (error) {
            console.error('Polling error:', error);
        }
    }

    removeImage(imageId) {
        this.images = this.images.filter(img => img.id !== imageId);
        this.lastImageCount = this.images.length;
        this.renderGallery();
        this.updateControls();
        this.closeModal();
    }

    clearAllImages() {
        if (confirm('Are you sure you want to clear all images?')) {
            this.images = [];
            this.lastImageCount = 0;
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

                    doc.addImage(image.data, 'JPEG', x, y, width, height);
                } catch (error) {
                    console.error(`Failed to add image ${i + 1}:`, error);
                }
            }

            // Save the PDF
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

        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            if (this.pollingInterval) {
                clearInterval(this.pollingInterval);
            }
        });
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new PDFScanner();
});
