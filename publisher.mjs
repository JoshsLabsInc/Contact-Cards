import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {randomBytes,timingSafeEqual} from 'node:crypto';
const repo='JoshsLabsInc/Contact-Cards';
const session=randomBytes(32).toString('hex');
const types=new Map([['index.html','text/html'],['style.css','text/css'],['studio.js','text/javascript'],['card.js','text/javascript'],['qr.js','text/javascript'],['mark.svg','image/svg+xml']]);
function gitLogin(){
  return new Promise((resolve,reject)=>{
    const child=execFile('git',['-c','credential.interactive=never','credential','fill'],{env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'Never'},timeout:45000,windowsHide:true},(err,out)=>{
      const token=out.match(/^password=(.+)$/m)?.[1]?.trim();
      if(err||!token)reject(Error('Sign in to GitHub with Git Credential Manager.'));else resolve(token);
    });
    child.stdin.end('protocol=https\nhost=github.com\npath='+repo+'.git\n\n');
  });
}
const server=http.createServer(async(req,res)=>{
  const origin='http://127.0.0.1:'+server.address().port;
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"frame-ancestors 'none'");
  const end=(code,body='')=>{res.statusCode=code;res.end(body);};
  if(req.headers.host!==new URL(origin).host)return end(403);
  const path=new URL(req.url,origin).pathname;
  try{
    if(req.method==='GET'&&path==='/_session'){res.setHeader('Content-Type','application/json');return end(200,JSON.stringify({session}));}
    if(req.method==='GET'){
      const name=path==='/'?'index.html':path.slice(1);
      if(!types.has(name))return end(404);
      res.setHeader('Content-Type',types.get(name)+'; charset=utf-8');return end(200,await readFile(new URL('./docs/'+name,import.meta.url)));
    }
    const match=/^\/_publish\/([a-f0-9]{32})$/.exec(path);
    if(req.method!=='POST'||!match)return end(404);
    const received=Buffer.from(String(req.headers['x-folio-session']||'')),expected=Buffer.from(session);
    if(req.headers.origin!==origin||received.length!==expected.length||!timingSafeEqual(received,expected))return end(403);
    const chunks=[];let size=0;
    for await (const chunk of req){size+=chunk.length;if(size>2097152+28)return end(413);chunks.push(chunk);}
    if(size<=28)return end(400);
    const token=await gitLogin();
    const result=await fetch('https://api.github.com/repos/'+repo+'/contents/vcf/'+match[1]+'.vcf.enc',{method:'PUT',headers:{Authorization:'Bearer '+token,'User-Agent':'Folio-publisher','Content-Type':'application/json'},body:JSON.stringify({message:'Publish encrypted contact',content:Buffer.concat(chunks).toString('base64'),branch:'main'})});
    return end(result.status);
  }catch{return end(503);}
});
server.on('error',e=>{console.error(e.message);process.exitCode=1;});
server.listen(Number(process.env.FOLIO_PORT||0),'127.0.0.1',()=>{
  const url='http://127.0.0.1:'+server.address().port+'/';
  console.log('Folio studio: '+url);
  if(process.argv.includes('--open')&&process.platform==='win32')execFile('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true});
});


