const QRCode = require('qrcode');

module.exports = async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { sessionId } = req.query;

    if (!sessionId) {
        return res.status(400).json({ error: 'Session ID required' });
    }

    try {
        // Get the host from request headers for the mobile URL
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        const mobileUrl = `${protocol}://${host}/mobile.html?session=${sessionId}`;

        const qrCodeDataUrl = await QRCode.toDataURL(mobileUrl, {
            width: 300,
            margin: 2,
            color: {
                dark: '#ffffff',
                light: '#00000000'
            }
        });

        res.status(200).json({
            qrCode: qrCodeDataUrl,
            mobileUrl
        });
    } catch (error) {
        console.error('QR generation error:', error);
        res.status(500).json({ error: 'Failed to generate QR code', details: error.message });
    }
};
