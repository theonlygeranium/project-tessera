import { z } from 'zod';
import type { Input, Operation, Output } from '../api';
import * as S from './domain';
const {id,required,string,email,integer,nonnegative,minutes}=S;
const ok=z.object({ok:z.literal(true)});
const pageInput=z.object({limit:integer.min(1).max(200).optional().default(50),cursor:required.optional()});
export const page = <T extends z.ZodType>(schema:T) => z.object({items:z.array(schema),nextCursor:string.nullable()});
const by=<K extends string>(key:K)=>z.object({[key]:id} as Record<K,typeof id>);
const gradeCriteria=S.GradeSchema.shape.criteria;
const userShort=S.UserSchema.pick({id:true,name:true,email:true});
const courseInput=z.object({code:required,title:required,term:required,description:string.optional()});
const assignmentInput=z.object({moduleId:id,title:required,submissionType:z.enum(['text','file','link']),points:nonnegative,dueAt:S.timestamp.nullable().optional()});
const activity=z.object({activityKind:z.enum(['lesson','assignment']),activityId:id});
export const OPERATIONS: { [K in Operation]: { input: z.ZodType<Input<K>>; output: z.ZodType<Output<K>> } } = {
 getSession:{input:z.void(),output:z.object({user:S.UserSchema.nullable(),institution:S.InstitutionSchema})},
 signIn:{input:by('userId'),output:z.object({user:S.UserSchema.nullable(),institution:S.InstitutionSchema})},
 signOut:{input:z.void(),output:ok},listDemoUsers:{input:z.void(),output:z.array(S.UserSchema)},resetDemo:{input:z.void(),output:ok},
 updateInstitution:{input:S.InstitutionSchema.pick({name:true,shortName:true,accent:true,setupComplete:true}).partial(),output:S.InstitutionSchema},
 updatePolicy:{input:S.AiPolicySchema,output:S.InstitutionSchema},getOverview:{input:z.void(),output:S.OverviewSchema},
 listUsers:{input:z.object({role:S.RoleSchema.optional()}),output:z.array(S.UserSchema)},
 createUser:{input:z.object({name:required,email,role:S.RoleSchema}),output:S.UserSchema},
 importUsers:{input:z.object({csv:required}),output:z.object({created:z.array(S.UserSchema),errors:z.array(z.object({line:integer.min(1),message:string}))})},
 updateUser:{input:z.object({userId:id,name:required.optional(),role:S.RoleSchema.optional()}),output:S.UserSchema},
 listCourses:{input:z.void(),output:z.array(S.CourseSummarySchema)},createCourse:{input:courseInput,output:S.CourseSchema},
 getCourseOutline:{input:by('courseId'),output:S.CourseOutlineSchema},
 updateCourse:{input:z.object({courseId:id,code:required.optional(),title:required.optional(),term:required.optional(),description:string.optional(),welcome:string.optional(),outcomes:z.array(required).optional()}),output:S.CourseSchema},
 setCourseInstructors:{input:z.object({courseId:id,userIds:z.array(id)}),output:S.CourseSchema},
 getCourseEnrollments:{input:by('courseId'),output:z.object({userIds:z.array(id)})},setCourseEnrollments:{input:z.object({courseId:id,userIds:z.array(id)}),output:z.object({userIds:z.array(id)})},
 getRoster:{input:by('courseId'),output:z.array(S.RosterEntrySchema)},
 createModule:{input:z.object({courseId:id,title:required}),output:S.ModuleSchema},updateModule:{input:z.object({moduleId:id,title:required.optional(),position:integer.min(0).optional()}),output:S.ModuleSchema},deleteModule:{input:by('moduleId'),output:ok},
 createLesson:{input:z.object({moduleId:id,title:required,minutes:minutes.optional()}),output:S.LessonSchema},
 updateLesson:{input:z.object({lessonId:id,title:required.optional(),minutes:minutes.optional(),position:integer.min(0).optional(),moduleId:id.optional()}),output:S.LessonSchema},
 deleteLesson:{input:by('lessonId'),output:ok},getLesson:{input:by('lessonId'),output:S.LessonDetailSchema},
 saveBlocks:{input:z.object({lessonId:id,blocks:z.array(S.BlockInputSchema)}),output:S.LessonDetailSchema},
 keepBlock:{input:by('blockId'),output:S.LessonDetailSchema},revertBlock:{input:by('blockId'),output:S.LessonDetailSchema},
 regenerateBlock:{input:z.object({blockId:id,instruction:string.optional()}),output:S.LessonDetailSchema},
 publishLesson:{input:by('lessonId'),output:S.LessonSchema},unpublishLesson:{input:by('lessonId'),output:S.LessonSchema},
 saveProfile:{input:S.LearningProfileSchema.omit({completedAt:true}),output:S.UserSchema},getToday:{input:z.void(),output:S.TodaySchema},
 getStudentLesson:{input:by('lessonId'),output:S.StudentLessonSchema},answerCheck:{input:z.object({lessonId:id,blockId:id,optionId:id}),output:S.CheckResultSchema},
 setLessonProgress:{input:z.object({lessonId:id,state:z.enum(['in-progress','completed'])}),output:S.LessonProgressSchema},
 listAnnouncements:{input:z.object({courseId:id.optional()}),output:z.array(S.AnnouncementSchema)},
 createAnnouncement:{input:z.object({courseId:id,title:required,body:string,pinned:z.boolean(),publish:z.boolean(),aiDraft:S.ProvenanceSchema.optional()}),output:S.AnnouncementSchema},
 updateAnnouncement:{input:z.object({announcementId:id,title:required.optional(),body:string.optional(),pinned:z.boolean().optional(),publish:z.boolean().optional()}),output:S.AnnouncementSchema},
 deleteAnnouncement:{input:by('announcementId'),output:ok},markAnnouncementRead:{input:by('announcementId'),output:ok},
 draftAnnouncement:{input:z.object({courseId:id,prompt:required}),output:z.object({title:required,body:string,provenance:S.ProvenanceSchema})},
 listBuilderSessions:{input:by('courseId'),output:z.array(S.BuilderSessionSchema)},
 createBuilderSession:{input:z.object({courseId:id,prompt:required,sources:z.array(z.object({name:required,text:string}))}),output:S.BuilderSessionSchema},
 getBuilderSession:{input:by('sessionId'),output:S.BuilderSessionSchema},updateBuilderSession:{input:z.object({sessionId:id,brief:S.CourseBriefSchema.optional(),outline:S.OutlineDraftSchema.optional()}),output:S.BuilderSessionSchema},
 generateOutline:{input:by('sessionId'),output:S.BuilderSessionSchema},generateDrafts:{input:by('sessionId'),output:S.BuilderSessionSchema},
 whoAmI:{input:z.void(),output:z.object({email:email.nullable(),user:S.UserSchema.nullable(),viewingAs:S.UserSchema.nullable()})},
 viewAs:{input:z.object({userId:id.nullable()}),output:z.object({user:S.UserSchema.nullable(),institution:S.InstitutionSchema})},
 listInvitations:{input:pageInput,output:page(S.InvitationSchema)},inviteUser:{input:z.object({name:required,email,role:S.RoleSchema}),output:S.InvitationSchema},
 listApiTokens:{input:z.void(),output:z.array(S.ApiTokenSchema)},createApiToken:{input:z.object({name:required,scopes:z.array(S.ScopeSchema),expiresInDays:integer.min(1).optional()}),output:z.object({token:S.ApiTokenSchema,secret:required})},revokeApiToken:{input:by('tokenId'),output:ok},
 listFiles:{input:z.object({courseId:id}).extend(pageInput.shape),output:page(S.FileRecordSchema)},getFile:{input:by('fileId'),output:S.FileRecordSchema},deleteFile:{input:by('fileId'),output:ok},
 getFormats:{input:by('fileId'),output:z.array(S.FormatStatusSchema)},requestFormat:{input:z.object({fileId:id,format:z.enum(['reading','audio','epub','ocr'])}),output:S.FormatStatusSchema},
 getLessonAccess:{input:by('lessonId'),output:S.AccessReportSchema},scanFile:{input:by('fileId'),output:S.AccessReportSchema},getFileAccess:{input:by('fileId'),output:S.AccessReportSchema},
 fixFileIssue:{input:z.object({fileId:id,issueIndex:integer.min(0),fix:z.discriminatedUnion('kind',[z.object({kind:z.literal('alt-text'),element:integer.min(0),alt:string,decorative:z.boolean()}),z.object({kind:z.literal('table-header'),element:integer.min(0)}),z.object({kind:z.literal('metadata'),title:string.optional(),language:required.optional()}),z.object({kind:z.literal('ocr'),language:required.optional()})])}),output:S.AccessReportSchema},
 suggestFix:{input:z.object({target:z.union([z.object({lessonId:id,blockId:id}),z.object({fileId:id,element:integer.min(0)})]),kind:z.enum(['alt-text','rewrite','link-text'])}),output:z.object({suggestion:string,provenance:S.ProvenanceSchema})},
 getCourseAccess:{input:by('courseId'),output:S.CourseAccessReportSchema},getInstitutionAccess:{input:z.void(),output:S.InstitutionAccessReportSchema},exportInstitutionAccess:{input:z.void(),output:z.object({csv:string})},updateAccessPolicy:{input:S.AccessPolicySchema,output:S.InstitutionSchema},
 listAssignments:{input:by('courseId'),output:z.array(S.AssignmentSchema)},
 createAssignment:{input:assignmentInput,output:S.AssignmentSchema},getAssignment:{input:by('assignmentId'),output:S.AssignmentSchema},
 updateAssignment:{input:z.object({assignmentId:id,title:required.optional(),dueAt:S.timestamp.nullable().optional(),points:nonnegative.optional(),submissionType:z.enum(['text','file','link']).optional(),rubric:z.array(S.RubricCriterionSchema).optional(),position:integer.min(0).optional(),instructions:z.array(S.BlockInputSchema.refine(b=>['heading','text','callout'].includes(b.type),{message:'Assignment instructions support headings, text, and callouts.'})).optional()}),output:S.AssignmentSchema},
 deleteAssignment:{input:by('assignmentId'),output:ok},publishAssignment:{input:by('assignmentId'),output:S.AssignmentSchema},
 listSubmissions:{input:z.object({assignmentId:id}).extend(pageInput.shape),output:page(S.SubmissionSchema.extend({student:userShort}))},
 submit:{input:z.object({assignmentId:id,text:string.optional(),fileId:id.optional(),link:string.optional()}),output:S.SubmissionSchema},getMySubmission:{input:by('assignmentId'),output:S.SubmissionSchema.nullable()},
 gradeSubmission:{input:z.object({submissionId:id,criteria:gradeCriteria,score:nonnegative,feedback:string,feedbackOrigin:z.enum(['human','ai']),feedbackProvenance:S.ProvenanceSchema.nullable().optional()}),output:S.SubmissionSchema},
 draftFeedback:{input:z.object({submissionId:id,criteria:gradeCriteria}),output:z.object({feedback:string,provenance:S.ProvenanceSchema})},releaseGrades:{input:by('assignmentId'),output:ok},
 getGradebook:{input:by('courseId'),output:z.object({assignments:z.array(S.AssignmentSchema.pick({id:true,title:true,points:true,dueAt:true})),rows:z.array(S.GradebookRowSchema)})},exportGradebook:{input:by('courseId'),output:z.object({csv:string})},
 getTutorSetting:{input:activity,output:S.TutorSettingSchema.nullable()},setTutorSetting:{input:S.TutorSettingSchema.omit({setBy:true,setAt:true}),output:S.TutorSettingSchema},startTutorSession:{input:activity,output:S.TutorSessionSchema},
 sendTutorMessage:{input:z.object({sessionId:id,text:required,intent:z.enum(['hint','explain','answer','chat'])}),output:z.object({session:S.TutorSessionSchema,reply:S.TutorMessageSchema})},getTutorSummaries:{input:by('courseId'),output:z.array(S.TutorSummarySchema)},
 listPresets:{input:z.void(),output:z.array(S.PresetSchema)},suggestPreset:{input:z.void(),output:z.object({preset:S.PresetSchema,why:required,provenance:S.ProvenanceSchema.nullable()})},applyPreset:{input:z.object({presetId:S.PresetSchema.shape.id}),output:z.array(S.AdaptationSchema)},listAdaptations:{input:z.void(),output:z.array(S.AdaptationSchema)},undoAdaptation:{input:by('adaptationId'),output:S.AdaptationSchema},
 generateAtScope:{input:z.object({courseId:id,scope:z.object({moduleIds:z.array(id).optional(),lessonIds:z.array(id).optional(),elementTypes:z.array(z.enum(['heading','text','callout','image','check','document','file','video','table','scenario','link'])).optional(),wholeCourse:z.boolean().optional(),videoScript:z.boolean().optional()}),instruction:string.optional()}),output:z.object({jobId:id})},
 getGenerationJob:{input:by('jobId'),output:z.object({jobId:id,state:z.enum(['running','done','failed']),done:nonnegative,total:nonnegative,lessonIds:z.array(id),error:string.nullable(),failures:z.array(z.object({lessonId:id,type:z.enum(['heading','text','callout','image','check','document','file','video','table','scenario','link']),message:string}))})},
 generateElement:{input:z.object({lessonId:id,type:z.enum(['heading','text','callout','image','check','document','file','video','table','scenario','link']),instruction:string.optional(),position:integer.min(0).optional()}),output:S.LessonDetailSchema},
 importCourse:{input:z.object({course:courseInput.extend({welcome:string.optional(),outcomes:z.array(required).optional()}),modules:z.array(z.object({title:required,lessons:z.array(z.object({title:required,minutes:minutes.optional(),blocks:z.array(S.BlockInputSchema)}))}))}),output:S.CourseOutlineSchema}
};
