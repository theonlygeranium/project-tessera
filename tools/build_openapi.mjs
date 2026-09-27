// Run with `npm run build:openapi`; esbuild bundles the TypeScript entry without a new dependency.
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const temp = await mkdtemp(join(tmpdir(), 'tessera-openapi-'));
try {
  const bundle = join(temp, 'entry.mjs');
  await build({entryPoints:[resolve('shared/schema/openapi-entry.ts')],outfile:bundle,bundle:true,platform:'node',format:'esm',logLevel:'silent'});
  const {z,domain,OPERATIONS,ROUTES,API_PREFIX} = await import(pathToFileURL(bundle).href);
  const components = {};
  for (const [name,schema] of Object.entries(domain)) {
    if (name.endsWith('Schema') && schema instanceof z.ZodType) z.globalRegistry.add(schema,{id:name.slice(0,-6)});
  }
  function convert(schema, io='output') {
    const json = z.toJSONSchema(schema,{target:'draft-2020-12',io,unrepresentable:'any',cycles:'ref'});
    const defs = json.$defs ?? {};
    delete json.$defs;
    for (const [name,definition] of Object.entries(defs)) components[name]=definition;
    function refs(node) {
      if (Array.isArray(node)) return node.forEach(refs);
      if (!node || typeof node !== 'object') return;
      if (typeof node.$ref === 'string') node.$ref=node.$ref.replace('#/$defs/','#/components/schemas/');
      for (const value of Object.values(node)) refs(value);
    }
    refs(json); for(const definition of Object.values(defs)) refs(definition);
    delete json.$schema;
    return json;
  }
  // Include named schemas even if a route only reaches them through a nested type.
  for (const [name,schema] of Object.entries(domain)) if(name.endsWith('Schema') && schema instanceof z.ZodType) components[name.slice(0,-6)]=convert(schema);
  components.ApiErrorBody={type:'object',required:['error'],properties:{error:{type:'object',required:['code','message'],properties:{code:{type:'string',enum:['unauthenticated','forbidden','not-found','invalid','conflict','not-ready','ai-disabled','ai-failed','rate-limited','too-large','unsupported']},message:{type:'string'},details:{}}}}};
  const paths={};
  const tag=(op,path)=>{
    if(path.includes('/import')||op.startsWith('import')) return 'import';
    if(path.includes('/tutor')) return 'tutor';
    if(path.includes('/adaptations')||path.includes('/preset')) return 'adaptations';
    if(path.startsWith('/ai')||path.includes('/generate')||path.includes('/builder')||op.startsWith('draft')) return 'ai';
    if(path.includes('/access')||path.includes('access-policy')) return 'access';
    if(path.includes('/assignment')||path.includes('/submission')||path.includes('/gradebook')) return 'assignments';
    if(path.includes('/file')||path.includes('/format')) return 'files';
    if(path.includes('/lesson')||path.includes('/module')||path.includes('/block')) return 'content';
    if(path.includes('/course')||path.includes('/announcement')) return 'courses';
    if(path.includes('/user')||path.includes('/invitation')||path.includes('/institution')||path.includes('/overview')) return 'people';
    return 'session';
  };
  for (const [op,route] of Object.entries(ROUTES)) {
    const schema=OPERATIONS[op];
    if (!schema) throw new Error(`Missing schema: ${op}`);
    const path=API_PREFIX+route.path.replace(/:(\w+)/g,'{$1}');
    const method=route.method.toLowerCase();
    const raw=convert(schema.input,'input');
    const properties=raw.properties ?? {};
    const required=new Set(raw.required ?? []);
    const pathNames=[...route.path.matchAll(/:(\w+)/g)].map(m=>m[1]);
    const parameters=pathNames.map(name=>({name,in:'path',required:true,schema:properties[name] ?? {type:'string',minLength:1}}));
    const remaining=Object.fromEntries(Object.entries(properties).filter(([name])=>!pathNames.includes(name)));
    if(method==='get'||method==='delete') for(const [name,property] of Object.entries(remaining)) parameters.push({name,in:'query',required:required.has(name),schema:property});
    const responses={200:{description:'Success',content:{'application/json':{schema:convert(schema.output)}}}};
    for(const status of [400,401,403,404,409,429]) responses[status]={description:'API error',content:{'application/json':{schema:{$ref:'#/components/schemas/ApiErrorBody'}}}};
    const action={operationId:op,tags:[tag(op,route.path)],parameters,responses,'x-scope':route.scope,security:route.access==='public'?[]:[{bearerAuth:[]}]};
    if(!['get','delete'].includes(method) && schema.input._zod.def.type!=='void') action.requestBody={required:true,content:{'application/json':{schema:{...raw,properties:remaining,required:[...required].filter(name=>!pathNames.includes(name))}}}};
    (paths[path]??={})[method]=action;
  }
  const output={openapi:'3.1.0',info:{title:'Tessera API',version:'1'},servers:[{url:'https://tessera.edstratumlabs.ai',description:'Production'}],paths,components:{securitySchemes:{bearerAuth:{type:'http',scheme:'bearer',description:'Scoped tsk_… API token or Access JWT'}},schemas:components}};
  const destination=resolve('docs/api/openapi.json');
  await mkdir(resolve('docs/api'),{recursive:true});
  await writeFile(destination,JSON.stringify(output,null,2)+'\n');
  // The public docs' API reference reads its own copy (mintlify/ deploys on its own).
  await mkdir(resolve('mintlify/api'),{recursive:true});
  await writeFile(resolve('mintlify/api/openapi.json'),JSON.stringify(output,null,2)+'\n');
  console.log(`${destination}: ${Object.keys(paths).length} paths, ${Object.keys(ROUTES).length} operations`);
} finally { await rm(temp,{recursive:true,force:true}); }
