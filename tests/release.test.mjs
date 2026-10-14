import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRelease} from '../scripts/check-release.mjs';
function fixture(version='0.2.0') {
  return {pkg:{name:'askreport',version,repository:{url:'git+https://github.com/jerrywu001/ask-report-html.git'},
    bin:{askreport:'bin/ask-report-html.mjs'},publishConfig:{access:'public',registry:'https://registry.npmjs.org'},scripts:{}},
    lock:{name:'askreport',version,packages:{'':{name:'askreport',version}}},manifest:{version},tag:'v'+version};
}
test('release gate accepts matching stable and prerelease versions with distinct dist-tags',()=>{
  assert.deepEqual(validateRelease(fixture()),{version:'0.2.0',distTag:'latest'});
  assert.deepEqual(validateRelease(fixture('0.3.0-beta.1')),{version:'0.3.0-beta.1',distTag:'next'});
});
test('release gate rejects missing, malformed, stale and mismatched tags',()=>{
  for(const tag of [undefined,'0.2.0','v0.2','v0.2.1','v0.2.0-beta.1'])assert.throws(()=>validateRelease({...fixture(),tag}),/Release tag/);
  const invalid=fixture();invalid.pkg.version='invalid';assert.throws(()=>validateRelease(invalid),/Invalid package version/);
});
test('release gate rejects private packages, stale locks/manifests and publishing identity drift',()=>{
  for(const change of [
    data=>{data.pkg.private=true;},data=>{data.pkg.name='another-package';},
    data=>{data.lock.name='old-name';},data=>{data.lock.version='0.1.0';},
    data=>{data.lock.packages[''].version='0.1.0';},data=>{data.manifest.version='0.1.0';},
    data=>{data.repository='another-owner/fork';},data=>{delete data.pkg.bin.askreport;},
    data=>{data.pkg.publishConfig.access='restricted';},data=>{data.pkg.publishConfig.registry='https://example.com';}
  ]){const data=fixture();change(data);assert.throws(()=>validateRelease(data));}
});
test('release gate refuses install-time scripts that could modify agent settings during npm installation',()=>{
  for(const hook of ['preinstall','install','postinstall','prepare']) {
    const data=fixture();data.pkg.scripts[hook]='node side-effect.mjs';assert.throws(()=>validateRelease(data),/Install-time hooks/);
  }
});
