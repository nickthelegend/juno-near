import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { market, posts, formatNear } from '@juno/sdk';

const factory=process.env.JUNO_FACTORY_ACCOUNT;
const rpc=process.env.NEAR_TESTNET_RPC_URL;
const server=new McpServer({name:'juno-near',version:'0.1.0'});
const output=(value:unknown)=>({content:[{type:'text' as const,text:JSON.stringify(value)}]});
server.registerTool('list_posts',{description:'Read all live Juno post markets from the testnet factory',inputSchema:z.object({})},async()=>{
  if(!factory) return output({error:'Setup required: JUNO_FACTORY_ACCOUNT'});
  try { return output(await posts(factory,rpc)); } catch(e){return output({error:String(e)});}
});
server.registerTool('inspect_market',{description:'Read auction, floor vault, curve, dare and creator earnings from a live token account',inputSchema:z.object({account:z.string()})},async({account})=>{
  try { const data=await market(account,rpc); return output({...data, floorNearPerToken:formatNear(BigInt(data.floor_per_token)), explorer:`https://testnet.nearblocks.io/address/${account}`}); }
  catch(e){return output({error:String(e)});}
});
await server.connect(new StdioServerTransport());
