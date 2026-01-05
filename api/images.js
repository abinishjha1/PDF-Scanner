import { addImage, getImages } from './_lib/sessions.js';

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb',
        },
    },
};

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { sessionId } = req.query;

    if (!sessionId) {
        return res.status(400).json({ error: 'Session ID required' });
    }

    if (req.method === 'POST') {
        // Upload new image
        try {
            const { imageData } = req.body;

            if (!imageData) {
                return res.status(400).json({ error: 'No image data provided' });
            }

            const image = addImage(sessionId, imageData);

            res.status(200).json({
                success: true,
                image: {
                    id: image.id,
                    timestamp: image.timestamp
                }
            });
        } catch (error) {
            console.error('Upload error:', error);
            res.status(500).json({ error: 'Failed to upload image' });
        }
    } else if (req.method === 'GET') {
        // Get all images for session
        try {
            const images = getImages(sessionId);
            res.status(200).json({
                images: images.map(img => ({
                    id: img.id,
                    data: img.data,
                    timestamp: img.timestamp
                }))
            });
        } catch (error) {
            console.error('Fetch error:', error);
            res.status(500).json({ error: 'Failed to fetch images' });
        }
    } else {
        res.status(405).json({ error: 'Method not allowed' });
    }
}
