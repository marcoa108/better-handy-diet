import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Static assets
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// API: serve diet data from file
app.get('/api/diet', (req, res) => {
  const dataPath = path.join(__dirname, 'data', 'diet_data.json');
  fs.readFile(dataPath, 'utf8', (err, data) => {
    if (err) {
      console.error('Failed to read diet data:', err);
      return res.status(500).json({ error: 'Failed to load diet data' });
    }
    try {
      const json = JSON.parse(data);
      res.json(json);
    } catch (e) {
      console.error('Invalid JSON in diet_data.json:', e);
      res.status(500).json({ error: 'Invalid diet data format' });
    }
  });
});

// Default route to una-colonna page for convenience
app.get('/', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index - una colonna.html'));
});

app.listen(PORT, () => {
  console.log(`Better Handy Diet server running at http://localhost:${PORT}`);
});
