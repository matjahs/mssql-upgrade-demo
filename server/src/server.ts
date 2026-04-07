import express from 'express';

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(express.json());

app.get(`/healthz`, (_req, res) => {
  res.status(200).json({ ok: true });
});

app.get(`/readyz`, (_req, res) => {
  res.status(200).json({ ok: true });
});

app.get(`/api/products`, (_req, res) => {
  res.json([
    { id: 1, name: 'Product 1', price: 9.99 },
    { id: 2, name: 'Product 2', price: 19.99 },
  ]);
});

app.post(`/api/products`, (req, res) => {
  const { name, price } = req.body ?? {};

  if (!name || typeof price !== 'number') {
    return res.status(400).json({ error: 'Invalid product data' });
  }

  return res.status(201).json({
    id: Date.now(),
    name,
    price
  });
});

app.delete(`/api/products/:id`, (req, res) => {
  const { id } = req.params;
  
  if (!id) {
    return res.status(400).json({ error: 'Product ID is required' });
  }

  return res.status(204).send();
});

app.listen(port, () => {
  console.log(`Server is running on port http://127.0.0.1:${port}`);
});