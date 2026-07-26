import { decodeXml,dedupeProviderArticles,domainFromUrl,extractAttr,extractTag,fetchWithTimeout,googleWhen,normalizeWindow,toGdeltDate } from "./common.js";
const QUERIES=[
{id:"expansion",query:"manufacturing OR factory OR plant OR production capacity OR industrial investment"},
{id:"procurement",query:"procurement OR strategic sourcing OR supplier development OR commodity manager"},
{id:"product",query:"manufacturing product launch OR starts production OR production program"},
{id:"supply",query:"manufacturing supply chain OR supplier shortage OR dual sourcing OR supplier qualification"},
{id:"expansion",query:"automotive supplier investment OR electronics manufacturing expansion"},
{id:"procurement",query:"industrial supplier sourcing OR local sourcing manufacturing"}
];
export const googleNewsProvider={id:"google-news",async collect({window}){
 const normalizedWindow=normalizeWindow(window); const timeoutMs=30000;
 const settled=await Promise.allSettled(QUERIES.map(group=>fetchGroup(group,normalizedWindow,timeoutMs)));
 const articles=[],errors=[]; for(const result of settled){if(result.status==="fulfilled")articles.push(...result.value);else errors.push(String(result.reason?.message||result.reason));}
 return {provider:"google-news",articles:dedupeProviderArticles(articles).slice(0,240),partial:errors.length>0,errors};
}};
async function fetchGroup(group,window,timeoutMs){
 const endpoint=new URL("https://news.google.com/rss/search"); endpoint.searchParams.set("q",`${group.query} when:${googleWhen(window)}`); endpoint.searchParams.set("hl","en-US"); endpoint.searchParams.set("gl","US"); endpoint.searchParams.set("ceid","US:en");
 const response=await fetchWithTimeout(endpoint.toString(),{headers:{accept:"application/rss+xml, application/xml, text/xml","user-agent":"Radaryum/5.4 (+https://radaryum.com)"},cf:{cacheTtl:120,cacheEverything:true}},timeoutMs);
 const xml=await response.text(); if(!response.ok)throw new Error(`Google News ${group.id} HTTP ${response.status}`);
 const items=xml.match(/<item>[\s\S]*?<\/item>/g)||[];
 return items.map(item=>{const rawTitle=decodeXml(extractTag(item,"title"));const link=decodeXml(extractTag(item,"link"));const pubDate=decodeXml(extractTag(item,"pubDate"));const sourceName=decodeXml(extractTag(item,"source"));const sourceUrl=decodeXml(extractAttr(item,"source","url"));const published=new Date(pubDate);if(!rawTitle||!link)return null;return {title:rawTitle.replace(/\s+-\s+[^-]{2,80}$/," ").trim(),url:link,domain:domainFromUrl(sourceUrl||link)||sourceName||"news.google.com",seendate:toGdeltDate(Number.isNaN(published.getTime())?new Date():published),requestedSignal:group.id,provider:"Google News RSS",language:"English",sourcecountry:"United States"};}).filter(Boolean);
}
