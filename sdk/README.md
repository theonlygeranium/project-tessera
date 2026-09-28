# @tessera/sdk

The TypeScript source SDK for Tessera API v1. This package is private and has not been published to npm. From a checkout that includes `sdk/` and `shared/`, install it by repository path (`npm install ./sdk`) and use a TypeScript-capable runtime or bundler.

Create an API token in the Tessera app with `courses:read` and `courses:write`. Import a fictional course:

```ts
import { createClient, paginate } from '@tessera/sdk';

const api = createClient({
  baseUrl: 'https://tessera.edstratumlabs.ai',
  token: process.env.TESSERA_TOKEN!,
});

const outline = await api.importCourse({
  course: { code: 'EPI 110', title: 'Introduction to Epidemiology', term: 'Spring 2027' },
  modules: [{ title: 'Counting cases', lessons: [{ title: 'Rates and ratios', blocks: [] }] }],
}, { idempotencyKey: 'epi-110-spring-2027' });

console.log(outline.course.id);

// Cursor-paginated operations such as listFiles work with paginate.
for await (const file of paginate(api.listFiles, { courseId: outline.course.id, limit: 20 })) {
  console.log(file.name);
}

// Courses currently return an array, so list them directly.
console.log(await api.listCourses());
```

Each call accepts an optional `{ signal, idempotencyKey }` argument. `TesseraError` includes `code`, `message`, `details`, HTTP `status`, and `requestId`. A 429 response is retried once after `Retry-After`, capped at ten seconds. Use `uploadFile(courseId, blob, name)` for multipart uploads and `fileUrl(fileId, format?)` for content URLs.
