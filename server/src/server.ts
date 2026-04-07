import type { Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { initializeDb } from './init.js';
import { closePools, createProduct, deleteProduct, isDatabaseReady, listProducts } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistPath = path.join(__dirname, '../../client/dist');

const isProduction = process.env.NODE_ENV === 'production';

const app = express();

const port = Number(process.env.PORT ?? 3000);

app.use(express.json());

app.get(`/healthz`, (_req, res) => {
  res.status(200).json({ ok: true });
});

app.get(`/readyz`, async (_req, res) => {
  const ready = await isDatabaseReady();

  if (!ready) {
    res.status(503).json({ ok: false });
    return;
  }

  res.status(200).json({ ok: true });
});

app.get(`/api/products`, async (_req, res) => {
  try {
    const products = await listProducts();
    res.json(products);
  } catch (error) {
    console.error('failed to list products', error);
    res.status(500).json({ error: 'Failed to list products' });
  }
});

app.post(`/api/products`, async (req, res) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const price = typeof req.body?.price === 'number' ? req.body.price : NaN;

    if (!name) {
      return res.status(400).json({ error: 'Product name is required' });
    }

    if (isNaN(price) || price < 0) {
      return res.status(400).json({ error: 'Product price must be a non-negative number' });
    }

    const product = await createProduct(name, price);

    return res.status(201).json(product);
  } catch (error) {
    console.error('failed to create product', error);

    return res.status(500).json({ error: 'Failed to create product' });
  }
});

app.delete(`/api/products/:id`, async (req, res) => {
  try {
    const id = Number(req.params?.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Product ID must be a positive integer' });
    }

    const deleted = await deleteProduct(id);

    if (!deleted) {
      return res.status(404).json({ error: 'Product not found' });
    }

    return res.status(204).send();
  } catch (error) {
    console.error('failed to delete product', error);

    return res.status(500).json({ error: 'Failed to delete product' });
  }
});

if (isProduction) {
  app.use(express.static(clientDistPath));

  app.get('/{*path}', (_req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

let server: Server | null = null;
let shuttingDown = false;

async function shutdown(signal: 'SIGINT' | 'SIGTERM'): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`Received ${signal}, shutting down...`);

  const forceExitTimer = setTimeout(() => {
    console.error('Shutdown timed out, forcing exit');
    process.exit(1);
  }, 10_000);

  forceExitTimer.unref();

  try {
    await Promise.allSettled([
      new Promise<void>((resolve, reject) => {
        if (!server) {
          resolve();
          return;
        }

        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
      closePools(),
    ]);
  } finally {
    clearTimeout(forceExitTimer);
    process.exit(0);
  }
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

try {
  await initializeDb();
  server = app.listen(port, () => {
    console.log(`Server is running on port http://127.0.0.1:${port}`);
  });
} catch (error) {
  console.error('Failed to initialize database', error);
  await closePools();
  process.exit(1);
}
