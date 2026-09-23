from iso import *
g=SVG(); g.defs()
# questions from the team
qs=[(1150,250,'Who ships to Conakry?'),(1470,300,'Which draft BL is wrong?'),(1230,390,'Is the weight filled in?')]
for x,y,t in qs:
    w=len(t)*20*0.56+44
    g.rect(x-w/2,y-26,w,52,'#fff','#b2ccf5',r=26,sw=1.4,extra='filter="url(#sh)"')
    g.text(x,y+7,t,size=20,weight=500,fill='#101828')
# people
for k,x in enumerate([1080,1116,1152]): g.person(x,470,A if k==1 else '#84adec')
for k,x in enumerate([1600,1636,1672]): g.person(x,470,A if k==1 else '#84adec')
# dashed attempts that stop at a barrier
for x in [1200,1380,1560]:
    g.E(f'<path d="M{x} 500 V548" stroke="#98a2b3" stroke-width="2.5" stroke-dasharray="6 6"/>')
    g.E(f'<circle cx="{x}" cy="566" r="16" fill="#fff" stroke="#d92d20" stroke-width="2"/><path d="M{x-6} {560} L{x+6} {572} M{x+6} {560} L{x-6} {572}" stroke="#d92d20" stroke-width="2.4" stroke-linecap="round"/>')
g.E('<line x1="1030" y1="600" x2="1790" y2="600" stroke="#d0d5dd" stroke-width="2" stroke-dasharray="10 8"/>')
g.text(1790,628,'no tool to read it',size=18,weight=600,fill='#98a2b3',anchor='end',font='JetBrains Mono')
# pile of documents over the inbox
docs=[(1090,690,'PDF',A,-8),(1180,660,'XLS','#12b76a',6),(1290,700,'SCAN','#667085',-4),(1400,662,'DOC','#6172f3',8),(1500,700,'TXT','#344054',-6),(1610,672,'PDF',A,5)]
g.plat(1030,800,760,140,inset=40,d=14,fill='#fff',stroke='#5b9bf0',side='#dbe7fb')
for x,y,l,c,r in docs:
    g.E(f'<g transform="rotate({r} {x+32} {y+40})">'); g.doc(x,y,l,color=c); g.E('</g>')
for k,(x,y) in enumerate([(1120,832),(1260,846),(1400,830),(1540,848)]):
    g.envelope(x,y,92,60)
g.text(1410,975,'COMPANY INBOX',size=20,weight=600,fill='#344054',ls=3)
open(__file__.rsplit('/',1)[0]+'/s03.svg','w').write(wrap(g.out()))
