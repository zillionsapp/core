import express from 'express';
import routes from './routes';
import { config } from '../config/env';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

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
