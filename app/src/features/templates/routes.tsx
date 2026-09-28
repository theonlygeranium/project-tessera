// Programs, templates, brand, and applying a template (lane A, #24, D-024).
import type { RouteObject } from 'react-router';
import { ProgramsPage, ProgramPage } from './Programs';
import { TemplatesPage, TemplatePage } from './TemplateEditor';
import { CourseTemplatePage } from './CourseTemplatePage';

export const adminTemplateRoutes: RouteObject[] = [
  { path: 'admin/programs', element: <ProgramsPage /> },
  { path: 'admin/programs/:programId', element: <ProgramPage /> },
  { path: 'admin/templates', element: <TemplatesPage /> },
  { path: 'admin/templates/:templateId', element: <TemplatePage /> },
];
export const instructorTemplateRoutes: RouteObject[] = [
  { path: 'teach/courses/:courseId/template', element: <CourseTemplatePage /> },
];
