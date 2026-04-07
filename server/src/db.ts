import sql from 'mssql';
import {config} from 'dotenv';

config({ path: '../.env' });

type DbConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

let adminPoolPromise: Promise<sql.ConnectionPool> | null = null;
let appPoolPromise: Promise<sql.ConnectionPool> | null = null;

function getConfig(): DbConfig {
  const cfg = {
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 1433),
    user: process.env.MSSQL_USER ?? 'sa',
    password: process.env.MSSQL_PASSWORD ?? '',
    database: process.env.MSSQL_DATABASE ?? 'master',
  };

  // output config for debugging purposes
  console.log('Database configuration:');
  console.log(`  Host: ${cfg.host}`);
  console.log(`  Port: ${cfg.port}`);
  console.log(`  User: ${cfg.user}`);
  console.log(`  Database: ${cfg.database}`);

  return cfg;
}


async function createPool(database: string): Promise<sql.ConnectionPool> {
  const config = getConfig();
  
  const pool = new sql.ConnectionPool({
    server: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
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
};

export function getAdminPool(): Promise<sql.ConnectionPool> {
  if (!adminPoolPromise) {
    adminPoolPromise = createPool('master');
  }

  return adminPoolPromise;
}

export function getAppPool(): Promise<sql.ConnectionPool> {
  if (!appPoolPromise) {
    const config = getConfig();
    appPoolPromise = createPool(config.database);
  }
  
  return appPoolPromise;
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

  const reuslt = await pool
  .request()
  .input('id', sql.Int, id)
  .query(`
    DELETE FROM products
    WHERE id = @id;
  `);

  return reuslt.rowsAffected[0] > 0;
}