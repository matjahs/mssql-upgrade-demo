export interface Product {
  id: number;
  name: string;
  price: number;
  created_at: string;
}

export async function getProducts(): Promise<Product[]> {
  const response = await fetch(`/api/products`);

  if (!response.ok) {
    throw new Error(`Failed to fetch products: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export async function addProduct(input: { name: string; price: number }): Promise<Product> {
  const response = await fetch(`/api/products`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Failed to add product: ${errorData.error || response.statusText}`);
  }

  return response.json();
}

export async function deleteProduct(id: number): Promise<void> {
  const response = await fetch(`/api/products/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Failed to delete product: ${errorData.error || response.statusText}`);
  }
}

