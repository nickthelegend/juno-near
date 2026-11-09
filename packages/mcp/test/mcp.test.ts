import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

function response(child: ReturnType<typeof spawn>, id:number, method:string, params:object={}):Promise<any>{
  return new Promise((resolve,reject)=>{
    let buffer='';
    const timeout=setTimeout(()=>{child.stdout?.off('data',onData);reject(Error(`MCP ${method} timed out`));},10000);
    const onData=(chunk:Buffer)=>{
      buffer+=chunk.toString();
      for(const line of buffer.split('\n')){
        if(!line.trim())continue;
        let message:any;try{message=JSON.parse(line);}catch{continue;}
        if(message.id===id){clearTimeout(timeout);child.stdout?.off('data',onData);if(message.error)reject(Error(JSON.stringify(message.error)));else resolve(message.result);return;}
      }
      buffer=buffer.slice(buffer.lastIndexOf('\n')+1);
    };
    child.stdout?.on('data',onData);
    child.stdin?.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
  });
}
test('stdio server exposes read-only tools and an explicit setup state',async()=>{
  const env={...process.env};delete env.JUNO_FACTORY_ACCOUNT;
  const child=spawn('node',['--import','tsx','src/main.ts'],{cwd:process.cwd(),env,stdio:['pipe','pipe','pipe']});
  try{
    const init=await response(child,1,'initialize',{protocolVersion:'2026-07-28',capabilities:{},clientInfo:{name:'juno-test',version:'1'}});
    assert.ok(init.serverInfo);
    child.stdin?.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
    const listed=await response(child,2,'tools/list');
    assert.deepEqual(listed.tools.map((x:any)=>x.name).sort(),['inspect_market','list_posts']);
    const called=await response(child,3,'tools/call',{name:'list_posts',arguments:{}});
    assert.match(called.content[0].text,/Setup required: JUNO_FACTORY_ACCOUNT/);
  }finally{child.kill();}
});
