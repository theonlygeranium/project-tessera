import type { WorkerRecordInput } from '../domain';

/** Fictional Meridian State Facilities and Operations staff. */
const people: [string,string,string,string,string,string,string|null][] = [
  ['MS-001','Avery Chen','FL-1','North Campus Facilities','active','full-time',null],
  ['MS-002','Blair Ellis','FL-2','North Campus Facilities','active','full-time','MS-001'],
  ['MS-003','Casey Flores','CUST-1','South Campus Grounds','active','part-time','MS-001'],
  ['MS-004','Devon Hart','ELEC-2','Downtown Center','active','full-time','MS-001'],
  ['MS-005','Emery James','OFF-1','North Campus Facilities','active','temporary','MS-001'],
  ['MS-006','Finley King','FL-1','South Campus Grounds','leave','full-time','MS-001'],
  ['MS-007','Gray Lane','CUST-1','North Campus Facilities','active','contractor','MS-002'],
  ['MS-008','Harper Moss','ELEC-2','Downtown Center','active','full-time','MS-004'],
  ['MS-009','Indigo North','OFF-1','South Campus Grounds','active','part-time','MS-003'],
  ['MS-010','Jules Ortiz','FL-2','North Campus Facilities','active','full-time','MS-002'],
  ['MS-011','Kai Park','CUST-1','Downtown Center','active','temporary','MS-004'],
  ['MS-012','Logan Reed','OFF-1','North Campus Facilities','terminated','other','MS-001'],
];
export const workerFixtures:WorkerRecordInput[]=people.map(([employeeId,name,jobCode,location,status,employmentType,managerEmployeeId])=>({
  employeeId,name,email:`${name.toLowerCase().replace(' ','.')}@meridianstate.example.edu`,jobCode,jobTitle:'Facilities staff',department:'Facilities and Operations',location,
  status:status as WorkerRecordInput['status'],employmentType:employmentType as WorkerRecordInput['employmentType'],managerEmployeeId,hireDate:'2026-08-15',
}));
