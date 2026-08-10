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
    
    // Find a course to test
    const courseRepo = AppDataSource.getRepository('Course');
    const course = await courseRepo.findOne({
      where: {},
      relations: { lessons: true }
    });

    if (!course) {
      console.log('No courses found to test deletion.');
      return;
    }

    console.log(`Testing softRemove on Course: ${course.name} (ID: ${course.courseId})`);
    
    // Attempt softRemove inside a transaction but roll it back so we don't mess up data
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    
    try {
      await queryRunner.manager.softRemove(course);
      console.log('softRemove succeeded inside transaction!');
    } catch (err) {
      console.error('softRemove failed inside transaction:', err);
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
