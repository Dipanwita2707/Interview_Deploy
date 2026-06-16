const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration() {
  console.log("Connecting to Database:", process.env.DATABASE_URL.split('@')[1] || "No DB URL found");
  
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    const sql = fs.readFileSync(path.join(__dirname, 'database/migrations/005_add_complexity_metrics.sql'), 'utf8');
    
    console.log("Running Migration...");
    await client.query(sql);
    console.log("✅ Migration applied successfully! The columns have been added.");
  } catch (err) {
    console.error("❌ Migration failed:", err);
  } finally {
    await client.end();
  }
}

runMigration();
