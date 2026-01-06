// PDF Scanner - Desktop Main JavaScript
// Uses Supabase REST API for cross-device image sync

// Supabase configuration
const SUPABASE_URL = 'https://pntieelizxhmezasqzed.supabase.co';
const SUPABASE_KEY = 'sb_publishable_UXZ8961wiUjnY5zRVGwymg__2twvxum';

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
        // Check if on mobile
        if (this.isMobile()) {
            this.showMobileMode();
        } else {
            await this.generateQRCode();
        }

        this.setupPolling();
        this.bindEvents();
    }

    isMobile() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    }

    showMobileMode() {
        const qrSection = document.getElementById('qr-section');
        const mobileScanSection = document.getElementById('mobile-scan-section');

        if (qrSection) qrSection.style.display = 'none';
        if (mobileScanSection) mobileScanSection.style.display = 'block';

        // Set up start scan button
        const startScanBtn = document.getElementById('start-scan-btn');
        if (startScanBtn) {
            startScanBtn.addEventListener('click', () => {
                // Redirect to mobile.html with this session
                window.location.href = `mobile.html?session=${this.sessionId}`;
            });
        }

        this.updateConnectionStatus('ready');
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
            }
        } catch (error) {
            console.error('QR generation error:', error);
        }
    }

    setupPolling() {
        // Poll Supabase every 2 seconds
        this.pollInterval = setInterval(() => this.fetchImages(), 2000);
        this.fetchImages();
        this.updateConnectionStatus('connected');
    }

    async fetchImages() {
        try {
            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/scanner_images?session_id=eq.${this.sessionId}&order=created_at.asc`,
                {
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`Fetch failed: ${response.status}`);
            }

            const data = await response.json();

            if (data.length > this.images.length) {
                console.log('New images found:', data.length - this.images.length);
                this.images = data.map(row => ({
                    id: row.id,
                    data: row.image_data,
                    timestamp: new Date(row.created_at).getTime()
                }));
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
        if (confirm('Clear all images?')) {
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
        <img src="${image.data}" alt="Document ${index + 1}" loading="lazy">
        <div class="gallery-item-overlay">
          <div class="gallery-item-number">${index + 1}</div>
        </div>
      </div>
    `).join('');

        galleryGrid.querySelectorAll('.gallery-item').forEach(item => {
            item.addEventListener('click', () => {
                const image = this.images.find(img => img.id == item.dataset.id);
                if (image) this.openModal(image);
            });
        });
    }

    updateControls() {
        document.getElementById('pdf-controls').style.display = this.images.length > 0 ? 'flex' : 'none';
    }

    openModal(image) {
        this.selectedImageId = image.id;
        document.getElementById('modal-image').src = image.data;
        document.getElementById('image-modal').classList.add('active');
    }

    closeModal() {
        document.getElementById('image-modal').classList.remove('active');
        this.selectedImageId = null;
    }

    async generatePDF() {
        if (this.images.length === 0) {
            alert('No images to convert');
            return;
        }

        const btn = document.getElementById('generate-pdf-btn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<div class="spinner" style="width:18px;height:18px;border-width:2px;"></div> Generating...';
        btn.disabled = true;

        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 10;

            for (let i = 0; i < this.images.length; i++) {
                if (i > 0) doc.addPage();

                const imgProps = await this.getImageDimensions(this.images[i].data);

                const maxWidth = pageWidth - margin * 2;
                const maxHeight = pageHeight - margin * 2;

                let width = imgProps.width;
                let height = imgProps.height;
                const scale = Math.min(maxWidth / width, maxHeight / height);
                width *= scale;
                height *= scale;

                const x = (pageWidth - width) / 2;
                const y = (pageHeight - height) / 2;

                doc.addImage(this.images[i].data, 'JPEG', x, y, width, height);
            }

            doc.save(`scanned-document-${new Date().toISOString().slice(0, 10)}.pdf`);
        } catch (error) {
            console.error('PDF error:', error);
            alert('Failed to generate PDF: ' + error.message);
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    getImageDimensions(dataUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve({ width: img.width, height: img.height });
            img.onerror = reject;
            img.src = dataUrl;
        });
    }

    bindEvents() {
        document.getElementById('clear-btn').addEventListener('click', () => this.clearAllImages());
        document.getElementById('generate-pdf-btn').addEventListener('click', () => this.generatePDF());
        document.getElementById('modal-close').addEventListener('click', () => this.closeModal());
        document.querySelector('.modal-overlay').addEventListener('click', () => this.closeModal());
        document.getElementById('delete-image-btn').addEventListener('click', () => {
            if (this.selectedImageId) this.removeImage(this.selectedImageId);
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.closeModal();
        });
        window.addEventListener('beforeunload', () => {
            if (this.pollInterval) clearInterval(this.pollInterval);
        });
    }
}

document.addEventListener('DOMContentLoaded', () => new PDFScanner());
