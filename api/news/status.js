const {json,cors,authorizedJob,db}=require('./_auth');
module.exports=async function handler(req,res){
  cors(res); if(req.method==='OPTIONS')return res.status(204).end(); if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});
  if(!(await authorizedJob(req)))return json(res,401,{error:'Unauthorized'});
  try{const rows=await db('news_articles?select=id,title,source_name,published_at,category,instruments,score,alert_sent,alert_sent_at&order=published_at.desc&limit=30'); return json(res,200,{ok:true,provider:process.env.NEWS_API_KEY?'NewsAPI':'not-configured',items:rows||[]});}catch(e){return json(res,500,{ok:false,error:e.message});}
};
