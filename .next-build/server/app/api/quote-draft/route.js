(()=>{var e={};e.id=380,e.ids=[380],e.modules={10846:e=>{"use strict";e.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},44870:e=>{"use strict";e.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},3295:e=>{"use strict";e.exports=require("next/dist/server/app-render/after-task-async-storage.external.js")},29294:e=>{"use strict";e.exports=require("next/dist/server/app-render/work-async-storage.external.js")},63033:e=>{"use strict";e.exports=require("next/dist/server/app-render/work-unit-async-storage.external.js")},77598:e=>{"use strict";e.exports=require("node:crypto")},73024:e=>{"use strict";e.exports=require("node:fs")},76760:e=>{"use strict";e.exports=require("node:path")},30420:(e,t,r)=>{"use strict";r.r(t),r.d(t,{patchFetch:()=>y,routeModule:()=>u,serverHooks:()=>g,workAsyncStorage:()=>c,workUnitAsyncStorage:()=>m});var s={};r.r(s),r.d(s,{POST:()=>p});var a=r(42706),n=r(28203),i=r(45994),o=r(39187),d=r(2427),l=r(20118);async function p(e){let t=await (0,l.cl)(e,["sales_rep","sales_manager"]);if(!t.ok)return t.response;let r=await e.json(),s=String(r.customerName??"Customer"),a=r.lines??[],n=Number(r.total??0);return o.NextResponse.json({draft:(0,d.Bl)(s,a,n)})}let u=new a.AppRouteRouteModule({definition:{kind:n.RouteKind.APP_ROUTE,page:"/api/quote-draft/route",pathname:"/api/quote-draft",filename:"route",bundlePath:"app/api/quote-draft/route"},resolvedPagePath:"/Users/ericzhuang/Downloads/supplier engine with codex/supplier-engine-codex/src/app/api/quote-draft/route.ts",nextConfigOutput:"",userland:s}),{workAsyncStorage:c,workUnitAsyncStorage:m,serverHooks:g}=u;function y(){return(0,i.patchFetch)({workAsyncStorage:c,workUnitAsyncStorage:m})}},96487:()=>{},78335:()=>{},89076:(e,t,r)=>{"use strict";r.d(t,{M:()=>c,v:()=>u});var s=r(73024),a=r(76760),n=r.n(a),i=r(39986);let o=process.env.DATA_PATH?.trim()||(process.env.VERCEL?n().join("/tmp","app-data.json"):n().join(process.cwd(),"data","app-data.json")),d=[{id:"m1",name:"Atlas Steel Works",email:"sales@atlassteel.example",phone:"+1-713-555-0182",specialties:["Pipe","Tube","Fittings"],regions:["US","SEA"],leadTimeDays:18,preferred:!0},{id:"m2",name:"Northshore Metals",email:"rfq@northshoremetals.example",phone:"+1-312-555-0133",specialties:["Sheet","Plate","Coil"],regions:["US"],leadTimeDays:14,preferred:!0},{id:"m3",name:"Pacific Alloy Fabricators",email:"quotes@pacificalloy.example",specialties:["Bar","Angle","Channel","Specialty Alloys"],regions:["US","APAC"],leadTimeDays:24,preferred:!1}],l={inventory:[],surcharges:[],quotes:[],manufacturers:d,sourcingRequests:[],users:[{id:"u1",name:"Sam Rep",email:"sam.rep@stainless.local",passwordHash:(0,i.Er)("Password123!"),role:"sales_rep",companyId:"c1",companyName:"Stainless Logic Demo",onboarded:!0,createdAt:new Date().toISOString()},{id:"u2",name:"Ivy Inventory",email:"ivy.inventory@stainless.local",passwordHash:(0,i.Er)("Password123!"),role:"inventory_manager",companyId:"c1",companyName:"Stainless Logic Demo",onboarded:!0,createdAt:new Date().toISOString()},{id:"u3",name:"Mia Manager",email:"mia.manager@stainless.local",passwordHash:(0,i.Er)("Password123!"),role:"sales_manager",companyId:"c1",companyName:"Stainless Logic Demo",onboarded:!0,createdAt:new Date().toISOString()}],sessions:[],buyers:[],buyerMessages:[]},p=e=>{let t=(e.users??[]).map((e,t)=>{let r=e.name??`User ${t+1}`,s=(0,i.e0)(e.email??`${r.replace(/\s+/g,".")}@stainless.local`);return{id:e.id,name:r,email:s,passwordHash:e.passwordHash??(0,i.Er)("Password123!"),role:e.role,companyId:e.companyId,companyName:e.companyName??"Stainless Logic Demo",onboarded:e.onboarded??!0,createdAt:e.createdAt??new Date().toISOString()}});return{inventory:e.inventory??[],surcharges:e.surcharges??[],quotes:(e.quotes??[]).map(e=>({...e,createdByUserId:e.createdByUserId??t[0]?.id??"u1"})),manufacturers:e.manufacturers?.length?e.manufacturers:d,sourcingRequests:(e.sourcingRequests??[]).map(e=>({...e,createdByUserId:e.createdByUserId??t[0]?.id??"u1",status:e.status??"Open",sourceContext:e.sourceContext??"quote_shortage",reason:e.reason??"new_demand",createdAt:e.createdAt??new Date().toISOString(),updatedAt:e.updatedAt??new Date().toISOString()})),users:t,sessions:(e.sessions??[]).filter(e=>e?.token&&e?.userId&&e?.expiresAt),buyers:e.buyers??[],buyerMessages:e.buyerMessages??[]}},u=async()=>{try{let e=await s.promises.readFile(o,"utf8");return p(JSON.parse(e))}catch{return await s.promises.mkdir(n().dirname(o),{recursive:!0}),await s.promises.writeFile(o,JSON.stringify(l,null,2)),l}},c=async e=>{await s.promises.mkdir(n().dirname(o),{recursive:!0}),await s.promises.writeFile(o,JSON.stringify(e,null,2))}},2427:(e,t,r)=>{"use strict";r.d(t,{Bl:()=>n,HX:()=>i});let s=e=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2}).format(e),a=e=>({buyerName:e,subject:`Quotation for ${e}`,intro:`Thank you for the opportunity. Please find our quotation below for ${e}.`,validDays:7,eta:"Earliest available",incoterm:"FOB Origin",paymentTerms:"Net 30",freightTerms:"Packed for sea freight",notes:"",senderName:"Sales Team",senderTitle:"Inside Sales",companyName:"Stainless Logic"}),n=(e,t,r,n)=>{let i={...a(e),...n??{}},o=`Subject: ${i.subject}

To: ${i.buyerName}

${i.intro}

Item | Qty | Unit Price | Ext Price
-----|-----|------------|----------`,d=t.map(e=>`${e.description} | ${e.quantity} ${e.unit} | ${s(e.unitPrice)} | ${s(e.extendedPrice)}`).join("\n"),l=`ETA: ${i.eta}
Incoterm: ${i.incoterm}
Payment Terms: ${i.paymentTerms}
Freight: ${i.freightTerms}
Validity: ${i.validDays} days
Material subject to prior sale.`,p=i.notes?`

Notes:
${i.notes}`:"",u=`

Regards,
${i.senderName}
${i.senderTitle}
${i.companyName}`;return`${o}
${d}

Total: ${s(r)}

${l}${p}${u}`},i=(e,t,r,n)=>{let i={...a(e),...n??{}},o=t.map(e=>`
    <tr>
      <td style="border:1px solid #d0d7de;padding:8px;">${e.description}</td>
      <td style="border:1px solid #d0d7de;padding:8px;">${e.quantity} ${e.unit}</td>
      <td style="border:1px solid #d0d7de;padding:8px;">${s(e.unitPrice)}</td>
      <td style="border:1px solid #d0d7de;padding:8px;">${s(e.extendedPrice)}</td>
    </tr>
  `).join(""),d=i.notes?`<p><strong>Notes:</strong> ${i.notes}</p>`:"";return`
  <div style="font-family:Arial,sans-serif;color:#1f2937;">
    <p>Dear ${i.buyerName},</p>
    <p>${i.intro}</p>
    <table style="border-collapse:collapse;width:100%;font-size:13px;">
      <thead>
        <tr>
          <th style="border:1px solid #d0d7de;padding:8px;text-align:left;">Item</th>
          <th style="border:1px solid #d0d7de;padding:8px;text-align:left;">Qty</th>
          <th style="border:1px solid #d0d7de;padding:8px;text-align:left;">Unit Price</th>
          <th style="border:1px solid #d0d7de;padding:8px;text-align:left;">Extended</th>
        </tr>
      </thead>
      <tbody>${o}</tbody>
    </table>
    <p><strong>Total:</strong> ${s(r)}</p>
    <p><strong>ETA:</strong> ${i.eta}<br/>
    <strong>Incoterm:</strong> ${i.incoterm}<br/>
    <strong>Payment Terms:</strong> ${i.paymentTerms}<br/>
    <strong>Freight:</strong> ${i.freightTerms}<br/>
    <strong>Validity:</strong> ${i.validDays} days<br/>
    Material subject to prior sale.</p>
    ${d}
    <p>Regards,<br/>${i.senderName}<br/>${i.senderTitle}<br/>${i.companyName}</p>
  </div>`}},39986:(e,t,r)=>{"use strict";r.d(t,{BE:()=>n,Er:()=>a,e0:()=>i});var s=r(77598);let a=e=>(0,s.createHash)("sha256").update(e).digest("hex"),n=(e,t)=>{let r=a(e),n=Buffer.from(r,"hex"),i=Buffer.from(t,"hex");return n.length===i.length&&(0,s.timingSafeEqual)(n,i)},i=e=>e.trim().toLowerCase()},20118:(e,t,r)=>{"use strict";r.d(t,{$G:()=>g,C0:()=>y,JR:()=>p,cl:()=>u,jw:()=>c,lx:()=>m,mj:()=>x,vD:()=>l});var s=r(77598),a=r(39187),n=r(89076);let i="stainless_session",o=e=>{let t=(e.headers.get("cookie")??"").split(";").map(e=>e.trim()).filter(Boolean),r={};for(let e of t){let t=e.indexOf("=");t<=0||(r[e.slice(0,t)]=decodeURIComponent(e.slice(t+1)))}return r},d=async()=>{let e=await (0,n.v)(),t=Date.now(),r=e.sessions.length;return e.sessions=e.sessions.filter(e=>new Date(e.expiresAt).getTime()>t),e.sessions.length!==r&&await (0,n.M)(e),e},l=async e=>{let t=await d(),r=o(e)[i];if(!r)return null;let s=t.sessions.find(e=>e.token===r);return s?t.users.find(e=>e.id===s.userId)??null:null},p=async e=>{let t=await l(e);return t?{ok:!0,user:t}:{ok:!1,response:a.NextResponse.json({error:"Unauthorized"},{status:401})}},u=async(e,t)=>{let r=await p(e);return r.ok?t.includes(r.user.role)?r:{ok:!1,response:a.NextResponse.json({error:"Forbidden"},{status:403})}:r},c=async e=>{let t=await (0,n.v)(),r=(0,s.randomBytes)(24).toString("hex"),a=new Date,i=new Date(a.getTime()+12096e5).toISOString();return t.sessions.push({token:r,userId:e,createdAt:a.toISOString(),expiresAt:i}),await (0,n.M)(t),{token:r,expiresAt:i}},m=async e=>{let t=await (0,n.v)(),r=t.sessions.length;t.sessions=t.sessions.filter(t=>t.token!==e),r!==t.sessions.length&&await (0,n.M)(t)},g=(e,t,r)=>{e.cookies.set(i,t,{httpOnly:!0,sameSite:"lax",secure:!0,path:"/",expires:new Date(r)})},y=e=>{e.cookies.set(i,"",{httpOnly:!0,sameSite:"lax",secure:!0,path:"/",expires:new Date(0)})},x=e=>o(e)[i]??null}};var t=require("../../../webpack-runtime.js");t.C(e);var r=e=>t(t.s=e),s=t.X(0,[638,452],()=>r(30420));module.exports=s})();