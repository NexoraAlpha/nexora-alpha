const {json,cors,db}=require('./_supabase');

module.exports=async function handler(req,res){
  cors(res);
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});
  try{
    const u=new URL(req.url,'http://localhost');
    const category=(u.searchParams.get('category')||'all').toLowerCase();
    const limit=Math.min(Math.max(Number(u.searchParams.get('limit')||30),1),60);
    const page=Number(u.searchParams.get('page')||1);
    const offset=Math.max(0,page-1)*limit;
    let path=`news_articles?select=id,title,description,source_name,source_url,image_url,published_at,category,instruments,score&order=published_at.desc&offset=${offset}&limit=${limit}`;
    if(['breaking','high','medium','low'].includes(category))path=`news_articles?category=eq.${encodeURIComponent(category)}&select=id,title,description,source_name,source_url,image_url,published_at,category,instruments,score&order=published_at.desc&offset=${offset}&limit=${limit}`;
    const rows=await db(path,{headers:{Prefer:'count=exact'}});
    return json(res,200,{ok:true,items:rows||[],page,limit,category});
  }catch(e){return json(res,500,{ok:false,error:e.message||'News feed failed'});}
};
