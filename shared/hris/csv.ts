import { ApiError } from '../api';
import type { WorkerColumnMap, WorkerField } from '../domain';

export interface CsvRow { line: number; cells: string[] }
const invalid = (message: string): never => { throw new ApiError('invalid', message); };

/** RFC 4180 cells with physical start lines; quoted newlines stay in a cell. */
export function parseCsv(source: string): CsvRow[] {
  if (source.length > 2_000_000) invalid('The CSV exceeds 2,000,000 characters.');
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const rows: CsvRow[] = []; let cells: string[] = []; let cell = ''; let quoted = false; let closed = false;
  let line = 1, rowLine = 1;
  const pushCell = () => { cells.push(cell); cell = ''; closed = false; if (cells.length > 60) invalid('The CSV has more than 60 columns.'); };
  const pushRow = () => { pushCell(); rows.push({line:rowLine,cells}); cells=[]; rowLine=line; };
  for(let i=0;i<text.length;i++) {
    const ch=text[i];
    if(quoted) {
      if(ch==='"' && text[i+1]==='"') { cell+='"'; i++; }
      else if(ch==='"') { quoted=false; closed=true; }
      else if(ch==='\r') { cell+='\r'; if(text[i+1]==='\n') { cell+='\n'; i++; } line++; }
      else { cell+=ch; if(ch==='\n') line++; }
      continue;
    }
    if(ch==='"') { if(cell!=='' || closed) invalid(`Invalid quote on line ${line}.`); quoted=true; continue; }
    if(ch===',') { pushCell(); continue; }
    if(ch==='\r' || ch==='\n') { if(ch==='\r' && text[i+1]==='\n') i++; line++; pushRow(); continue; }
    if(closed) invalid(`Invalid character after a quoted cell on line ${line}.`);
    cell+=ch;
  }
  if(quoted) invalid('The CSV has an unterminated quoted cell.');
  if(cell!=='' || cells.length || closed) pushRow();
  while(rows.length>1 && rows.at(-1)!.cells.every(x=>x.trim()==='')) rows.pop();
  if(!rows.length || rows[0].cells.every(x=>x.trim()==='')) invalid('The CSV needs a header row.');
  if(rows.length-1>5_000) invalid('The CSV has more than 5,000 data rows.');
  return rows;
}

const synonyms: Record<WorkerField,string[]> = {
  employeeId:['employee_id','employee id'], email:['email'], name:['name','full name'],
  jobCode:['job_code','job code'], jobTitle:['job_title','job title'], department:['department','org unit'],
  location:['location'], employmentType:['employment_type','employment type'],
  managerEmployeeId:['manager_employee_id','manager id'], hireDate:['hire_date','hire date'],
  status:['status'], effectiveAt:['effective_date','effective_at','effective date'],
};
export const workerFields = Object.keys(synonyms) as WorkerField[];
export function csvObjects(source: string, map?: Pick<WorkerColumnMap,'columns'|'dateFormat'>): { rows: {line:number;value:Record<string,unknown>;tooLong?:boolean}[]; dateFormat: WorkerColumnMap['dateFormat'] } {
  const parsed = parseCsv(source);
  const headers = parsed[0].cells.map(x=>x.trim().toLowerCase());
  const indices = new Map<WorkerField,number>();
  for(const field of workerFields) {
    const names = map?.columns[field] ? [map.columns[field]!] : [field,...synonyms[field]];
    const index = headers.findIndex(h=>names.some(n=>h===n.trim().toLowerCase()));
    if(index>=0) indices.set(field,index);
  }
  return {dateFormat:map?.dateFormat??'iso',rows:parsed.slice(1).map(row=>{
    const value:Record<string,unknown>=Object.create(null);
    for(const [field,index] of indices) value[field]=row.cells[index]??'';
    return {line:row.line,value,tooLong:row.cells.some(cell=>cell.length>500)};
  })};
}
