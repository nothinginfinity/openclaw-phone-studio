const path = require('path');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const dotenv = require('dotenv');

const { initDb } = require('./db/db');
const authRoutes = require('./routes/auth');
const dmRoutes = require('./routes/dm');
const postingRoutes = require('./routes/posting');
const adminRoutes = require('./routes/admin');
const { createScheduler } = require('./services/scheduler');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3001);
const pwaOrigin = process.env.PWA_ORIGIN || 'http://localhost:3000';

initDb({
  dbPath: process.env.DB_PATH || path.join(__dirname, 'data', 'phone_studio.db'),
  schemaPath: path.join(__dirname, 'db', 'init.sql')
});

app.use(cors({
  origin: pwaOrigin,
  credentials: true
}));
app.use(express.json({ limit: '5mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.get('/', (req, res) => {
  res.json({
    service: 'openclaw-phone-studio',
    status: 'ok',
    docs: '/api/status'
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/dm', dmRoutes);
app.use('/api/post', postingRoutes);
app.use('/api', adminRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(port, () => {
  console.log(`OpenClaw Phone Studio listening on http://localhost:${port}`);
});

const scheduler = createScheduler();
scheduler.start();

process.on('SIGINT', () => {
  scheduler.stop();
  server.close(() => process.exit(0));
});
