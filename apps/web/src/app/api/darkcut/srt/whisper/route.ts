import { NextResponse } from "next/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const ACCEPT=new Set(["whisper-large-v3","whisper-large-v3-turbo"]);
export async function POST(req:Request){
 let form:FormData;
 try{form=await req.formData();}catch{return NextResponse.json({error:"Envie um arquivo de áudio."},{status:400});}
 const file=form.get("audio"),apiKey=String(form.get("apiKey")||"").trim();
 const model=String(form.get("model")||"whisper-large-v3-turbo");
 if(!(file instanceof File)||!file.size)return NextResponse.json({error:"Selecione uma narração."},{status:400});
 if(file.size>24*1024*1024)return NextResponse.json({error:"Arquivo maior que 24 MB. Use o separador externo V2.4 para compactar/dividir com FFmpeg, ou envie MP3 comprimido."},{status:413});
 if(!ACCEPT.has(model))return NextResponse.json({error:"Modelo Whisper desconhecido."},{status:400});
 if(!apiKey.startsWith("gsk_")||apiKey.length>512)return NextResponse.json({error:"Cole uma chave Groq válida para a sessão. Ela não é salva pelo DarkCut."},{status:400});
 const extension=file.name.toLowerCase().split(".").at(-1);
 if(!extension||!["mp3","wav","m4a","ogg","flac","webm","mp4"].includes(extension))return NextResponse.json({error:"Formato de áudio não suportado."},{status:415});
 const outgoing=new FormData();
 outgoing.set("file",file,file.name);
 outgoing.set("model",model);
 outgoing.set("response_format","verbose_json");
 outgoing.set("language","pt");
 outgoing.set("timestamp_granularities[]","word");
 let response:Response;
 try{
  response=await fetch("https://api.groq.com/openai/v1/audio/transcriptions",{
   method:"POST",headers:{Authorization:`Bearer ${apiKey}`},body:outgoing,
   signal:AbortSignal.timeout(240000),cache:"no-store",
  });
 }catch{return NextResponse.json({error:"Não foi possível alcançar a Groq. Confira internet e tente novamente."},{status:502});}
 if(!response.ok){
  const error=await response.json().catch(()=>({})) as {error?:{message?:string}};
  const code=response.status;
  const explanation=code===403?"A Groq negou acesso à transcrição. Confira as permissões do modelo na sua organização/projeto.":code===401
   ?"A chave Groq foi recusada.":code===429?"Limite de requisições ou cota da Groq atingido.":code===413
   ?"O áudio excede o limite de tamanho aceito pela Groq.":(error.error?.message??`Groq HTTP ${code}`).slice(0,220);
  return NextResponse.json({error:explanation,status:code},{status:code>=500?502:code});
 }
 const result=await response.json() as {text?:string;words?:Array<{word?:string;start?:number;end?:number}>};
 const words=Array.isArray(result.words)?result.words.map(w=>({
   word:String(w.word??"").slice(0,130),start:Number(w.start),end:Number(w.end)
 })).filter(w=>Number.isFinite(w.start)&&Number.isFinite(w.end)&&w.end>=w.start).slice(0,25000):[];
 if(!words.length)return NextResponse.json({error:"A Groq não devolveu palavras com horários. Tente outro modelo ou áudio com fala mais clara."},{status:502});
 return NextResponse.json({text:String(result.text??"").slice(0,150000),words,model},{headers:{"Cache-Control":"no-store"}});
}
