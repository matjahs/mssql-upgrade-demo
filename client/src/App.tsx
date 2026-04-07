import * as React from "react";
import { addProduct, getProducts, deleteProduct, type Product } from "./api";

export default function App() {
  const [products, setProducts] = React.useState<Product[]>([]);
  const [name, setName] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function loadProducts() {
    try {
      setError("");
      const nextProducts = await getProducts();
      setProducts(nextProducts);
    } catch (err) {
      console.error("Failed to load products", err);
      setError("Failed to load products");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void loadProducts();
  }, []);

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = name.trim();
    const numericPrice = Number(price);

    if (!trimmedName) {
      setError("Product name is required");
      return;
    }

    if (isNaN(numericPrice) || numericPrice < 0) {
      setError("Product price must be a non-negative number");
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      const created = await addProduct({
        name: trimmedName,
        price: numericPrice,
      });

      setProducts((current) => [...current, created]);
      setName("");
      setPrice("");
    } catch (err) {
      console.error("Failed to add product", err);
      setError("Failed to add product");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      setError("");
      await deleteProduct(id);
      setProducts((current) => current.filter((p) => p.id !== id));
    } catch (err) {
      console.error("Failed to delete product", err);
      setError("Failed to delete product");
    }
  }

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: 24,
        fontFamily: "sans-serif",
      }}
    >
      <h1>SQL App</h1>
      <p>Products</p>
      <form
        onSubmit={handleSubmit}
        style={{ display: "grid", gap: 12, marginBottom: 24 }}
      >
        <input
          type="text"
          placeholder="Product name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />{" "}
        <input
          type="number"
          step="0.01"
          min="0"
          placeholder="Price"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
        />{" "}
        <button type="submit" disabled={submitting}>
          {" "}
          {submitting ? "Adding..." : "Add Product"}
        </button>{" "}
      </form>{" "}
      {error ? <p style={{ color: "crimson" }}>{error}</p> : null}
      {loading ? (
        <p>Loading...</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          {" "}
          <thead>
            {" "}
            <tr>
              {" "}
              <th align="left">ID</th>
              <th align="left">Name</th> <th align="left">Price</th>{" "}
              <th align="left">Created</th> <th align="left">Action</th>
            </tr>{" "}
          </thead>{" "}
          <tbody>
            {" "}
            {products.map((product) => (
              <tr key={product.id}>
                {" "}
                <td>{product.id}</td> <td>{product.name}</td>{" "}
                <td>${Number(product.price).toFixed(2)}</td>
                <td>{new Date(product.created_at).toLocaleString()}</td>{" "}
                <td>
                  {" "}
                  <button
                    type="button"
                    onClick={() => void handleDelete(product.id)}
                  >
                    {" "}
                    Delete
                  </button>{" "}
                </td>{" "}
              </tr>
            ))}
            {products.length === 0 ? (
              <tr>
                {" "}
                <td colSpan={5}>No products yet.</td>{" "}
              </tr>
            ) : null}{" "}
          </tbody>{" "}
        </table>
      )}
    </main>
  );
}
