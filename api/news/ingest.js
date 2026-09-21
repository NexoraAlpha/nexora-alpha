const {json,cors,db,isAdmin}=require('./_supabase');
const {classify}=require('./classify');
function fingerprint(a){return require('crypto').createHash('sha256').update((a.title||'').toLowerCase().replace(/\s+/g,' ').trim()+'|'+(a.url||'')).digest('hex');}
async function fetchNews(){
  const key=process.env.NEWS_API_KEY||'';
  if(!key) throw new Error('NEWS_API_KEY belum diisi');
  const q=process.env.NEWS_QUERY||'Federal Reserve OR FOMC OR CPI OR inflation OR NFP OR ECB OR BOE OR BOJ OR gold OR bitcoin';
  const u='https://newsapi.org/v2/everything?'+new URLSearchParams({q,language:'en',sortBy:'publishedAt',pageSize:'50'});
  const r=await fetch(u,{headers:{'X-Api-Key':key}}); const d=await r.json();
  if(!r.ok||d.status!=='ok')throw new Error(d.message||'News provider error');
  return d.articles||[];
}
module.exports=async function handler(req,res){
  cors(res); if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
  const cronSecret=process.env.NEWS_CRON_SECRET||''; const cron=req.headers['x-news-cron-secret'];
  const admin=await isAdmin(req).catch(()=>null); if(!admin && (!cronSecret || cron!==cronSecret))return json(res,401,{error:'Unauthorized'});
  try{
    const articles=await fetchNews(); let inserted=0,high=0,breaking=0;
    for(const a of articles){if(!a?.title||!a?.url||a.title==='[Removed]')continue; const c=classify(a.title,a.description||''); const row={fingerprint:fingerprint(a),title:a.title,description:a.description||'',source_name:a.source?.name||'Unknown',source_url:a.url,published_at:a.publishedAt||new Date().toISOString(),category:c.importance,instruments:c.instruments,score:c.score,raw_source:'newsapi'};
      try{await db('news_articles',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify(row)});inserted++;if(c.importance==='high')high++;if(c.importance==='breaking')breaking++;}catch(e){if(!/duplicate|unique/i.test(e.message))throw e;}
    }
    return json(res,200,{ok:true,fetched:articles.length,inserted,high,breaking});
  }catch(e){return json(res,500,{ok:false,error:e.message||'News ingest failed'});}
};
