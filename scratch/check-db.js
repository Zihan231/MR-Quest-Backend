const { Client } = require('pg');
require('dotenv').config();

async function testQuery() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to DB.');
    
    // Check if deletedAt column exists in courses and lessons
    const courseCols = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'courses' AND column_name = 'deletedAt';
    `);
    console.log('Course deletedAt column:', courseCols.rows);

    const lessonCols = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'lessons' AND column_name = 'deletedAt';
    `);
    console.log('Lesson deletedAt column:', lessonCols.rows);

  } catch (err) {
    console.error('Error running query:', err);
  } finally {
    await client.end();
  }
}

testQuery();
