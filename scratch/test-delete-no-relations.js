const { DataSource } = require('typeorm');
require('dotenv').config();

async function runTest() {
  const AppDataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    entities: [
      'dist/**/*.entity.js'
    ],
    synchronize: false,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await AppDataSource.initialize();
    console.log('Data Source initialized.');
    
    // Find a course to test (WITHOUT loading relations)
    const courseRepo = AppDataSource.getRepository('Course');
    const course = await courseRepo.findOne({
      where: {}
    });

    if (!course) {
      console.log('No courses found to test deletion.');
      return;
    }

    console.log(`Testing softRemove on Course without relations loaded: ${course.name} (ID: ${course.courseId})`);
    
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    
    try {
      await queryRunner.manager.softRemove(course);
      console.log('softRemove without relations succeeded!');
    } catch (err) {
      console.error('softRemove without relations failed:', err);
    } finally {
      await queryRunner.rollbackTransaction();
      await queryRunner.release();
    }

  } catch (err) {
    console.error('Error initializing datasource:', err);
  } finally {
    await AppDataSource.destroy();
  }
}

runTest();
