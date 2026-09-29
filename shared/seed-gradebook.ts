import type { Assignment, Course, Module, Submission, StudentItemState, User } from './domain';
import { goldenInput, goldenNames, goldenSetup } from './grading/golden.fixture';
import type { SeedData } from './seed';

/** Build the mock gradebook from the same fixture the M1 engine tests use. */
export function seedGradebook(baseCourse: Course): Pick<SeedData,
  'users' | 'courses' | 'enrollments' | 'modules' | 'assignments'
  | 'submissions' | 'gradebookSetups' | 'studentItemStates'
> {
  const courseId = goldenSetup.courseId;
  const course: Course = {
    ...baseCourse,
    id: courseId,
    code: 'STAT 110-04',
    title: 'Statistics · Section 04',
    description: 'Fictional gradebook course for instructor testing.',
    welcome: 'Welcome to Statistics Section 04.',
    instructorIds: ['u-okafor']
  };
  const module: Module = {
    id: 'm-stat110-04',
    courseId,
    title: 'Course work',
    position: 0
  };
  const ids = [...goldenNames.keys()];
  const users: User[] = ids.filter(id => id !== 'u-priya').map(id => {
    const display = goldenNames.get(id)!;
    const [surname, ...given] = display.split(' ');
    const name = `${given.join(' ')} ${surname}`;
    return {
      id,
      name,
      email: `${id.slice(2)}@meridian.example.edu`,
      role: 'student',
      initials: name.split(' ').map(x => x[0]).join(''),
      profile: null
    };
  });
  const priya = goldenInput('u-priya');
  const assignments: Assignment[] = priya.items.map(item => ({
    id: item.assignmentId,
    moduleId: module.id,
    courseId,
    title: item.title,
    position: item.position,
    status: 'published',
    publishedAt: '2025-12-01T00:00:00.000Z',
    dueAt: item.dueAt,
    points: item.points,
    submissionType: 'text',
    rubric: [],
    instructions: [],
    categoryId: item.categoryId,
    extraCredit: item.extraCredit,
    countsTowardGrade: item.countsTowardGrade
  }));
  const submissions: Submission[] = [];
  const studentItemStates: StudentItemState[] = [];
  for (const id of ids) {
    const fixture = goldenInput(id);
    for (const item of fixture.items) {
      if (item.submission) {
        const released = item.submission.released && item.submission.score !== null;
        submissions.push({
          id: `sub-${courseId}-${id}-${item.assignmentId}`,
          assignmentId: item.assignmentId,
          studentId: id,
          attempt: 1,
          state: released ? 'returned' : item.submission.state,
          text: '',
          fileId: null,
          link: '',
          submittedAt: item.submission.submittedAt,
          grade: item.submission.score === null ? null : {
            score: item.submission.score,
            criteria: [],
            feedback: '',
            feedbackOrigin: 'human',
            feedbackProvenance: null,
            gradedBy: 'u-okafor',
            gradedAt: item.submission.submittedAt,
            releasedAt: released ? '2026-01-31T00:00:00.000Z' : null
          },
          version: 0,
          source: 'student',
          feedbackDraft: null
        });
      }
      if (item.itemState) {
        studentItemStates.push({
          courseId,
          assignmentId: item.assignmentId,
          studentId: id,
          excused: item.itemState.excused,
          missing: item.itemState.missing,
          lateWaived: item.itemState.lateWaived,
          override: item.itemState.override,
          dueAt: null,
          version: 1
        });
      }
    }
  }
  return {
    users,
    courses: [course],
    enrollments: ids.map(userId => ({
      courseId,
      userId
    })),
    modules: [module],
    assignments,
    submissions,
    gradebookSetups: [{
      ...goldenSetup,
      version: 1,
      rulesVersion: 1,
      updatedBy: 'u-okafor',
      updatedAt: '2026-02-01T00:00:00.000Z'
    }],
    studentItemStates
  };
}
