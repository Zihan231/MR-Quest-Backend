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
      SELECT category.id AS "categoryId", category.name AS "categoryName", 
             COUNT(DISTINCT course.id) AS "coursesCount", 
             COUNT(enrollment.id) AS "totalEnrolled", 
             COALESCE(AVG(enrollment.progress), 0) AS "averageProgress" 
      FROM "categories" "category" 
      LEFT JOIN "courses" "course" ON "course"."categoryId"="category"."id" 
      LEFT JOIN "enrollments" "enrollment" ON "enrollment"."courseId"="course"."id" 
      GROUP BY category.id 
      ORDER BY "averageProgress" DESC 
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
