# TrainXcel Backend — Full Project Context

> **Last Updated:** 2026-07-11
> **Repository:** https://github.com/Zihan231/TrainXcel
> **Stack:** NestJS · TypeORM · PostgreSQL (Neon DB) · JWT via HTTP-only cookies

---

## 1. Project Overview

TrainXcel is an enterprise learning management platform (LMS). The backend is a NestJS REST API connected to a PostgreSQL database (hosted on Neon). It handles:

- User registration, login, and role management
- Course creation, lesson management, and enrollment
- Progress tracking and completion
- Analytics/dashboard statistics
- Pagination, filtering, and search for both courses and users

---

## 2. Tech Stack

| Layer       | Technology                         |
|-------------|-------------------------------------|
| Framework   | NestJS (Node.js)                   |
| Language    | TypeScript                         |
| ORM         | TypeORM                            |
| Database    | PostgreSQL via Neon DB             |
| Auth        | JWT (stored in HTTP-only cookie)   |
| Validation  | NestJS ValidationPipe + DTOs       |

**Key packages:**
- @nestjs/jwt, @nestjs/passport, passport-jwt
- typeorm, pg
- bcrypt (password hashing)
- cookie-parser (JWT cookie reading)
- class-validator, class-transformer (DTO validation)

---

## 3. Entry Point (main.ts)

- Runs on PORT from environment (default: 3000)
- Cookie parser enabled globally
- CORS enabled for: process.env.FRONTEND_URL, http://localhost:3001, http://localhost:3000
- ValidationPipe enabled globally with whitelist: true (strips unknown fields) and transform: true

---

## 4. Database Configuration (app.module.ts)

- Type: postgres, URL from process.env.DATABASE_URL
- autoLoadEntities: true, synchronize: true (dev only)
- SSL: rejectUnauthorized: false (required for Neon DB)
- Connection Pool: max: 20, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000

---

## 5. Database Entities

### 5.1 User entity (users table)

| Column       | Type   | Notes                                       |
|--------------|--------|---------------------------------------------|
| id           | int PK | Auto-incremented                            |
| email        | string | Unique                                      |
| name         | string | Indexed                                     |
| password     | string | select: false — NEVER fetched by default    |
| userId       | string | Unique, e.g. TX-0001                        |
| role         | string | user / employee / admin — Indexed           |
| phoneNumber  | string | Nullable                                    |
| address      | string | Nullable                                    |
| createdAt    | Date   | Auto                                        |
| updatedAt    | Date   | Auto                                        |

Has OneToMany to Enrollment.

### 5.2 Course entity (courses table)

| Column   | Type   | Notes                                         |
|----------|--------|-----------------------------------------------|
| id       | int PK | Auto-incremented                              |
| name     | string | Indexed                                       |
| courseId | string | Unique, e.g. CRS-0001                        |
| enrolled | int    | Count of enrolled users (default: 0)         |
| status   | string | active / inactive / draft — Indexed          |

- ManyToOne to Category (nullable, SET NULL on delete)
- OneToMany to Lesson (cascade)
- OneToMany to Enrollment
- completionRate is a computed field (not stored, calculated at runtime)

### 5.3 Lesson entity (lessons table)

| Column       | Type   | Notes                          |
|--------------|--------|--------------------------------|
| id           | int PK | Auto-incremented               |
| title        | string | Indexed                        |
| lessonId     | string | Unique, e.g. LES-0001         |
| description  | text   | Nullable                       |
| materialType | string | Video / PDF / PPT              |
| materialLink | string | URL to material                |
| status       | string | Active / Draft (default: Draft)|

- ManyToOne to Course (CASCADE delete)

### 5.4 Category entity

| Column | Type   | Notes               |
|--------|--------|---------------------|
| id     | int PK | Auto-incremented    |
| name   | string | Category name       |

- OneToMany to Course

### 5.5 Enrollment entity

Tracks which user is enrolled in which course and their progress.
- ManyToOne to User
- ManyToOne to Course
- Tracks progress (percentage 0-100) and completedAt date

---

## 6. Authentication (/auth)

Auth Strategy: JWT stored in HTTP-only cookie named "jwt".
Cookie config: httpOnly: true, sameSite: lax, maxAge: 1 hour.
JwtAuthGuard used on protected routes — reads cookie automatically.

### Auth Endpoints

| Method | Endpoint                   | Auth | Description                              |
|--------|----------------------------|------|------------------------------------------|
| POST   | /auth/register             | No   | Register new user (forces default 'user' role), returns JWT cookie |
| POST   | /auth/login                | No   | Login, returns JWT cookie               |
| POST   | /auth/logout               | No   | Clears JWT cookie                       |
| GET    | /auth/profile              | Yes  | Get own profile (from JWT token)        |
| GET    | /auth/users                | Yes  | List users — paginated (10/page)        |
| GET    | /auth/users/search         | Yes  | Search users by name/email/userId       |
| POST   | /auth/users/employee       | Yes  | Create employee user directly (admin only) |
| GET    | /auth/profile/:userId      | Yes  | Get any user profile by userId          |
| PATCH  | /auth/users/:userId        | Yes  | Update own profile (requester ID must match, admin can bypass) |
| PATCH  | /auth/users/:userId/role   | Yes  | Update user role (admin only)           |

### User Roles
- user — default, cannot create/manage courses
- employee — can create and manage courses and lessons
- admin — full access including role management

### Security Model for Protected Endpoints

All endpoints that require a role check (admin/employee) use the following hardened pattern:

1. JwtAuthGuard validates the cookie and populates req.user = { userId, role }
2. Controller extracts req.user.userId (never trusts req.user.role or any body field)
3. Controller passes userId to the service as a separate requesterId parameter
4. Service queries the DB fresh using that requesterId to get the current role
5. Role check is performed against the live DB record, not the JWT payload

This prevents:
- A user sending a spoofed userId in the request body to impersonate another user
- A stale JWT role being used (e.g., user demoted after login but JWT still says admin)
- Any injection of admin userId through request body fields

DTOs that previously contained userId (CreateCourseDto, UpdateCourseDto, CreateLessonDto,
UpdateLessonDto) have had userId removed entirely. The client CANNOT send userId.

---

## 7. Courses Module (/courses)

### Course Endpoints

| Method | Endpoint                        | Auth | Description                              |
|--------|---------------------------------|------|------------------------------------------|
| GET    | /courses                        | No   | List courses — paginated + filtered (sorted by recent first) |
| GET    | /courses/:courseId              | No   | Get single course with full details      |
| POST   | /courses                        | Yes  | Create a course (admin/employee only)    |
| PATCH  | /courses/:courseId              | Yes  | Update course details                    |
| PATCH  | /courses/:courseId/status       | Yes  | Update course status only                |
| DELETE | /courses/:courseId              | Yes  | Delete a course (admin/employee only)    |

### Category Endpoints

| Method | Endpoint              | Auth | Description             |
|--------|-----------------------|------|-------------------------|
| GET    | /courses/categories   | No   | List all categories     |
| POST   | /courses/categories   | Yes  | Create a new category   |

### Lesson Endpoints

| Method | Endpoint                               | Auth | Description                     |
|--------|----------------------------------------|------|---------------------------------|
| GET    | /courses/:courseId/lessons             | No   | List all lessons for a course   |
| POST   | /courses/:courseId/lessons             | Yes  | Add lesson to a course          |
| PATCH  | /courses/:courseId/lessons/:lessonId   | Yes  | Update a lesson                 |
| DELETE | /courses/:courseId/lessons/:lessonId   | Yes  | Delete a lesson (admin/employee only) |

### Enrollment & Progress Endpoints

| Method | Endpoint                                        | Auth | Description                     |
|--------|-------------------------------------------------|------|---------------------------------|
| POST   | /courses/:courseId/enroll                       | Yes  | Enroll logged-in user in course |
| POST   | /courses/:courseId/lessons/:lessonId/complete   | Yes  | Mark a lesson as complete       |
| GET    | /courses/:courseId/progress/:userId             | No   | Get user progress on a course   |

### Recycle Bin (Trash) Endpoints

All trash/recycle bin endpoints require roles: `admin` or `employee`.

| Method | Endpoint                                    | Auth | Description                                                |
|--------|---------------------------------------------|------|------------------------------------------------------------|
| GET    | /courses/trash                              | Yes  | Search & filter soft-deleted items (courses/lessons)        |
| DELETE | /courses/trash/empty                        | Yes  | Permanently empty all items from the bin                   |
| PATCH  | /courses/:courseId/restore                  | Yes  | Restore soft-deleted course                                |
| PATCH  | /courses/:courseId/lessons/:lessonId/restore| Yes  | Restore soft-deleted lesson                                |
| DELETE | /courses/:courseId/permanent                | Yes  | Permanently hard-delete course                             |
| DELETE | /courses/:courseId/lessons/:lessonId/permanent| Yes| Permanently hard-delete lesson                             |

### Search Endpoints

| Method | Endpoint                  | Auth | Description                                       |
|--------|---------------------------|------|---------------------------------------------------|
| GET    | /courses/search           | No   | Search courses by name/courseId (case-insensitive)|
| GET    | /courses/search/unified   | No   | Search both courses AND employees                 |

### Statistics Endpoints

| Method | Endpoint                                    | Auth | Description                          |
|--------|---------------------------------------------|------|--------------------------------------|
| GET    | /courses/stats/dashboard                    | No   | Total users, courses, completion rate|
| GET    | /courses/stats/monthly-progress             | No   | Monthly enrollment/completion trend  |
| GET    | /courses/stats/course-progress-comparison   | No   | Compare progress across courses      |
| GET    | /courses/stats/performance                  | No   | Course performance metrics           |
| GET    | /courses/stats/user-performance             | No   | User-level performance stats         |
| GET    | /courses/stats/categories                   | No   | Courses grouped by category          |
| GET    | /courses/stats/materials                    | No   | Materials breakdown (Video/PDF/PPT)  |
| GET    | /courses/stats/at-risk                      | No   | Users with low progress              |
| GET    | /courses/stats/recent-activity              | No   | Latest enrollments and completions   |

---

## 8. Unified Course List API (GET /courses)

The PRIMARY frontend endpoint for the course listing page. All query params are optional and composable:

| Query Param | Type   | Description                                              |
|-------------|--------|----------------------------------------------------------|
| page        | number | Page number (default: 1)                                |
| limit       | number | Items per page (default: 6)                             |
| q           | string | Text search (case-insensitive) on name or courseId      |
| categoryId  | number | Filter by category ID                                   |
| status      | string | Filter by status: active, inactive, draft               |

Example calls:
  GET /courses                                           All courses, page 1
  GET /courses?page=2&limit=6                            Paginate
  GET /courses?q=git                                     Search
  GET /courses?categoryId=1&status=active                Filter
  GET /courses?q=git&categoryId=1&status=active&page=1   Full combo

Response shape:
{
  "data": [
    {
      "id": 1,
      "name": "Git & GitHub Basics",
      "courseId": "CRS-0001",
      "enrolled": 2,
      "status": "active",
      "category": { "id": 1, "name": "Development" },
      "totalLessons": 4
    }
  ],
  "meta": {
    "totalItems": 1,
    "itemCount": 1,
    "itemsPerPage": 6,
    "totalPages": 1,
    "currentPage": 1
  }
}

NOTE: totalLessons is computed by fetching only lesson IDs, counting them, then discarding the array.
Full lesson data is NOT included on the course list page.

---

## 9. Course Status Update (PATCH /courses/:courseId/status)

- Auth: JWT cookie required. User must be admin or employee.
- Body: { "status": "active" } — valid values: active, inactive, draft
- Returns updated course object.
- 400 Bad Request if status value is invalid.
- 403 Forbidden if user is not admin/employee.
- 404 Not Found if course does not exist.

---

## 10. Lesson List for a Course (GET /courses/:courseId/lessons)

Returns only lessons for a given course — no enrollment data, no course details, no category.
Optimized to fetch exactly the fields needed for the lesson view page.

Response shape:
[
  {
    "id": 1,
    "lessonId": "LES-0001",
    "title": "Introduction to Version Control",
    "description": "Understanding Git principles.",
    "materialType": "Video",
    "materialLink": "https://example.com/intro.mp4",
    "status": "Active"
  }
]

---

## 11. DB Optimizations Applied

11.1 Database Indexes
  - User: name, role
  - Course: name, status
  - Lesson: title
  These speed up WHERE, ORDER BY, and ILike searches.

11.2 Connection Pooling
  - max: 20 concurrent connections
  - idleTimeoutMillis: 30000 (recycles idle connections)
  - connectionTimeoutMillis: 5000 (fails fast on overload)

11.3 Select-Only Required Fields
  TypeORM select option is explicitly set on list/search queries so only needed columns
  are fetched. No unnecessary large text columns or sensitive data are loaded.

11.4 Lesson Count — Never Over-Fetch
  On course list and search, lessons are NOT fetched in full.
  Only lesson id is selected, the array is counted, then discarded.
  Consumer receives totalLessons: number instead of a full array.
    lessons: { id: true }   <- Only this comes from DB
    totalLessons: lessons.length   <- Expose count, discard array

11.5 Password Never Fetched
  password column has select: false in User entity.
  It is NEVER included in any response unless explicitly queried (only during login).

11.6 Parallel Queries with Promise.all
  Paginated endpoints use Promise.all([find, count]) to fetch data rows and total count
  simultaneously instead of sequentially.

11.7 Cascade Deletes
  - Deleting a course cascades to its lessons (CASCADE on ManyToOne in Lesson)
  - Deleting a category sets course category to NULL (SET NULL)

---

## 12. Pagination Design

Courses: 6 per page — GET /courses?page=1&limit=6
Users: 10 per page — GET /auth/users?page=1&limit=10
Supports filter + search + pagination all at once.

Pagination meta response:
{
  "meta": {
    "totalItems": 42,
    "itemCount": 6,
    "itemsPerPage": 6,
    "totalPages": 7,
    "currentPage": 1
  }
}

---

## 13. Search Design

All search uses TypeORM ILike operator (case-insensitive LIKE in PostgreSQL).

Course search (via GET /courses?q=...)
  - Searches on name OR courseId fields
  - Can be combined with categoryId and status filters
  - Returns same paginated response as course list
  - No full lesson data — only totalLessons count

Unified search (GET /courses/search/unified?q=...)
  - Searches both courses AND employees simultaneously
  - Returns { courses: [...], employees: [...] }
  - courses: lightweight objects with totalLessons
  - employees: user objects without password

User search (GET /auth/users/search?q=...)
  - Searches by name, email, or userId
  - Requires JWT auth

---

## 14. ID Generation

Auto-incrementing readable IDs:
  - Users:   TX-0001, TX-0002, ...
  - Courses: CRS-0001, CRS-0002, ...
  - Lessons: LES-0001, LES-0002, ...

Service reads latest existing ID, increments number, zero-pads to 4 digits, prepends prefix.

---

## 15. Project File Structure

src/
+-- main.ts                          Bootstrap, CORS, cookie, validation
+-- app.module.ts                    DB config, module wiring
+-- auth/
|   +-- auth.controller.ts           Auth + user management routes
|   +-- auth.service.ts              Auth business logic
|   +-- auth.module.ts
|   +-- jwt-auth.guard.ts            JWT cookie guard
|   +-- jwt.strategy.ts              Passport JWT strategy
|   +-- entities/
|   |   +-- user.entity.ts
|   +-- dto/
|       +-- register.dto.ts
|       +-- login.dto.ts
|       +-- update-user.dto.ts
+-- courses/
    +-- courses.controller.ts        All course/lesson/search/stats routes
    +-- courses.service.ts           All business logic
    +-- courses.module.ts
    +-- trash-cleanup.service.ts     Scheduled deletion service
    +-- entities/
    |   +-- course.entity.ts
    |   +-- lesson.entity.ts
    |   +-- category.entity.ts
    |   +-- enrollment.entity.ts
    +-- dto/
        +-- create-course.dto.ts
        +-- update-course.dto.ts
        +-- create-lesson.dto.ts
        +-- update-lesson.dto.ts
        +-- create-category.dto.ts

---

## 16. Environment Variables

| Variable      | Description                              |
|---------------|------------------------------------------|
| DATABASE_URL  | Neon PostgreSQL connection string        |
| JWT_SECRET    | Secret for signing JWT tokens            |
| FRONTEND_URL  | Deployed frontend URL (for CORS)         |
| PORT          | Server port (default: 3000)              |

---

## 17. Frontend Integration Notes

Frontend project: c:\XR Interactive\trainxcel-frontend

- All API calls use credentials: include so browser sends cookie automatically
- Base URL: http://localhost:3000 (dev) or FRONTEND_URL (prod)
- Single endpoint rule: GET /courses with query params handles ALL course listing scenarios
  (listing, filtering by category, filtering by status, searching, paginating)
- Separate lesson page: course listing uses GET /courses (totalLessons count only),
  lesson detail page uses GET /courses/:courseId/lessons (full lesson data)

---

## 18. Changelog / Everything Built

| #  | Feature / Fix                                                    |
|----|------------------------------------------------------------------|
| 1  | Initial NestJS backend setup with TypeORM + Neon DB             |
| 2  | User auth with register, login, logout via JWT cookie           |
| 3  | Course CRUD: create, read, update endpoints                     |
| 4  | Lesson CRUD: add and update lessons per course                  |
| 5  | Enrollment system: enroll user, mark lesson complete            |
| 6  | Progress tracking per user per course                           |
| 7  | Dashboard statistics and analytics endpoints                    |
| 8  | Course search and unified search (courses + employees)          |
| 9  | DB optimization: Added @Index() on hot columns                  |
| 10 | DB optimization: Configured connection pool (max 20)            |
| 11 | DB optimization: select: false on password column               |
| 12 | DB optimization: Promise.all for parallel paginated queries     |
| 13 | Pagination implemented — Courses: 6/page, Users: 10/page       |
| 14 | Course list optimized — totalLessons count only, no arrays      |
| 15 | User list optimized — password stripped from all responses      |
| 16 | All search queries made case-insensitive (ILike)                |
| 17 | Search and filters unified into GET /courses (single API)       |
| 18 | GET /courses supports: q, categoryId, status, page, limit       |
| 19 | PATCH /courses/:courseId/status — dedicated status update       |
| 20 | GET /courses/:courseId/lessons — optimized lesson list          |
| 21 | User role update endpoint PATCH /auth/users/:userId/role        |
| 22 | Unified search optimized — no over-fetching, totalLessons count |
| 23 | Security: PATCH /auth/users/:userId checks requester ID matches URL userId (admin bypass) |
| 24 | Security: Removed userId from all DTOs. Role re-verified from DB via requesterId param in all privileged service methods |
| 25 | Feature: Added DELETE course endpoint (admin/employee only)      |
| 26 | Feature: Added DELETE lesson endpoint with automatic progress recalculation (admin/employee only) |
| 27 | Security: Public register defaults to 'user' role; added admin-only POST /auth/users/employee |
| 28 | Feature: Sorted all course list/search endpoints by recent first (createdAt DESC) |
| 29 | Feature: Soft-delete Recycle Bin with search/filtering, manual restore, direct hard-delete, empty-bin option, and daily background purge scheduled task (tested with 1-min expiration) |
