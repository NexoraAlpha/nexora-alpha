const webpush=require('web-push');
const {json,cors,env,supabaseAuthUser,db,bearer}=require('./_supabase');

module.exports=async function handler(req,res){
  cors(res);
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='POST')return json(res,405,{error:'Method not allowed'});
  try{
    const token=bearer(req);if(!token)return json(res,401,{error:'Authorization diperlukan.'});
    const user=await supabaseAuthUser(token);
    const profiles=await db(`profiles?id=eq.${encodeURIComponent(user.id)}&select=id,role&limit=1`);
    if(!profiles?.[0]||profiles[0].role!=='admin')return json(res,403,{error:'Hanya admin yang dapat mengirim push.'});

    const publicKey=env('VAPID_PUBLIC_KEY');
    const privateKey=env('VAPID_PRIVATE_KEY');
    const subject=env('VAPID_SUBJECT');
    webpush.setVapidDetails(subject,publicKey,privateKey);

    const title=String(req.body?.title||'Nexora Alpha').slice(0,120);
    const body=String(req.body?.body||'Ada informasi baru di Nexora Alpha.').slice(0,1000);
    const url=String(req.body?.url||'./#home');
    const notificationId=req.body?.notificationId?String(req.body.notificationId):null;
    const rows=await db('push_subscriptions?select=id,user_id,endpoint,p256dh,auth,expiration_time');

    let sent=0,failed=0,removed=0;
    const payload=JSON.stringify({title,body,data:{url,notificationId,tag:notificationId?`nexora-${notificationId}`:`nexora-${Date.now()}`}});
    for(const row of (rows||[])){
      const subscription={endpoint:row.endpoint,keys:{p256dh:row.p256dh,auth:row.auth}};
      try{
        await webpush.sendNotification(subscription,payload,{TTL:86400,urgency:'high'});
        sent++;
      }catch(e){
        failed++;
        if(e?.statusCode===404||e?.statusCode===410){
          try{await db(`push_subscriptions?id=eq.${encodeURIComponent(row.id)}`,{method:'DELETE',prefer:'return=minimal'});removed++;}catch(_){}
        }
      }
    }
    return json(res,200,{ok:true,sent,failed,removed,total:(rows||[]).length});
  }catch(e){return json(res,e.status||500,{error:e.message||'Gagal mengirim push notification.'});}
};
