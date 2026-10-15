import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {mkdtempSync,rmSync} from 'node:fs';
const root=dirname(fileURLToPath(import.meta.url));
const temp=mkdtempSync(join(tmpdir(),'darkcut-audio-test-'));
try {
 const test=join(temp,process.platform==='win32'?'tests.exe':'tests');
 execFileSync('rustc',['--edition','2021','--test',join(root,'lib.rs'),'-o',test],{stdio:'inherit'});
 execFileSync(test,[],{stdio:'inherit'});
 execFileSync('rustc',['--edition','2021','--crate-type','cdylib','--target','wasm32-unknown-unknown','-O','-C','strip=symbols','-C','panic=abort',join(root,'lib.rs'),'-o',join(root,'../../apps/web/public/darkcut/audio.wasm')],{stdio:'inherit'});
}finally{rmSync(temp,{recursive:true,force:true});}
