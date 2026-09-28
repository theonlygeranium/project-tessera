// The readiness engine (D-029, #25): built-in rubrics, automatic checks, and scoring.
export { BUILT_IN_RUBRICS, DEFAULT_READINESS_POLICY, OSCQR_ATTRIBUTION, OSCQR_RUBRIC, OSCQR_RUBRIC_ID, TESSERA_RUBRIC, TESSERA_RUBRIC_ID, builtInRubric } from './rubrics';
export { AUTOMATIC_CHECKS, type CheckOutcome } from './checks';
export { canAttest, evaluateReadiness, itemStatus, itemsForLesson } from './evaluate';
export { READING_GRADE_LIMIT, READING_MIN_WORDS, readingLevel } from './reading';
export { allBlocks, blockText, proseText, type CourseSnapshot } from './snapshot';
