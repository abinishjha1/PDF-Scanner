// In-memory session storage for Vercel serverless functions
// Note: This is ephemeral and will reset between deployments
// For production, use a database like Supabase, Redis, or Vercel KV

const sessions = new Map();

export function getSession(sessionId) {
    if (!sessions.has(sessionId)) {
        sessions.set(sessionId, {
            images: [],
            createdAt: Date.now()
        });
    }
    return sessions.get(sessionId);
}

export function addImage(sessionId, imageData) {
    const session = getSession(sessionId);
    const image = {
        id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        data: imageData, // Base64 data
        timestamp: Date.now()
    };
    session.images.push(image);
    return image;
}

export function getImages(sessionId) {
    const session = getSession(sessionId);
    return session.images;
}

export function clearSession(sessionId) {
    sessions.delete(sessionId);
}
