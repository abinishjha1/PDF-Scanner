// In-memory session storage for Vercel serverless functions
// Note: This is ephemeral and will reset between cold starts
// For production, use a database like Supabase, Redis, or Vercel KV

const sessions = new Map();

function getSession(sessionId) {
    if (!sessions.has(sessionId)) {
        sessions.set(sessionId, {
            images: [],
            createdAt: Date.now()
        });
    }
    return sessions.get(sessionId);
}

function addImage(sessionId, imageData) {
    const session = getSession(sessionId);
    const image = {
        id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        data: imageData, // Base64 data
        timestamp: Date.now()
    };
    session.images.push(image);
    return image;
}

function getImages(sessionId) {
    const session = getSession(sessionId);
    return session.images;
}

function clearSession(sessionId) {
    sessions.delete(sessionId);
}

module.exports = { getSession, addImage, getImages, clearSession };
