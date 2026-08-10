/**
 * One-off backfill script.
 *
 * Rewrites stale notification actionLinks so clicking a notification lands on
 * the specific course/lesson event instead of a generic page.
 *
 * Targets:
 *   - `/dashboard/learn/{courseId}`            (old "new lesson"/"new test" links -> add ?lesson=)
 *   - `/dashboard?tab=my-learning`             (eval-result links -> resolve course/lesson from test title)
 *
 * The event is resolved from the stored message text + the course code already
 * present in the actionLink (or, for eval links, by matching the test title).
 * Rows that cannot be resolved safely are left untouched.
 *
 * Usage: node scripts/backfill-notification-links.js [--dry-run]
 */
require('dotenv').config();
const { Client } = require('pg');

const DRY_RUN = process.argv.includes('--dry-run');

function quoteAfter(msg, marker) {
  const start = msg.indexOf(marker);
  if (start < 0) return null;
  const rest = msg.slice(start + marker.length);
  const quote = rest.trimStart().startsWith('"') ? '"' : "'";
  const from = rest.indexOf(quote);
  if (from < 0) return null;
  const to = rest.indexOf(quote, from + 1);
  if (to < 0) return null;
  return rest.slice(from + 1, to);
}

function buildLink(courseCode, lessonId) {
  if (!courseCode) return null;
  return lessonId
    ? `/dashboard/learn/${courseCode}?lesson=${lessonId}`
    : `/dashboard/learn/${courseCode}`;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 30000,
  });
  await client.connect();

  const [coursesRes, testsRes, lessonsRes, notifRes] = await Promise.all([
    client.query('SELECT id, "courseId", name FROM courses'),
    client.query('SELECT id, title, "courseId", "lessonId" FROM tests'),
    client.query('SELECT id, title, "courseId" FROM lessons'),
    client.query(
      'SELECT id, message, "actionLink" FROM notifications WHERE "actionLink" IS NOT NULL AND "actionLink" <> \'\'',
    ),
  ]);

  const coursesByCode = new Map(coursesRes.rows.map((c) => [c.courseId, c]));
  const testsByTitle = new Map();
  for (const t of testsRes.rows) {
    if (!testsByTitle.has(t.title)) testsByTitle.set(t.title, []);
    testsByTitle.get(t.title).push(t);
  }
  const lessonsByTitleAndCourse = new Map();
  for (const l of lessonsRes.rows) {
    const key = `${l.title}\u0000${l.courseId}`;
    if (!lessonsByTitleAndCourse.has(key)) lessonsByTitleAndCourse.set(key, []);
    lessonsByTitleAndCourse.get(key).push(l);
  }

  const NEW_LESSON_RE = /^A new lesson "(.+)" has been published in/;
  const NEW_TEST_RE = /^A new test "(.+)" is available in course/;
  const EVAL_RE = /^(Your submission for test|Your marks for test|Your test|Your CQ answer for) "(.+?)"/;

  let updated = 0;
  let skippedUnresolved = 0;
  let updatedLinks = [];

  for (const n of notifRes.rows) {
    let newLink = null;
    const msg = n.message || '';

    // Course code already present in the link
    const codeMatch = n.actionLink.match(/\/dashboard\/(learn|courses)\/([^/?#]+)/);
    const courseCode = codeMatch ? codeMatch[2] : null;

    if (n.actionLink.startsWith('/dashboard/learn/') && !n.actionLink.includes('?')) {
      // Old new-lesson / new-test link (bare course page)
      if (NEW_LESSON_RE.test(msg)) {
        const title = NEW_LESSON_RE.exec(msg)[1];
        const course = courseCode ? coursesByCode.get(courseCode) : null;
        if (course) {
          const lessons = lessonsByTitleAndCourse.get(`${title}\u0000${course.id}`);
          if (lessons && lessons.length > 0) {
            newLink = buildLink(course.courseId, lessons[0].id);
          } else {
            skippedUnresolved += 1;
          }
        } else {
          skippedUnresolved += 1;
        }
      } else if (NEW_TEST_RE.test(msg)) {
        const title = NEW_TEST_RE.exec(msg)[1];
        const course = courseCode ? coursesByCode.get(courseCode) : null;
        if (course) {
          const tests = (testsByTitle.get(title) || []).filter(
            (t) => t.courseId === course.id,
          );
          if (tests.length > 0) {
            newLink = buildLink(course.courseId, tests[0].lessonId || null);
          } else {
            skippedUnresolved += 1;
          }
        } else {
          skippedUnresolved += 1;
        }
      } else {
        skippedUnresolved += 1;
      }
    } else if (n.actionLink === '/dashboard?tab=my-learning') {
      // Eval-result link: resolve course + lesson from the test title
      const m = EVAL_RE.exec(msg);
      const title = m ? m[2] : null;
      if (title) {
        const tests = testsByTitle.get(title) || [];
        if (tests.length === 1) {
          const test = tests[0];
          const course = coursesByCode.get(test.courseId);
          if (course) {
            newLink = buildLink(course.courseId, test.lessonId || null);
          } else {
            skippedUnresolved += 1;
          }
        } else if (tests.length === 0) {
          skippedUnresolved += 1;
        } else {
          skippedUnresolved += 1; // ambiguous title -> leave generic link
        }
      }
    }

    if (!newLink || newLink === n.actionLink) continue;

    if (DRY_RUN) {
      updated += 1;
      updatedLinks.push({ id: n.id, from: n.actionLink, to: newLink, message: msg.slice(0, 70) });
    } else {
      const res = await client.query(
        'UPDATE notifications SET "actionLink" = $1 WHERE id = $2',
        [newLink, n.id],
      );
      if (res.rowCount === 1) {
        updated += 1;
        updatedLinks.push({ id: n.id, from: n.actionLink, to: newLink });
      }
    }
  }

  if (DRY_RUN) {
    console.log(`DRY RUN — would update ${updated} rows, skip ${skippedUnresolved} unresolved`);
  } else {
    console.log(`Updated ${updated} rows, skipped ${skippedUnresolved} unresolved`);
  }
  console.table(updatedLinks.slice(0, 40));

  await client.end();
}

main().catch((e) => {
  console.error('ERR:', e.message);
  process.exit(1);
});
