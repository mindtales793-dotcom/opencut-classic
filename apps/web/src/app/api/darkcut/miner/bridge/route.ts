import { createHash, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { sanitizeMinerVideo } from "@/darkcut/niche-miner";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const EXTENSION_ORIGIN=/^chrome-extension:\/\/[a-p]{32}$/;
type ImportRow={videoId:string;title:string;channel:string;views:number;subscribers:number|null;publishedAt?:string;language?:string;outlier?:number|null;vph?:number|null;list:"saved"|"watched"};
const cfg=()=>process.env.DARKCUT_DATA_DIR&&process.env.DARKCUT_MEDIA_BRIDGE_TOKEN
 ?{directory:path.join(process.env.DARKCUT_DATA_DIR,"darkminer"),key:process.env.DARKCUT_MEDIA_BRIDGE_TOKEN}:null;
const file=(folder:string)=>path.join(folder,"extension-videos.json");
const originHeaders=(request:Request):Record<string,string>=>{
 const origin=request.headers.get("origin")||"";
 return EXTENSION_ORIGIN.test(origin)?{
  "Access-Control-Allow-Origin":origin, "Vary":"Origin",
  "Access-Control-Allow-Headers":"content-type,x-darkcut-bridge-token",
  "Access-Control-Allow-Methods":"GET,POST,OPTIONS",
 }:{};
};
const reply=(req:Request,data:unknown,status=200)=>NextResponse.json(data,{
 status,headers:{"Cache-Control":"no-store",...originHeaders(req)},
});
function auth(req:Request,key:string){
 const provided=Buffer.from(req.headers.get("x-darkcut-bridge-token")||"");
 const expected=Buffer.from(key);
 return provided.length===expected.length&&timingSafeEqual(provided,expected);
}
async function records(folder:string):Promise<ImportRow[]>{
 try {const data=JSON.parse(await readFile(file(folder),"utf8")) as unknown;
   if(!Array.isArray(data))return [];
   return data.slice(0,300).map((r:unknown)=>{
    const record=r as Record<string,unknown>;
    const video=sanitizeMinerVideo(record);
    return video?{...video,list:record.list==="watched"?"watched":"saved"}:null;
   }).filter((r):r is ImportRow=>r!==null);
 }catch{return [];}
}
export function OPTIONS(req:Request){
 return new Response(null,{status:204,headers:originHeaders(req)});
}
export async function GET(req:Request){
 const conf=cfg();
 if(!conf)return reply(req,{error:"Use a versão Windows do DarkCut Studio para sincronizar a extensão."},503);
 if(!auth(req,conf.key))return reply(req,{error:"Extensão não pareada."},401);
 const rows=await records(conf.directory);
 return reply(req,{videos:rows,total:rows.length});
}
export async function POST(req:Request){
 const conf=cfg();
 if(!conf)return reply(req,{error:"Integração disponível apenas no DarkCut Windows."},503);
 if(!auth(req,conf.key))return reply(req,{error:"Chave temporária incorreta."},401);
 const length=Number(req.headers.get("content-length")||0);
 if(length>230_000)return reply(req,{error:"Exportação muito grande."},413);
 let payload:Record<string,unknown>;
 try {payload=await req.json() as Record<string,unknown>}catch{return reply(req,{error:"JSON inválido."},400)}
 const saved=Array.isArray(payload.saved)?payload.saved.slice(0,150):[];
 const watched=Array.isArray(payload.watched)?payload.watched.slice(0,150):[];
 const mapped:ImportRow[]=[];
 for(const [list,entries] of [["saved",saved],["watched",watched]] as const){
  for(const raw of entries){
   const video=sanitizeMinerVideo(raw);
   if(video)mapped.push({...video,list});
  }
 }
 await mkdir(conf.directory,{recursive:true});
 const old=await records(conf.directory);
 const merged=new Map<string,ImportRow>();
 for(const row of [...old,...mapped])merged.set(row.list+":"+row.videoId,row);
 const output=Array.from(merged.values()).slice(-300);
 const target=file(conf.directory);
 const temp=target+"."+createHash("sha256").update(conf.key).digest("hex").slice(0,8)+".tmp";
 await writeFile(temp,JSON.stringify(output),{encoding:"utf8"});
 await rename(temp,target);
 return reply(req,{ok:true,received:mapped.length,total:output.length});
}
