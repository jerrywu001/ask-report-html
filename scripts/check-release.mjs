import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function validateRelease({pkg,lock,manifest,tag,repository='jerrywu001/ask-report-html'}) {
  if(pkg.name!=='askreport'||pkg.private===true)throw new Error('Release must be the public askreport package.');
  if(typeof pkg.version!=='string'||!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(pkg.version))throw new Error('Invalid package version.');
  if(tag!==`v${pkg.version}`)throw new Error('Release tag must equal v'+pkg.version+'.');
  if(lock.name!==pkg.name||lock.version!==pkg.version||lock.packages?.['']?.name!==pkg.name||lock.packages?.['']?.version!==pkg.version)
    throw new Error('Package lock name/version does not match package.json.');
  if(manifest.version!==pkg.version)throw new Error('Skill manifest version is stale; run npm run build.');
  if(pkg.repository?.url!==`git+https://github.com/${repository}.git`)throw new Error('Repository URL does not match the publishing repository.');
  if(pkg.bin?.askreport!=='bin/ask-report-html.mjs')throw new Error('Missing askreport CLI entry.');
  if(pkg.publishConfig?.access!=='public'||pkg.publishConfig?.registry!=='https://registry.npmjs.org')throw new Error('Invalid public npm registry settings.');
  for(const hook of ['preinstall','install','postinstall','prepare'])if(pkg.scripts?.[hook])throw new Error('Install-time hooks are not allowed: '+hook);
  return {version:pkg.version,distTag:pkg.version.includes('-')?'next':'latest'};
}
async function main() {
  const read=async file=>JSON.parse(await fs.readFile(path.join(root,file),'utf8'));
  const [pkg,lock,manifest]=await Promise.all(['package.json','package-lock.json','assets/skill-manifest.json'].map(read));
  const result=validateRelease({pkg,lock,manifest,tag:process.env.RELEASE_TAG,repository:process.env.GITHUB_REPOSITORY||'jerrywu001/ask-report-html'});
  console.log(`Release identity verified: askreport@${result.version} (${result.distTag}).`);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
