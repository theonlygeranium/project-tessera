const MEMBERSHIP = 'http://purl.imsglobal.org/vocab/lis/v2/membership';
const INSTRUCTOR = new Set(['Instructor', 'ContentDeveloper', 'TeachingAssistant', `${MEMBERSHIP}#Instructor`, `${MEMBERSHIP}#ContentDeveloper`]);
const STUDENT = new Set(['Learner', `${MEMBERSHIP}#Learner`]);

/** Map only context membership roles; institution and system roles grant nothing. */
export function mapLisRoles(roles: unknown): 'instructor' | 'student' | null {
  if (!Array.isArray(roles)) return null;
  let learner = false;
  for (const role of roles) {
    if (typeof role !== 'string') continue;
    if (INSTRUCTOR.has(role) || role.startsWith(`${MEMBERSHIP}/Instructor#`) && role.length > `${MEMBERSHIP}/Instructor#`.length) return 'instructor';
    if (STUDENT.has(role) || role.startsWith(`${MEMBERSHIP}/Learner#`) && role.length > `${MEMBERSHIP}/Learner#`.length) learner = true;
  }
  return learner ? 'student' : null;
}
