import sql from 'mssql';
import { getAdminPool, getAppPool } from './db.js';

const DB_NAME = process.env.MSSQL_DATABASE ?? 'demoapp';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function ensureDbExists(): Promise<void> {
  const adminPool = await getAdminPool();

  await adminPool
    .request()
    .input('dbName', sql.NVarChar(128), DB_NAME)
    .query(`
      IF DB_ID(@dbName) IS NULL                                                                                                                     
      BEGIN                                                                                                                                           
        DECLARE @sql NVARCHAR(MAX);                                                                                                                   
        SET @sql = N'CREATE DATABASE [' + REPLACE(@dbName, ']', ']]') + N']';
        EXEC(@sql);
      END
    `);
}

async function ensureSchemaExists() {
  const appPool = await getAppPool();

  await appPool.request().query(`
    IF OBJECT_ID(N'dbo.products', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.products (
        id INT IDENTITY(1,1) PRIMARY KEY,
        name NVARCHAR(255) NOT NULL,
        price DECIMAL(18, 2) NOT NULL,
        created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
      );
    END
  `);
}

async function ensureSeedData() {
  const appPool = await getAppPool();

  await appPool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM dbo.products)
    BEGIN
      INSERT INTO dbo.products (name, price)
      VALUES
        (N'Product 1', 9.99),
        (N'Product 2', 19.99);
    END
  `);
}

export async function initializeDb(retries = 20, delay = 3000): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await ensureDbExists();
      await ensureSchemaExists();
      await ensureSeedData();
      return;
    } catch (error: unknown) {
      if (error instanceof Error) {
        lastError = error;
      } else {
        lastError = new Error(String(error));
      }
      console.error(`Database initialization attempt ${attempt}/${retries} failed: ${JSON.stringify(lastError)}`);
      if (attempt < retries) {
        await sleep(delay);
      }
    }
  }

  throw lastError;
}