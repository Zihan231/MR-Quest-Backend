import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
dotenv.config();

const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  try {
    await AppDataSource.initialize();
    console.log('Connected!');

    // Check schema
    const q1 = `
      SELECT eg.id AS "examGroupId", eg.title, eg.status,
             COUNT(DISTINCT q.id) AS "totalQuestions",
             COUNT(DISTINCT e.id) AS "totalEnrolled"
      FROM "exam_groups" eg
      LEFT JOIN "exam_group_questions" q ON q."examGroupId" = eg.id
      LEFT JOIN "exam_group_enrollments" e ON e."examGroupId" = eg.id
      GROUP BY eg.id
      ORDER BY eg.id DESC
      LIMIT 6 OFFSET 0
    `;
    console.log(await AppDataSource.query(q1));
  } catch (e) {
    console.error(e.message);
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}
run();
