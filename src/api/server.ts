import express from 'express';
import routes from './routes';
import { config } from '../config/env';
import cors from 'cors';
import path from 'path';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

// Main API routes
app.use('/api', routes);

// Serve static files from the root 'public' directory (after API routes)
app.use(express.static(path.join(__dirname, '../../public')));

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

export const startApi = (p?: number | string) => {
    const serverPort = p || port;
    app.listen(serverPort, () => {
        console.log(`[Zillion API] Server running at http://localhost:${serverPort}`);
    });
};

if (require.main === module) {
    startApi();
}

export default app;
