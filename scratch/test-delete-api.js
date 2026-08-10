async function runApiTest() {
  const baseURL = 'http://localhost:3000';
  
  try {
    console.log('1. Logging in as Admin...');
    const loginRes = await fetch(`${baseURL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@example.com',
        password: 'password123'
      })
    });
    
    const cookie = loginRes.headers.get('set-cookie');
    console.log('Logged in. Cookie received:', cookie ? 'Yes' : 'No');

    // Create course
    console.log('2. Creating a test course...');
    const createCourseRes = await fetch(`${baseURL}/courses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
      body: JSON.stringify({ name: 'Lesson Deletion Test Course' })
    });
    const courseData = await createCourseRes.json();
    const courseId = courseData.courseId;
    console.log('Course ID:', courseId);

    // Create lesson
    console.log('3. Adding a lesson to the course...');
    const createLessonRes = await fetch(`${baseURL}/courses/${courseId}/lessons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
      body: JSON.stringify({
        title: 'Deletion Test Lesson',
        materialType: 'Video',
        materialLink: 'https://example.com/video.mp4'
      })
    });
    const lessonData = await createLessonRes.json();
    const lessonId = lessonData.lessonId;
    console.log('Lesson ID:', lessonId);

    // Test Soft Delete Lesson
    console.log('4. Soft deleting the lesson...');
    const deleteRes = await fetch(`${baseURL}/courses/${courseId}/lessons/${lessonId}`, {
      method: 'DELETE',
      headers: { 'Cookie': cookie }
    });
    console.log('Soft Delete Response:', deleteRes.status, await deleteRes.json());

    // Check in trash
    console.log('5. Checking trash list for lesson...');
    const trashRes = await fetch(`${baseURL}/courses/trash?type=lesson`, {
      headers: { 'Cookie': cookie }
    });
    const trashData = await trashRes.json();
    const found = trashData.find(item => item.id === lessonId);
    console.log('Found in trash:', found ? 'Yes' : 'No');

    // Restore Lesson
    if (found) {
      console.log('6. Restoring the lesson...');
      const restoreRes = await fetch(`${baseURL}/courses/${courseId}/lessons/${lessonId}/restore`, {
        method: 'PATCH',
        headers: { 'Cookie': cookie }
      });
      console.log('Restore Response:', restoreRes.status, await restoreRes.json());
    }

    // Hard delete lesson
    console.log('7. Permanently deleting the lesson...');
    const hardDeleteRes = await fetch(`${baseURL}/courses/${courseId}/lessons/${lessonId}/permanent`, {
      method: 'DELETE',
      headers: { 'Cookie': cookie }
    });
    console.log('Hard Delete Response:', hardDeleteRes.status, await hardDeleteRes.json());

    // Clean up course
    await fetch(`${baseURL}/courses/${courseId}/permanent`, {
      method: 'DELETE',
      headers: { 'Cookie': cookie }
    });

  } catch (err) {
    console.error('Test script error:', err.message);
  }
}

runApiTest();
