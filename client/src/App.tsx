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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
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
      setProducts((current) => current.filter((product) => product.id !== id));
    } catch (err) {
      console.error("Failed to delete product", err);
      setError("Failed to delete product");
    }
  }

  return (
    <main className="container py-4 py-md-5">
      <div className="mx-auto" style={{ maxWidth: 960 }}>
        <section className="mb-4 text-center text-md-start">
          <h1 className="mb-2">SQL App</h1>
          <p className="mb-0 text-body-secondary">
            Manage products with a small Bootstrap refresh.
          </p>
        </section>

        <section className="card border-0 shadow-sm mb-4">
          <div className="card-body p-4">
            <h2 className="h5 mb-3">Add Product</h2>

            <form className="row g-3 align-items-end" onSubmit={handleSubmit}>
              <div className="col-12 col-md-5">
                <label className="form-label" htmlFor="product-name">
                  Product name
                </label>
                <input
                  id="product-name"
                  className="form-control"
                  type="text"
                  placeholder="Product name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>

              <div className="col-12 col-md-4">
                <label className="form-label" htmlFor="product-price">
                  Price
                </label>
                <div className="input-group">
                  <span className="input-group-text">€</span>
                  <input
                    id="product-price"
                    className="form-control"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="12.99"
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
                  />
                </div>
              </div>

              <div className="col-12 col-md-3">
                <button
                  className="btn btn-primary w-100"
                  type="submit"
                  disabled={submitting}
                >
                  {submitting ? "Adding..." : "Add Product"}
                </button>
              </div>
            </form>

            {error ? (
              <div className="alert alert-danger mt-3 mb-0" role="alert">
                {error}
              </div>
            ) : null}
          </div>
        </section>

        <section className="card border-0 shadow-sm">
          <div className="card-body p-0">
            <div className="d-flex align-items-center justify-content-between px-4 py-3 border-bottom">
              <h2 className="h5 mb-0">Products</h2>
              <span className="badge text-bg-light">{products.length} items</span>
            </div>

            {loading ? (
              <div className="p-4 text-body-secondary">Loading...</div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead className="table-light">
                    <tr>
                      <th scope="col">ID</th>
                      <th scope="col">Name</th>
                      <th scope="col">Price</th>
                      <th scope="col">Created</th>
                      <th scope="col" className="text-end">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product) => (
                      <tr key={product.id}>
                        <td>{product.id}</td>
                        <td className="fw-medium">{product.name}</td>
                        <td className="product-price">
                          €{Number(product.price).toFixed(2)}
                        </td>
                        <td>{new Date(product.created_at).toLocaleString()}</td>
                        <td className="text-end">
                          <button
                            className="btn btn-outline-danger btn-sm"
                            type="button"
                            onClick={() => void handleDelete(product.id)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}

                    {products.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-4 text-body-secondary">
                          No products yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
