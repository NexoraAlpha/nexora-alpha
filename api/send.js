const webpush=require('web-push');
const {env,supabaseUserFromRequest,supabaseRest}=require('./_supabase');

module.exports=async function(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
  try{
    const admin=await supabaseUserFromRequest(req);
    if(!admin?.id) return res.status(401).json({error:'Unauthorized'});
    const profiles=await supabaseRest(`profiles?id=eq.${encodeURIComponent(admin.id)}&select=role`);
    if(!profiles?.[0] || profiles[0].role!=='admin') return res.status(403).json({error:'Admin only'});

    const pub=env('VAPID_PUBLIC_KEY'), priv=env('VAPID_PRIVATE_KEY'), subject=env('VAPID_SUBJECT');
    if(!pub||!priv||!subject) return res.status(503).json({error:'VAPID env belum lengkap.'});
    webpush.setVapidDetails(subject,pub,priv);

    const title=String(req.body?.title||'Nexora Alpha').slice(0,120);
    const body=String(req.body?.body||'Ada informasi baru di Nexora Alpha.').slice(0,1000);
    const notificationId=req.body?.notificationId||null;
    const payload=JSON.stringify({title,body,data:{url:req.body?.url||'./#home',tag:notificationId?'notification-'+notificationId:('notification-'+Date.now()),notificationId,icon:'./nexora-icon-192.png'}});
    const rows=await supabaseRest('push_subscriptions?select=id,endpoint,p256dh,auth');
    let sent=0, failed=0, removed=0;
    await Promise.all((rows||[]).map(async row=>{
      try{
        await webpush.sendNotification({endpoint:row.endpoint,expirationTime:null,keys:{p256dh:row.p256dh,auth:row.auth}},payload,{TTL:300});
        sent++;
      }catch(e){
        failed++;
        if(e.statusCode===404 || e.statusCode===410){
          removed++;
          try{await supabaseRest(`push_subscriptions?id=eq.${encodeURIComponent(row.id)}`,{method:'DELETE'});}catch(_){}
        }
      }
    }));
    return res.status(200).json({ok:true,sent,failed,removed});
  }catch(e){ console.error('push send',e); return res.status(e.status||500).json({error:e.message||'Gagal mengirim push.'}); }
};
