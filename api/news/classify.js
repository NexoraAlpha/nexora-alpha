const RULES=[
  {importance:'breaking',score:100,words:['breaking','emergency','surprise rate','unexpected rate','market halted','bank failure','default']},
  {importance:'high',score:80,words:['fomc','federal reserve','interest rate','rate decision','fed decision','cpi','inflation','nonfarm payroll','nfp','jobs report','unemployment rate','ecb','boe','bank of japan','boj','central bank','powell','lagarde','tariff','sanctions','recession','gdp']},
  {importance:'medium',score:45,words:['pmi','retail sales','ppi','consumer confidence','manufacturing','services','housing','earnings','oil','crude','bitcoin','ethereum','etf']}
];
function classify(title,description=''){
  const text=(title+' '+description).toLowerCase(); let best={importance:'low',score:10,tags:[]};
  for(const r of RULES){const hits=r.words.filter(w=>text.includes(w)); if(hits.length){const score=r.score+Math.min(15,hits.length*5); if(score>best.score)best={importance:r.importance,score,tags:hits};}}
  const instruments=[];
  const map=[['xauusd',['gold','xau','bullion']],['usd',['fed','federal reserve','powell','inflation','cpi','nfp']],['dxy',['dollar','usd','greenback']],['eurusd',['ecb','euro','eur']],['usdjpy',['boj','japan','yen']],['gbpusd',['boe','britain','uk pound']],['btcusd',['bitcoin','btc']],['ethusd',['ethereum','eth']]];
  for(const [sym,words] of map) if(words.some(w=>text.includes(w))) instruments.push(sym);
  return {...best,instruments:[...new Set(instruments)]};
}
module.exports={classify};
