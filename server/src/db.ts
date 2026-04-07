import sql from 'mssql';

type DbConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

let adminPoolPromise: Promise<sql.ConnectionPool> | null = null;
let appPoolPromise: Promise<sql.ConnectionPool> | null = null;

async function closePool(poolPromise: Promise<sql.ConnectionPool> | null): Promise<void> {
  if (!poolPromise) {
    return;
  }

  try {
    const pool = await poolPromise;
    await pool.close();
  } catch {
    // Ignore connection and shutdown errors during cleanup.
  }
}

function getConfig(): DbConfig {
  return {
    host: process.env.MSSQL_HOST ?? '127.0.0.1',
    port: Number(process.env.MSSQL_PORT ?? 1433),
    user: process.env.MSSQL_USER ?? 'sa',
    password: process.env.MSSQL_PASSWORD ?? '',
    database: process.env.MSSQL_DATABASE ?? 'demoapp',
  };
}

async function connectPool(database: string): Promise<sql.ConnectionPool> {
  const cfg = getConfig();
  const pool = new sql.ConnectionPool({
    server: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database,
    options: {
      encrypt: false,
      trustServerCertificate: true,
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
   });

  return pool.connect();
}

function memoizePool(
  current: Promise<sql.ConnectionPool> | null,
  set: (value: Promise<sql.ConnectionPool> | null) => void,
  database: string
): Promise<sql.ConnectionPool> {
  if (!current) {
    const promise = connectPool(database).catch((error) => {
      set(null);
      throw error;
    });
    set(promise);
    return promise;
  }

  return current;
}

export function getAdminPool(): Promise<sql.ConnectionPool> {
  return memoizePool(adminPoolPromise, (value) => (adminPoolPromise = value), 'master');
}

export function getAppPool(): Promise<sql.ConnectionPool> {
  return memoizePool(appPoolPromise, (value) => (appPoolPromise = value), getConfig().database);
}

export async function closePools(): Promise<void> {
  const adminPool = adminPoolPromise;
  const appPool = appPoolPromise;

  adminPoolPromise = null;
  appPoolPromise = null;

  await Promise.all([closePool(adminPool), closePool(appPool)]);
}

export async function isDatabaseReady(): Promise<boolean> {
  try {
    const pool = await getAppPool();
    await pool.request().query('SELECT 1');
    return true;
  } catch (error) {
    console.error('Database connection error:', error);
    return false;
  }
}

export async function listProducts() {
  const pool = await getAppPool();
  const result = await pool
  .request()
  .query(`
    SELECT id, name, price, created_at
    FROM products
    ORDER BY id ASC;  
  `);

  return result.recordset;
}

export interface Product {
  id: number;
  name: string;
  price: number;
  created_at: Date;
}

export async function createProduct(name: string, price: number): Promise<Product> {
  const pool = await getAppPool();
  const result = await pool
  .request()
  .input('name', sql.NVarChar(255), name)
  .input('price', sql.Decimal(18, 2), price)
  .query(`
    INSERT INTO products (name, price)
    OUTPUT inserted.id, inserted.name, inserted.price, inserted.created_at
    VALUES (@name, @price);
  `);

  return result.recordset[0];
}

export async function deleteProduct(id: number): Promise<boolean> {
  const pool = await getAppPool();

  const result = await pool
  .request()
  .input('id', sql.Int, id)
  .query(`
    DELETE FROM products
    WHERE id = @id;
  `);

  return result.rowsAffected[0] > 0;
}
