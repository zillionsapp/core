import express from 'express';
import routes from './routes';
import { config } from '../config/env';
import cors from 'cors';
import path from 'path';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Main API routes
app.use('/api', routes);

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

if (require.main === module) {
    app.listen(port, () => {
        console.log(`[Zillion API] Server running at http://localhost:${port}`);
    });
}

export default app;
