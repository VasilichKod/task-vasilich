#!/usr/bin/env node
// Explicit one-off recovery: three-way merge, no deletes, audit file, atomic commit.
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {MODELS,plain,fingerprint,toDesired,makePlan,reuseNewGroups} from './browser-recovery-plan.mjs';
const require=createRequire('/var/www/task-vasilich/V3/package.json');
const {PrismaClient}=require('@prisma/client');
const options=Object.fromEntries(process.argv.slice(2).map(arg=>{
  const [key,...rest]=arg.replace(/^--/,'').split('=');return [key,rest.length?rest.join('='):true];
}));
const workspaceId='cmnx5fqd50003wrgy25ey7qvl';
const sourcePath=options.source;
if (!sourcePath || !options.baseline || !options.report) throw new Error('source/baseline/report required');
if (fs.existsSync(options.report)) throw new Error('Audit report already exists; refusing to overwrite');
const raw=JSON.parse(fs.readFileSync(sourcePath,'utf8'));
const sourceHash=fingerprint(raw);
if (sourceHash !== options['source-hash']) throw new Error('Source fingerprint mismatch');
function urlFor(database) {
  if (database!=='task_vasilich_v3' && !/^nedplan_recovery_(base|test)_20261106$/.test(database)) throw new Error('Unsafe database target');
  const url=new URL(process.env.DATABASE_URL);url.pathname='/'+database;return url.toString();
}
const target=options.database||'task_vasilich_v3';
if (options.apply && target==='task_vasilich_v3') {
  const state=execFileSync('systemctl',['show','task-vasilich-v3','-p','ActiveState','--value'],{encoding:'utf8'}).trim();
  if (state!=='inactive') throw new Error('Stop application briefly before production recovery');
}
const prisma=new PrismaClient({datasources:{db:{url:urlFor(target)}},log:[]});
const baselineDb=new PrismaClient({datasources:{db:{url:urlFor(options.baseline)}},log:[]});
async function load(db) {
  const workspace=await db.workspace.findUniqueOrThrow({where:{id:workspaceId},include:{owner:{select:{id:true,email:true}}}});
  const result={workspace};
  for (const model of MODELS) {
    result[model]=await db[model].findMany({where:model==='profile'?{userId:workspace.ownerUserId}:{workspaceId},orderBy:{id:'asc'}});
  }
  // These are not present in the browser file and must remain byte-for-byte unchanged.
  result.untouched={};
  for (const model of ['projectNote','projectNoteSection','wishList','wishItem','recurringTaskStatus']) {
    result.untouched[model]=await db[model].findMany({where:{workspaceId},orderBy:{id:'asc'}});
  }
  result.otherWorkspaces={};
  for (const model of ['workspace','group','project','weeklyTask','backlogTask','projectNote']) {
    result.otherWorkspaces[model]=await db[model].findMany({where:model==='workspace'?{id:{not:workspaceId}}:{workspaceId:{not:workspaceId}},orderBy:{id:'asc'}});
  }
  return plain(result);
}
async function planFor(db,baseline) {
  const current=await load(db);
  const s=raw.snapshot||raw;
  if (s.profile.email.toLowerCase()!==current.workspace.owner.email.toLowerCase()) throw new Error('Owner identity mismatch');
  const overlaps=s.subs.filter(p=>current.project.some(c=>c.id===p.id)).length;
  if(overlaps<10) throw new Error('Insufficient project identity overlap');
  const {desired,aliases}=reuseNewGroups(toDesired(raw,workspaceId,current.workspace.ownerUserId,current.profile[0]),baseline,current);
  for(const model of ['group','project','weeklyTask','backlogTask','recurringTask','achievement']) {
    const ids=desired[model].map(row=>row.id);
    const foreign=await db[model].count({where:{id:{in:ids},workspaceId:{not:workspaceId}}});
    if(foreign) throw new Error('Cross-workspace identifier collision');
  }
  const plan=makePlan(desired,baseline,current);
  if (plan.skippedReferences.length) throw new Error('Unresolved source references; inspect before applying');
  return {current,plan,desired,aliases};
}
try {
  const baseline=await load(baselineDb);
  let result;
  if (!options.apply) {
    const {current,plan,aliases}=await planFor(prisma,baseline);
    result={mode:'dry-run',target,sourceHash,currentFingerprint:fingerprint(current),
      planHash:fingerprint(plan),groupAliases:aliases,...plan};
  } else {
    result=await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT id FROM workspaces WHERE id=${workspaceId} FOR UPDATE`;
      const {current,plan,aliases}=await planFor(tx,baseline);
      if (!options.expect || fingerprint(plan)!==options.expect) throw new Error('Plan changed; dry-run again before applying');
      for (const operation of plan.operations) {
        await tx[operation.model][operation.action]({...(operation.where?{where:operation.where}:{}),data:operation.data});
      }
      await tx.workspace.update({where:{id:workspaceId},data:{planningVersion:{increment:1}}});
      const after=await load(tx);
      if(fingerprint(after.untouched)!==fingerprint(current.untouched)) throw new Error('Untouched content changed');
      if(fingerprint(after.otherWorkspaces)!==fingerprint(current.otherWorkspaces)) throw new Error('Other account changed');
      const remaining=makePlan(reuseNewGroups(toDesired(raw,workspaceId,current.workspace.ownerUserId,current.profile[0]),baseline,after).desired,baseline,after);
      if(remaining.operations.length) throw new Error('Recovery is not idempotent');
      return {mode:'applied',target,sourceHash,planHash:fingerprint(plan),groupAliases:aliases,...plan,
        afterCounts:Object.fromEntries(MODELS.map(m=>[m,after[m].length])),
        planningVersion:after.workspace.planningVersion,untouchedVerified:true,otherWorkspacesVerified:true};
    },{timeout:120000,isolationLevel:'Serializable'});
  }
  fs.writeFileSync(options.report,JSON.stringify(result,null,2)+'\n',{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({mode:result.mode,target,sourceHash,planHash:result.planHash,stats:result.stats,
    conflicts:result.conflicts.length,preservedDeletions:result.preservedDeletions.length,groupAliases:result.groupAliases,
    afterCounts:result.afterCounts,untouchedVerified:result.untouchedVerified,otherWorkspacesVerified:result.otherWorkspacesVerified},null,2));
} catch(error) {
  console.error('Recovery failed:',error.name,error.message.replace(/postgres(?:ql)?:\/\/\S+/g,'[redacted]'));
  process.exitCode=1;
} finally {await prisma.$disconnect();await baselineDb.$disconnect();}
