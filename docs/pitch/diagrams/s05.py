from iso import *
g=SVG(); g.defs()
cols=[(128,608),(720,1200),(1312,1792)]
scope=['every email','comparison requests only','everything read']
titles=['Classification','Comparison &amp; Extraction','Ontology Extraction']
lines=[['Reads each email and sorts it','into one of five categories.'],
       ['Extracts seven fields from the SI','and draft BL, then compares them.'],
       ['Turns unstructured mail into','structured, linked records.']]
PY,PH=330,400
for i,((a,b),sc,t,ln) in enumerate(zip(cols,scope,titles,lines)):
    cx=(a+b)/2
    g.chip(cx,282,sc,dark=True,size=15)
    last=i==2
    g.plat(a,PY,b-a,PH,inset=34,d=14,fill='#f5f9ff' if last else '#fff',stroke='#5b9bf0' if last else '#b9c6d8',side='#dbe7fb' if last else '#e8eef7')
    g.E(f'<circle cx="{a+80}" cy="{PY+50}" r="22" fill="{A}"/>'); g.text(a+80,PY+58,str(i+1),size=22,weight=600,fill='#fff')
    g.text(a+114,PY+59,t,size=27,weight=600,anchor='start')
    g.text(cx,PY+PH-64,ln[0],size=19,fill='#475467'); g.text(cx,PY+PH-38,ln[1],size=19,fill='#475467')
# step 1 visual: envelope -> categories
a,b=cols[0]; cx=(a+b)/2
g.envelope(a+60,PY+130,96,64)
g.E(f'<path d="M{a+166} {PY+162} H{a+206}" stroke="#98a2b3" stroke-width="2.5"/><path d="M{a+200} {PY+155} L{a+208} {PY+162} L{a+200} {PY+169}" fill="none" stroke="#98a2b3" stroke-width="2.5"/>')
for k,c in enumerate(['BL_COMPARISON','SI_REQUEST','INVOICE_QUERY','GENERAL','SPAM']):
    y=PY+100+k*34; w=190
    if k==0: g.rect(a+222,y,w,26,A,A,r=13); col='#fff'
    else: g.rect(a+222,y,w,26,'#fff','#d0d5dd',r=13); col='#475467'
    g.text(a+222+w/2,y+18,c,size=13,fill=col,font='JetBrains Mono')
# step 2 visual: SI vs BL fields
a,b=cols[1]; x0=a+70
for j,(lab,c) in enumerate([('SI','#344054'),('BL','#344054')]):
    x=x0+j*190
    g.rect(x,PY+100,150,190,'#fff','#98a2b3',r=6)
    g.rect(x,PY+100,150,28,'#eaecf0','#98a2b3',r=6); g.text(x+75,PY+120,lab,size=15,weight=600,font='JetBrains Mono')
    for r in range(7):
        g.E(f'<rect x="{x+14}" y="{PY+140+r*21}" width="{110-(r%3)*18}" height="8" rx="4" fill="{"#fec84b" if r==2 and j==1 else "#d0d5dd"}"/>')
mx=x0+170
for r in range(7):
    y=PY+144+r*21
    if r==2: g.text(mx,y+5,'&#8800;',size=18,weight=600,fill='#dc6803')
    else: g.E(f'<path d="M{mx-5} {y} l3 4 l7 -8" fill="none" stroke="#12b76a" stroke-width="2.2" stroke-linecap="round"/>')
# step 3 visual: small graph
a,b=cols[2]; cx=(a+b)/2
nodes={'Shipment':(cx,PY+190),'Company':(cx-120,PY+120),'Port':(cx+120,PY+120),'Vessel':(cx+120,PY+262),'Email':(cx-120,PY+262)}
for n,(x,y) in nodes.items():
    if n!='Shipment': g.E(f'<line x1="{cx}" y1="{PY+190}" x2="{x}" y2="{y}" stroke="#9cc0f2" stroke-width="2.5"/>')
for n,(x,y) in nodes.items():
    g.pill(x,y,n,kind='deep' if n=='Shipment' else 'model',size=16,w=120 if n!='Shipment' else 130,h=34)
# arrows between steps
for x1,x2 in [(612,716),(1204,1308)]:
    g.harrow(PY+PH/2,x1,x2,w=30,hw=58,hl=20)
# outputs
outs=[['category'],['OK','MISMATCH','NEEDS_REVIEW'],['knowledge layer']]
for i,((a,b),o) in enumerate(zip(cols,outs)):
    cx=(a+b)/2
    g.varrow(cx,PY+PH+18,PY+PH+64,w=22,hw=44,hl=14)
    if len(o)==1:
        g.pill(cx,PY+PH+94,o[0],kind='deep' if i==2 else 'code',size=17,w=200 if i==2 else 150,h=36)
    else:
        for k,(t,w) in enumerate(zip(o,[70,120,160])):
            x=cx-190+[35,145,305][k]
            col={'OK':'#12b76a','MISMATCH':'#dc6803','NEEDS_REVIEW':'#7a5af8'}[t]
            g.rect(x-w/2,PY+PH+76,w,36,'#fff',col,r=18,sw=1.6); g.text(x,PY+PH+100,t,size=15,fill=col,font='JetBrains Mono',weight=500)
g.text(128,PY+PH+180,'The result of every step is stored, and every value keeps the line it was read from.',size=21,fill='#667085',anchor='start')
open(__file__.rsplit('/',1)[0]+'/s05.svg','w').write(wrap(g.out()))
