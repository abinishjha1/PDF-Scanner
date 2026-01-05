// In-memory image storage
// Note: This resets on each serverless cold start
// For production, use Redis, Supabase, or Vercel KV

const sessions = {};

function getSession(sessionId) {
    if (!sessions[sessionId]) {
        sessions[sessionId] = {
            images: [],
            createdAt: Date.now()
        };
    }
    return sessions[sessionId];
}

function addImage(sessionId, imageData) {
    const session = getSession(sessionId);
    const image = {
        id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        data: imageData,
        timestamp: Date.now()
    };
    session.images.push(image);

    // Limit to 20 images to prevent memory issues
    if (session.images.length > 20) {
        session.images = session.images.slice(-20);
    }

    return image;
}

function getImages(sessionId) {
    const session = getSession(sessionId);
    return session.images;
}

module.exports = async function handler(req, res) {
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
        try {
            const { imageData } = req.body;

            if (!imageData) {
                return res.status(400).json({ error: 'No image data provided' });
            }

            const image = addImage(sessionId, imageData);

            return res.status(200).json({
                success: true,
                image: {
                    id: image.id,
                    timestamp: image.timestamp
                }
            });
        } catch (error) {
            console.error('Upload error:', error);
            return res.status(500).json({ error: 'Failed to save image' });
        }
    } else if (req.method === 'GET') {
        try {
            const images = getImages(sessionId);
            return res.status(200).json({
                images: images.map(img => ({
                    id: img.id,
                    data: img.data,
                    timestamp: img.timestamp
                })),
                count: images.length
            });
        } catch (error) {
            console.error('Fetch error:', error);
            return res.status(500).json({ error: 'Failed to fetch images' });
        }
    } else {
        return res.status(405).json({ error: 'Method not allowed' });
    }
};

// Configure body parser for large payloads
module.exports.config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb',
        },
    },
};
