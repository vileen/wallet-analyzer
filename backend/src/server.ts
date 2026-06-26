import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { authMiddleware } from './auth';
import { startWorker } from './worker';
import authRoutes from './routes/auth';
import walletRoutes from './routes/wallets';
import transactionRoutes from './routes/transactions';

const app = express();
const PORT = process.env.PORT || 3004;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

app.use(cors({
  origin: FRONTEND_URL,
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Public routes
app.use('/api/auth', authRoutes);

// Protected routes
app.use('/api/wallets', authMiddleware, walletRoutes);
app.use('/api/transactions', authMiddleware, transactionRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Frontend URL: ${FRONTEND_URL}`);
  
  // Start background worker
  startWorker();
});
