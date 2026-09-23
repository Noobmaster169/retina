from iso import *
g=SVG(); g.defs()
INK='#101828'
BRAND={'nextdotjs':INK,'react':'#149ECA','swr':INK,'tailwindcss':'#06B6D4','vercel':INK,'typescript':'#3178C6',
       'redis':'#FF4438','express':INK,'python':'#3776AB','fastapi':'#009688','minio':'#C72E49',
       'postgresql':'#4169E1','docker':'#2496ED','claude':'#D97757','nodedotjs':'#5FA04E'}
def logos(slugs,right,y,size=28,gap=12,fill=None):
    for k,sl in enumerate(reversed(slugs)):
        logo(g,sl,right-size-k*(size+gap),y,size,fill or BRAND[sl])
def lpill(x,y,t,sl,h=34):
    w=62+len(t)*8.6
    g.rect(x,y-h/2,w,h,'#fff','#98a2b3',r=h/2,sw=1.4)
    logo(g,sl,x+14,y-9,18,BRAND[sl])
    g.text(x+42,y+6,t,size=16,weight=500,anchor='start')
    return w
def card(x,y,w,h,title,sub,kind='code',icons=()):
    if kind=='model': g.rect(x,y,w,h,'#eef4fd','#b2ccf5',r=8,sw=1.4); tc,sc='#101828',A
    elif kind=='deep': g.rect(x,y,w,h,A,A,r=8,extra='filter="url(#sh)"'); tc,sc='#fff','#dbe7fb'
    else: g.rect(x,y,w,h,'#fff','#98a2b3',r=8,sw=1.2); tc,sc='#101828','#475467'
    g.text(x+20,y+34,title,size=23,weight=600,fill=tc,anchor='start')
    g.text(x+20,y+62,sub,size=17,fill=sc,anchor='start')
    if kind=='deep': logos(list(icons),x+w-24,y+(h-44)/2,size=44,fill='#fff')
    else: logos(list(icons),x+w-18,y+14)
# people and frontend
g.people_strip(900,214,820,'THE TEAM',h=44)
g.varrow(1310,266,296,w=22,hw=44,hl=14)
g.plat(900,300,820,96,inset=24,stroke='#b9c6d8')
logo(g,'vercel',940,322,18,INK)
g.text(968,336,'FRONTEND · VERCEL',size=18,weight=600,fill='#344054',anchor='start',ls=2)
px=940
for t,sl in [('Next.js 16','nextdotjs'),('React','react'),('SWR','swr'),('Tailwind','tailwindcss')]:
    px+=lpill(px,370,t,sl)+14
g.text(1680,340,'cases · ontology browser · Ask Retina chat',size=16,fill='#667085',anchor='end')
# server
g.plat(520,470,1272,430,inset=44,d=14,fill='#f5f9ff',stroke='#5b9bf0',side='#dbe7fb')
logo(g,'docker',600,493,24,BRAND['docker'])
g.text(634,510,'VPS · DOCKER COMPOSE',size=18,weight=600,fill='#344054',anchor='start',ls=2)
g.varrow(1545,406,540,both=True)
g.chip(1545,470,'HTTPS · ngrok')
xs=[600,990,1380]; W=330
card(xs[0],540,W,84,'Worker','classify · compare · ontology','model',('nodedotjs','typescript'))
card(xs[1],540,W,84,'Queues','BullMQ on Redis',icons=('redis',))
card(xs[2],540,W,84,'API','Express · TypeScript · zod',icons=('express','typescript'))
for x1,x2 in [(xs[2],xs[1]+W),(xs[1],xs[0]+W)]:
    g.E(f'<path d="M{x1-4} 582 H{x2+10}" stroke="#98a2b3" stroke-width="2.5"/><path d="M{x2+16} 575 L{x2+6} 582 L{x2+16} 589" fill="none" stroke="#98a2b3" stroke-width="2.5"/>')
card(xs[0],660,W,84,'LLM proxy','Python · claude CLI','model',('python','claude'))
card(xs[1],660,W,84,'doc-extract','Python · FastAPI · PyMuPDF · OCR',icons=('fastapi',))
card(xs[2],660,W,84,'MinIO','original files, unchanged',icons=('minio',))
# worker bus to row2
g.E(f'<path d="M{xs[0]+W/2} 624 V642 H{xs[2]+W/2} V660 M{xs[1]+W/2} 642 V660 M{xs[0]+W/2} 642 V660" stroke="#98a2b3" stroke-width="2.5" fill="none"/>')
card(600,780,1110,92,'Ontology · PostgreSQL','emails, documents, checks, shipments, companies, ports, vessels','deep',('postgresql',))
# worker writes / api reads
g.E(f'<path d="M{xs[0]-18} 582 H586 M586 582 V826 H596" stroke="#98a2b3" stroke-width="2.5" fill="none"/>')
g.E(f'<path d="M{xs[2]+W} 582 H1728 V826 H1714" stroke="#98a2b3" stroke-width="2.5" fill="none"/>')
g.E('<path d="M1720 819 L1712 826 L1720 833" fill="none" stroke="#98a2b3" stroke-width="2.5"/><path d="M588 819 L598 826 L588 833" fill="none" stroke="#98a2b3" stroke-width="2.5"/>')
# left: inbox and claude
g.plat(128,520,300,110,inset=24)
g.text(278,512,'COMPANY INBOX',size=18,weight=600,fill='#344054',ls=2)
g.envelope(160,550,70,48); g.doc(248,536,'PDF',w=48,h=62); g.doc(306,544,'XLS',color='#12b76a',w=48,h=62); g.doc(364,552,'DOC',color='#6172f3',w=48,h=62) if False else None
g.harrow(582,440,560)
g.plat(128,672,300,110,inset=24,stroke='#5b9bf0',side='#dbe7fb')
logo(g,'claude',210,645,24,BRAND['claude'])
g.text(290,664,'CLAUDE',size=18,weight=600,fill='#344054',ls=2)
g.pill(278,727,'Sonnet · Opus',kind='model',size=19,w=200)
g.harrow(727,440,560,both=True)
# legend
g.rect(128,960-14,44,28,'#eef4fd','#b2ccf5',r=8); g.text(184,966,'where a model reads',size=19,fill='#344054',anchor='start')
g.rect(420,946,44,28,'#fff','#98a2b3',r=8); g.text(476,966,'code and infrastructure',size=19,fill='#344054',anchor='start')
g.text(760,966,'Only the API leaves the server. Every external system sits behind one interface.',size=19,fill='#667085',anchor='start')
open(__file__.rsplit('/',1)[0]+'/s06.svg','w').write(wrap(g.out()))
