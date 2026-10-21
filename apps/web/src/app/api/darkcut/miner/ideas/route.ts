import { NextResponse } from "next/server";
import { buildNicheSkillPrompt, NICHE_MARKETS, rankMinerOpportunities, sanitizeMinerVideo } from "@/darkcut/niche-miner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BODY = 240_000;
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const size = Number(request.headers.get("content-length") || "0");
  if (size > MAX_BODY) return json({ error: "Dados demais para análise." }, 413);
  let data: Record<string, unknown>;
  try { data = await request.json() as Record<string, unknown>; }
  catch { return json({ error: "Dados inválidos." }, 400); }
  const subject = typeof data.subject === "string" ? data.subject.trim().slice(0,200) : "";
  const market = NICHE_MARKETS.find(x=>x.language===data.language) ?? NICHE_MARKETS[0];
  const list = Array.isArray(data.videos) ? data.videos.slice(0,100).map(sanitizeMinerVideo).filter(x=>x!==null) : [];
  const evidence = rankMinerOpportunities(list);
  if (!subject) return json({ error: "Escolha um tema ou oportunidade antes de analisar." }, 400);
  const apiKey = typeof data.geminiApiKey === "string" ? data.geminiApiKey.trim() : "";
  if (!apiKey) return json({ error: "Cadastre sua chave Gemini na configuração de IA do DarkCut. A análise local continua disponível sem chave." }, 400);
  if (apiKey.length > 512) return json({ error: "Chave inválida." }, 400);
  const prompt = buildNicheSkillPrompt({
    title: typeof data.titlePattern === "string" ? data.titlePattern : "POV / Como / Por que",
    subject, market, candidates:evidence.slice(0,8),
    format: typeof data.format === "string" ? data.format : "POV",
  });
  let response: Response;
  try {
    response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent", {
      method:"POST", headers: { "x-goog-api-key":apiKey, "Content-Type":"application/json" },
      body: JSON.stringify({
        contents: [{ role:"user", parts:[{text:prompt}] }],
        generationConfig: { responseMimeType:"application/json", temperature:0.8, maxOutputTokens:2600 },
      }),
      signal:AbortSignal.timeout(65_000), cache:"no-store",
    });
  } catch {
    return json({ error:"Não foi possível conectar à API Gemini; verifique internet e disponibilidade." }, 502);
  }
  if (!response.ok) {
    const upstream = await response.json().catch(()=>({})) as {error?:{message?:string}};
    const code = response.status;
    const detail = code===429?"Limite ou cota da sua conta Gemini atingido.":code===403||code===401
      ?"Chave Gemini recusada ou modelo não autorizado.":code===404
      ?"Modelo Gemini indisponível nesta conta.":(upstream.error?.message||`Gemini HTTP ${code}`).slice(0,230);
    return json({error:detail,status:code}, [400,401,403,404,429].includes(code)?code:502);
  }
  const body = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const raw = body.candidates?.[0]?.content?.parts?.map(x=>x.text??"").join("")??"";
  let result:Record<string,unknown>;
  try { result = JSON.parse(raw.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g,"")); }
  catch { return json({error:"O Gemini não retornou um JSON válido; tente novamente."},502); }
  if (!result || typeof result!=="object" || !Array.isArray(result.titles) || !Array.isArray(result.nicheDoubles)) {
    return json({error:"A resposta da IA veio incompleta. Tente novamente."},502);
  }
  return json({
    result:{
      summary:String(result.summary??"").slice(0,900),
      titles:result.titles.slice(0,12).map((x:unknown)=>({
        title:String((x as Record<string,unknown>)?.title??"").slice(0,200),
        angle:String((x as Record<string,unknown>)?.angle??"").slice(0,240),
        hook:String((x as Record<string,unknown>)?.hook??"").slice(0,240),
        risk:String((x as Record<string,unknown>)?.risk??"").slice(0,240),
      })).filter((x:{title:string})=>x.title),
      nicheDoubles:result.nicheDoubles.slice(0,6),
      searchQueries:Array.isArray(result.searchQueries)?result.searchQueries.slice(0,10):[],
      culturalChecks:Array.isArray(result.culturalChecks)?result.culturalChecks.slice(0,8):[],
      confidenceNotes:Array.isArray(result.confidenceNotes)?result.confidenceNotes.slice(0,8):[],
    },
    market:market.label, evidenceCount:evidence.length,
    disclaimer:"Ideias editoriais geradas pela IA com base nas evidências fornecidas; verifique a cultura e a demanda local antes de publicar.",
  });
}
