# MrQuest Backend — Full Project Context

> **Last Updated:** 2026-08-10
> **Stack:** NestJS · TypeORM · PostgreSQL (Neon DB) · JWT via HTTP-only cookies · Google Vertex AI (Gemini) for AI question generation & evaluation

---

## 1. Project Overview

MrQuest is an **exam-only** enterprise platform. There is **NO course, lesson, or learning-path system** — all course-related code was removed. The backend is a NestJS REST API connected to PostgreSQL (Neon DB). It handles:

- User registration, login, and role management (user / employee / admin)
- Exam creation and management (admin/employee only)
- Question banks for exams — 3 question types: **MCQ**, **CQ** (creative/written), **Video** test
- AI question generation from uploaded documents (PDF/DOCX)
- Student enrollment, participation, and submission
- **AI evaluation** for Video and CQ questions — admin can pick **AI or Manual** review per question
- Real-time notifications (Socket.IO), activity logs

---

## 2. Tech Stack

| Layer        | Technology                                  |
|--------------|----------------------------------------------|
| Framework    | NestJS (Node.js)                            |
| Language     | TypeScript                                  |
| ORM          | TypeORM                                     |
| Database     | PostgreSQL via Neon DB                      |
| Auth         | JWT (stored in HTTP-only cookie `jwt`)      |
| AI           | Google Vertex AI (Gemini 3.5 Flash)         |
| Storage      | Google Cloud Storage (video eval assets)    |
| Media        | ffmpeg (extract audio/snapshots from video) |
| Realtime     | Socket.IO (notifications)                   |
| Validation   | class-validator + class-transformer         |

---

## 3. Entry Point (main.ts)

- Runs on PORT from env (default: 3000), listens on `0.0.0.0`
- Sets `process.env.TZ = 'UTC'` to keep DB timestamps timezone-safe
- Sets `GOOGLE_APPLICATION_CREDENTIALS` to `./google-credentials.json`
- Ensures upload dirs exist: `uploads/{users_dp, exam_thumbnail, ai-documents, test-videos}`
- Cookie parser enabled globally
- CORS enabled for `FRONTEND_URL`, localhost:3000/3001/3002 (credentials: true)
- Global ValidationPipe with `whitelist: true`, `transform: true`
- keepAliveTimeout 61000 / headersTimeout 65000

---

## 4. Database Configuration (app.module.ts)

- Postgres, URL from `process.env.DATABASE_URL`
- `autoLoadEntities: true`, `synchronize: true` (dev only)
- SSL `rejectUnauthorized: false` (Neon)
- Pool: max 20, idleTimeoutMillis 30000, connectionTimeoutMillis 5000
- Modules: AuthModule, ExamGroupsModule, AiTestingModule, AiEvaluationModule, ActivityLogsModule, NotificationsModule

---

## 5. Roles

| Role     | Capabilities                                                                 |
|----------|------------------------------------------------------------------------------|
| user     | Default role. Can browse active exams, join, participate, view own results   |
| employee | Can create/manage exams and questions, evaluate submissions, AI-generation   |
| admin    | Full access: everything employee can do + role management                    |

---

## 6. Database Entities

### 6.1 User (`users`)

| Column             | Type   | Notes                                 |
|--------------------|--------|---------------------------------------|
| id                 | int PK | Auto-incremented                      |
| email              | string | Unique                                |
| name               | string | Indexed                               |
| password           | string | select: false — never fetched by default |
| userId             | string | Unique, e.g. TX-0001                  |
| profilePictureUrl  | string | Nullable                              |
| role               | string | user / employee / admin — Indexed     |
| phoneNumber        | string | Nullable                              |
| address            | string | Nullable                              |
| createdAt/updatedAt| Date   | Auto                                  |

OneToMany to Notification.

### 6.2 ExamGroup (`exam_groups`)

| Column        | Type    | Notes                                  |
|---------------|---------|----------------------------------------|
| id            | int PK  |                                        |
| examGroupId   | string  | Unique, e.g. EXG-0001                  |
| title         | string  | Indexed                                |
| description   | text    | Nullable                               |
| thumbnailUrl  | text    | Nullable                               |
| status        | string  | draft / active / completed / cancelled — Indexed |
| startTime     | timestamp | Nullable                              |
| endTime       | timestamp | Nullable                              |
| timePerQuestion | int    | Nullable                               |
| totalStudents | int     | Default 0                              |

OneToMany: questions, enrollments, submissions.

### 6.3 ExamGroupQuestion (`exam_group_questions`)

| Column        | Type   | Notes                                         |
|---------------|--------|-----------------------------------------------|
| id            | int PK |                                               |
| questionText  | text   |                                               |
| type          | string | **MCQ / CQ / Video**                          |
| options       | jsonb  | MCQ options                                   |
| correctAnswers| jsonb  | MCQ correct options (or CQ model answer)      |
| marks         | float  | Default 1                                     |
| postureMarks  | float  | Video only — posture component                |
| voiceMarks    | float  | Video only — voice component                  |
| accuracyMarks | float  | Video only — content accuracy component       |
| evaluationType| string | **AI / Manual** — how this question is graded |
| referenceScript | text | Reference script used for AI grading (CQ/Video) |
| examGroup     | FK     | CASCADE delete                                |

### 6.4 ExamGroupEnrollment (`exam_group_enrollments`)

User ↔ ExamGroup join. ManyToOne User (CASCADE), ManyToOne ExamGroup (CASCADE).

### 6.5 ExamGroupSubmission (`exam_group_submissions`)

| Column        | Type     | Notes                                        |
|---------------|----------|----------------------------------------------|
| id            | int PK   |                                              |
| marksObtained | float    | Default 0                                    |
| status        | string   | Pending Evaluation / Evaluated               |
| user          | FK       | CASCADE                                      |
| examGroup     | FK       | CASCADE                                      |
| submittedAt   | timestamp| Nullable                                     |

OneToMany answers (cascade).

### 6.6 ExamGroupAnswer (`exam_group_answers`)

| Column           | Type   | Notes                                      |
|------------------|--------|--------------------------------------------|
| id               | int PK |                                            |
| providedAnswer   | jsonb  | For MCQ: selected options; CQ: text; Video: video URL |
| marksAwarded     | float  | Default 0                                  |
| evaluatorComment | text   | AI feedback JSON (video) or text (CQ)      |
| evaluatedBy      | string | AI / Human                                 |
| submission       | FK     | CASCADE                                    |
| question         | FK     | CASCADE                                    |

### 6.7 AI Test Generation (`ai_test_generation_requests`, `ai_generated_questions`)

- `ai_test_generation_requests`: tracks async AI question-generation jobs (pending → processing → completed/failed). Holds examGroupId, sourceDocumentUrl, mcqCount, cqCount, includeVideoTest, status, errorMessage, createdByUserId.
- `ai_generated_questions`: maps generated ExamGroupQuestion IDs to generation request IDs + modelUsed.

---

## 7. Authentication (/auth)

JWT stored in HTTP-only cookie named `jwt`. Config: httpOnly, secure: true, sameSite: 'none', maxAge 1 hour. JwtAuthGuard reads the cookie automatically.

| Method | Endpoint                   | Auth | Description                              |
|--------|----------------------------|------|------------------------------------------|
| POST   | /auth/login                | No   | Login, returns JWT cookie                |
| POST   | /auth/logout               | No   | Clears JWT cookie                        |
| GET    | /auth/profile              | Yes  | Get own profile                          |
| GET    | /auth/token                | Yes  | Return raw JWT (for Socket.IO handshake) |
| GET    | /auth/users                | Yes  | List users — paginated (10/page)         |
| GET    | /auth/users/search         | Yes  | Search users by name/email/userId        |
| POST   | /auth/users/employee       | Yes  | Create employee user (admin only)        |
| GET    | /auth/profile/:userId      | Yes  | Get any user profile                     |
| PATCH  | /auth/users/:userId        | Yes  | Update profile (self or admin)           |
| PATCH  | /auth/users/:userId/role   | Yes  | Update user role (admin only)            |
| PATCH  | /auth/reset-password       | Yes  | Reset own password                       |
| POST   | /auth/upload-dp            | Yes  | Upload profile picture                   |

### Security Model

Privileged services re-verify the role from a fresh DB lookup using the requester's `userId` from the JWT (never trusts `req.user.role` or any body field). `userId` is not accepted in DTOs.

---

## 8. Exam Groups Module (/exam-groups)

### Exam CRUD

| Method | Endpoint              | Auth | Description                            |
|--------|-----------------------|------|----------------------------------------|
| POST   | /exam-groups          | Yes  | Create exam (admin/employee)           |
| GET    | /exam-groups          | Yes  | List exams — paginated + search/filter |
| GET    | /exam-groups/:id      | Yes  | Get exam details (students see limited view unless active + enrolled) |
| PATCH  | /exam-groups/:id      | Yes  | Update exam (admin/employee)           |
| DELETE | /exam-groups/:id      | Yes  | Delete exam (admin/employee)           |

List query params: `page`, `limit` (default 10), `q` (title ILike), `status`.
Students (`role === 'user'`) only see `status === 'active'` exams.

### Questions

| Method | Endpoint                             | Auth | Description                       |
|--------|--------------------------------------|------|-----------------------------------|
| POST   | /exam-groups/:id/questions           | Yes  | Add questions (admin/employee)    |
| PATCH  | /exam-groups/:id/questions/:qid      | Yes  | Update question (admin/employee)  |
| DELETE | /exam-groups/:id/questions/:qid      | Yes  | Remove question (admin/employee)  |

Each question supports: type (MCQ/CQ/Video), marks, options/correctAnswers, posture/voice/accuracy marks (video), **evaluationType (AI/Manual)**, referenceScript.

### Enrollment / Participation

| Method | Endpoint                 | Auth | Description                              |
|--------|--------------------------|------|------------------------------------------|
| POST   | /exam-groups/:id/enroll  | Yes  | Admin adds a user to the exam            |
| DELETE | /exam-groups/:id/enroll/:userId | Yes | Admin removes a user                |
| POST   | /exam-groups/:id/join    | Yes  | Student self-joins (must be active, within time window) |
| POST   | /exam-groups/:id/submit  | Yes  | Student submits answers (one attempt)    |
| GET    | /exam-groups/:id/my-submissions | Yes | Student's own submissions          |
| GET    | /exam-groups/:id/submissions | Yes | All submissions (admin/employee)    |
| GET    | /exam-groups/:id/remaining | Yes | Enrolled/submitted/remaining counts (admin/employee) |
| PUT    | /exam-groups/:id/evaluations | Yes | Manual evaluation of a submission (admin/employee) |

### Uploads

| Method | Endpoint                         | Auth | Description                        |
|--------|----------------------------------|------|------------------------------------|
| POST   | /exam-groups/upload-test-video   | Yes  | Upload video answer file           |
| POST   | /exam-groups/upload-thumbnail    | Yes  | Upload exam thumbnail (admin/employee) |

---

## 9. Exam Flow & Evaluation Logic (exam-groups.service.ts)

### Submission (`submitExam`)
1. One attempt only — duplicate submission is rejected (ConflictException).
2. Submission rejected if past `endTime`.
3. Must be enrolled.
4. Per answer:
   - **MCQ** → auto-graded against `correctAnswers`, marks added immediately.
   - **CQ** with `evaluationType === 'AI'` → queued for **AI evaluation** (Gemini text evaluation via `GeminiAiService.evaluateCqAnswer`, using `referenceScript`/`correctAnswers` as reference).
   - **Video** with `evaluationType === 'AI'` → queued for **AI evaluation** (ffmpeg extracts audio + 20s snapshots, uploads to GCS, `GeminiAnalysisService.evaluateCandidate` scores posture/voice/accuracy).
   - CQ/Video with `evaluationType !== 'AI'` → left pending for **manual review**.
5. Submission status starts as `Pending Evaluation` if any answer is non-MCQ, else `Evaluated`.
6. Asynchronously, each AI evaluation updates the answer's `marksAwarded`, `evaluatorComment`, `evaluatedBy='AI'`, adjusts the submission total, sends a notification, and calls `finalizeSubmissionIfComplete` to flip status to `Evaluated` once no non-MCQ answer remains unevaluated.

### Manual Evaluation (`evaluateSubmission`)
- Admin/employee sends a list of `{ answerId, marksAwarded, evaluatorComment? }`.
- Marks diff is applied to the submission total, `evaluatedBy='Human'`, status set to `Evaluated`, student notified.

---

## 10. AI Question Generation (/tests/ai)

Admin/employee upload a PDF/DOCX and Gemini generates MCQ/CQ/Video questions directly into an exam group.

| Method | Endpoint                  | Auth | Description                              |
|--------|---------------------------|------|------------------------------------------|
| POST   | /tests/ai/generate        | Yes  | Start generation (admin/employee)        |
| GET    | /tests/ai/requests/:id    | Yes  | Get generation request status            |
| GET    | /tests/ai/requests        | Yes  | List requests (by examGroupId)           |
| POST   | /tests/ai/upload-document | Yes  | Upload PDF/DOCX source (admin/employee)  |

- `createAiTest` saves a request, then processes asynchronously (`setImmediate`).
- `processGenerationJob` reads the uploaded file, calls Gemini to generate MCQs, CQs (with referenceScript), and/or a video script, then inserts `ExamGroupQuestion`s.
- Uses `GeminiAiService`: `generateMcqs`, `generateCqWithScript`, `generateVideoScript`.
- On completion, the requesting admin/employee gets a notification.

---

## 11. Notifications (/notifications)

- Socket.IO gateway on `/` with JWT handshake (query token or jwt cookie).
- `sendNotificationToUser(userId, payload)` emits a `notification` event.
- Endpoints: GET `/notifications`, PUT `/notifications/read-all`, PUT `/notifications/:id/read`.

---

## 12. Activity Logs (/activity-logs)

Audit trail (admin only). `ActivityLogsService.log()` is fire-and-forget (never throws).
- GET `/activity-logs` — paginated/filterable log list (admin only)
- GET `/activity-logs/actions` — distinct action list (admin only)

---

## 13. Uploads (/uploads)

Serves files from the `uploads/` dir: `/uploads/:folder/:filename` and `/uploads/:filename`.
Folders: `users_dp`, `exam_thumbnail`, `ai-documents`, `test-videos`.

---

## 14. Environment Variables

| Variable     | Description                              |
|--------------|------------------------------------------|
| DATABASE_URL | Neon PostgreSQL connection string        |
| JWT_SECRET   | Secret for signing JWT tokens            |
| FRONTEND_URL | Frontend URL (for CORS)                  |
| PORT         | Server port (default: 3000)              |

---

## 15. Project File Structure

src/
+-- main.ts                            Bootstrap, CORS, cookie, validation
+-- app.module.ts                      DB config, module wiring
+-- app.controller.ts / app.service.ts Health check
+-- uploads.controller.ts              Static upload serving
+-- auth/
|   +-- auth.controller.ts             Auth + user management routes
|   +-- auth.service.ts                Auth business logic
|   +-- auth.module.ts
|   +-- jwt-auth.guard.ts              JWT cookie guard
|   +-- entities/user.entity.ts
|   +-- dto/                           register, login, update-user, create-employee, reset-password
+-- exam-groups/
|   +-- exam-groups.controller.ts      All exam/participation/evaluation routes
|   +-- exam-groups.service.ts         Exam business logic (incl. AI eval triggers)
|   +-- exam-groups.module.ts
|   +-- entities/                      exam-group, question, enrollment, submission, answer
|   +-- dto/                           create/update exam-group, add/update question, enroll, submit, evaluate
+-- ai-testing/
|   +-- ai-tests.controller.ts         AI generation routes
|   +-- ai-testing.service.ts          Async generation jobs
|   +-- ai-testing.module.ts
|   +-- gemini-ai.service.ts           Gemini: generate MCQ/CQ/Video + evaluateCqAnswer
|   +-- document-parser.service.ts
|   +-- entities/                      ai-test-generation-request, ai-generated-question
|   +-- dto/create-ai-test.dto.ts
+-- ai-evaluation/
|   +-- ai-evaluation.module.ts
|   +-- gemini-analysis.service.ts     Gemini: multimodal video evaluation (posture/voice/accuracy)
|   +-- cloud-storage.service.ts       GCS uploads
|   +-- media-processor.service.ts     ffmpeg audio/snapshot extraction
+-- notifications/
|   +-- notifications.controller.ts
|   +-- notifications.gateway.ts       Socket.IO realtime push
|   +-- notifications.module.ts
|   +-- notification.entity.ts
+-- activity-logs/
|   +-- activity-logs.controller.ts
|   +-- activity-logs.service.ts
|   +-- activity-logs.module.ts
|   +-- entities/activity-log.entity.ts

---

## 16. ID Generation

- Users: TX-0001, TX-0002, ...
- Exam groups: EXG-0001, EXG-0002, ...
- AI generation requests: AIR-<base36 timestamp>

---

## 17. Removed Features (do NOT resurrect)

The following were **completely removed** from the backend:
- Courses, lessons, categories, enrollments-to-courses
- Certificates
- Practice tests, test scheduling, trash/recycle bin, unified search, dashboard stats
- The old `courses` module and everything under `src/courses/` (moved to `ai-evaluation/` etc.)

**This is now an exam-only platform.**
