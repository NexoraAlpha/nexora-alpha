const {authUser,db,isAdmin}=require('./_supabase');

async function authorizedJob(req){
  const admin=await isAdmin(req).catch(()=>null);
  if(admin)return true;
  const configured=[process.env.NEWS_CRON_SECRET,process.env.CRON_SECRET].filter(Boolean);
  if(!configured.length)return false;
  const header=(req.headers['x-news-cron-secret']||'').trim();
  const auth=(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();
  return configured.some(s=>s===header||s===auth);
}

module.exports={authUser,db,isAdmin,authorizedJob};
