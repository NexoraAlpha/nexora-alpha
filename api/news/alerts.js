const {json,cors,db,isAdmin}=require('./_supabase');
const webpush=require('web-push');
function eligible(row){return row.category==='high'||row.category==='breaking';}
module.exports=async function handler(req,res){
  cors(res); if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
  const cronSecret=process.env.NEWS_CRON_SECRET||''; const cron=req.headers['x-news-cron-secret'];
  const admin=await isAdmin(req).catch(()=>null); if(!admin && (!cronSecret || cron!==cronSecret))return json(res,401,{error:'Unauthorized'});
  try{
    const rows=await db('news_articles?category=in.(high,breaking)&alert_sent=eq.false&select=*&&order=published_at.desc&limit=20');
    webpush.setVapidDetails(process.env.VAPID_SUBJECT,process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);
    const subs=await db('push_subscriptions?select=endpoint,p256dh,auth,expiration_time'); let sent=0,failed=0,processed=0;
    for(const n of rows||[]){
      if(!eligible(n))continue; processed++;
      const title=n.category==='breaking'?'🚨 NEXORA BREAKING':'🔴 NEXORA MARKET ALERT';
      const body=(n.title||'Important market news').slice(0,180);
      const payload=JSON.stringify({title,body,url:'/?section=news&alert='+encodeURIComponent(n.id||''),tag:'nexora-news-'+n.id,importance:n.category});
      for(const s of subs||[]){try{await webpush.sendNotification({endpoint:s.endpoint,keys:{p256dh:s.p256dh,auth:s.auth},expirationTime:s.expiration_time||null},payload,{TTL:86400,urgency:'high'});sent++;}catch(e){failed++;if(e.statusCode===404||e.statusCode===410){try{await db('push_subscriptions?endpoint=eq.'+encodeURIComponent(s.endpoint),{method:'DELETE'})}catch{}}}}
      await db('news_articles?id=eq.'+encodeURIComponent(n.id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({alert_sent:true,alert_sent_at:new Date().toISOString(),alert_sent_count:sent})});
    }
    return json(res,200,{ok:true,processed,sent,failed});
  }catch(e){return json(res,500,{ok:false,error:e.message||'Alert dispatch failed'});}
};
