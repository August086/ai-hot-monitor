import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { capabilities, config, PROJECT_ROOT } from './config.js';
import { startScheduler, nextRunAt } from './scheduler.js';
import { initWebSocket } from './ws.js';
import hotspotsRouter from './routes/hotspots.js';
import keywordsRouter from './routes/keywords.js';
import notificationsRouter from './routes/notifications.js';
import settingsRouter from './routes/settings.js';
import systemRouter from './routes/system.js';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    if (!req.path.startsWith('/assets')) {
      console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - startedAt}ms`);
    }
  });
  next();
});

app.use('/api/keywords', keywordsRouter);
app.use('/api/hotspots', hotspotsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api', systemRouter);

app.use('/api', (req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

const indexHtml = path.join(config.publicDir, 'index.html');
if (fs.existsSync(indexHtml)) {
  app.use(express.static(config.publicDir, { maxAge: '1h', index: false }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    return res.sendFile(indexHtml);
  });
}

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error('[error]', error);
  return res.status(500).json({ error: error.message || '服务器内部错误' });
});

const server = http.createServer(app);
initWebSocket(server);
startScheduler();

server.listen(config.port, () => {
  const caps = capabilities();
  console.log('\n\x1b[36m╔══════════════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[36m║\x1b[0m  \x1b[1mNEON//WATCH\x1b[0m  AI 热点监控中枢            \x1b[36m║\x1b[0m');
  console.log('\x1b[36m╚══════════════════════════════════════════════╝\x1b[0m');
  console.log(`  API      http://localhost:${config.port}/api/health`);
  console.log(`  前端     http://localhost:${config.port}${fs.existsSync(indexHtml) ? '' : ' (未构建，开发模式请访问 5173)'}`);
  console.log(`  调度     每 ${config.crawler.intervalMinutes} 分钟 · 下一轮 ${nextRunAt()}`);
  console.log(`  AI       ${caps.ai ? config.ai.model : '未配置（启发式兜底）'}`);
  console.log(`  Twitter  ${caps.twitter ? '已配置' : '未配置（跳过）'}`);
  console.log(`  邮件     ${caps.email ? '已配置' : '未配置（仅浏览器推送）'}`);
  console.log(`  数据     ${path.relative(PROJECT_ROOT, config.dbPath)}\n`);
});

const shutdown = (signal) => {
  console.log(`\n[server] 收到 ${signal}，正在关闭…`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
