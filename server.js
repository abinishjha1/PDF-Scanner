import express from 'express';
import { WebSocketServer } from 'ws';
import multer from 'multer';
import QRCode from 'qrcode';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { networkInterfaces } from 'os';
import { existsSync, mkdirSync, readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// Store active sessions and their images
const sessions = new Map();

// Get local network IP
function getLocalIP() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

const LOCAL_IP = getLocalIP();
const PORT = 3000;

// Ensure uploads directory exists
const uploadsDir = join(__dirname, 'uploads');
if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const sessionId = req.params.sessionId;
    const sessionDir = join(uploadsDir, sessionId);
    if (!existsSync(sessionDir)) {
      mkdirSync(sessionDir, { recursive: true });
    }
    cb(null, sessionDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}.jpg`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Serve static files
app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadsDir));

// Generate QR code for a session
app.get('/api/qrcode/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const mobileUrl = `http://${LOCAL_IP}:${PORT}/mobile.html?session=${sessionId}`;
    
    const qrCodeDataUrl = await QRCode.toDataURL(mobileUrl, {
      width: 300,
      margin: 2,
      color: {
        dark: '#ffffff',
        light: '#00000000'
      }
    });
    
    res.json({ 
      qrCode: qrCodeDataUrl, 
      mobileUrl,
      localIP: LOCAL_IP 
    });
  } catch (error) {
    console.error('QR generation error:', error);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// Handle image upload from mobile
app.post('/api/upload/:sessionId', upload.single('image'), (req, res) => {
  try {
    const { sessionId } = req.params;
    
    if (!req.file) {
      return res.status(400).json({ error: 'No image provided' });
    }
    
    const imageUrl = `/uploads/${sessionId}/${req.file.filename}`;
    
    // Initialize session if not exists
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, { images: [], clients: new Set() });
    }
    
    const session = sessions.get(sessionId);
    session.images.push({
      id: req.file.filename,
      url: imageUrl,
      timestamp: Date.now()
    });
    
    // Broadcast to all connected desktop clients for this session
    wss.clients.forEach(client => {
      if (client.readyState === 1 && client.sessionId === sessionId) {
        client.send(JSON.stringify({
          type: 'new-image',
          image: {
            id: req.file.filename,
            url: imageUrl,
            timestamp: Date.now()
          }
        }));
      }
    });
    
    res.json({ success: true, imageUrl });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// Get all images for a session
app.get('/api/images/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);
  res.json({ images: session?.images || [] });
});

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const sessionId = url.searchParams.get('session');
  
  if (sessionId) {
    ws.sessionId = sessionId;
    
    // Initialize session if not exists
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, { images: [], clients: new Set() });
    }
    
    console.log(`Desktop connected to session: ${sessionId}`);
    
    // Send existing images
    const session = sessions.get(sessionId);
    ws.send(JSON.stringify({
      type: 'init',
      images: session.images
    }));
  }
  
  ws.on('close', () => {
    console.log(`Client disconnected from session: ${ws.sessionId}`);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 PDF Scanner Server running!`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Network: http://${LOCAL_IP}:${PORT}`);
  console.log(`\n📱 Mobile devices can connect via the QR code\n`);
});
