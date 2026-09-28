import type { RouteObject } from 'react-router';
import { AdminTrainingPage, CertificatePage, CompliancePage, InstructorTestOutPage, MyTrainingPage, StudentTestOutPage } from './TrainingPages';
export const adminTrainingRoutes:RouteObject[]=[{path:'admin/training',element:<AdminTrainingPage/>},{path:'admin/compliance',element:<CompliancePage/>}];
export const instructorTrainingRoutes:RouteObject[]=[{path:'teach/courses/:courseId/test-out',element:<InstructorTestOutPage/>}];
export const studentTrainingRoutes:RouteObject[]=[{path:'courses/:courseId/test-out',element:<StudentTestOutPage/>}];
export const anyTrainingRoutes:RouteObject[]=[{path:'training',element:<MyTrainingPage/>},{path:'certificates/:certificateId',element:<CertificatePage/>}];
