from iso import *
g=SVG()
g.E('<defs><linearGradient id="pipe" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d6e6fc"/><stop offset=".5" stop-color="#f4f8ff"/><stop offset="1" stop-color="#d6e6fc"/></linearGradient>'
    '<filter id="sh" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#175CD3" flood-opacity=".18"/></filter></defs>')
X,W=1330,470; cx=X+W/2
# top: answers
g.plat(X,236,W,120,inset=34)
g.window(X+60,252,W-120,90)
g.rect(X+W-250,276,170,20,A,A,r=10)
g.rect(X+80,304,220,20,'#e4ecf9','#e4ecf9',r=10)
g.rect(X+80,330-2,150,8,'#d0d5dd','#d0d5dd',r=4)
g.text(cx,222,'ANSWERS',size=18,weight=600,fill='#344054',ls=3)
g.varrow(cx,452,378,w=26,hw=50,hl=16)
# middle: retina
g.plat(X,462,W,140,inset=38,d=14,fill='#f5f9ff',stroke='#5b9bf0',side='#dbe7fb')
nodes=[('Shipments',cx,532,'deep'),('Companies',X+110,500,'model'),('Ports',X+W-100,500,'model'),('Vessels',X+W-110,572,'model'),('Documents',X+120,572,'model')]
for n,x,y,k in nodes[1:]: g.E(f'<line x1="{cx}" y1="532" x2="{x}" y2="{y}" stroke="#9cc0f2" stroke-width="2.5"/>')
for n,x,y,k in nodes: g.pill(x,y,n,kind=k,size=15,w=122 if k!='deep' else 132,h=32)
g.text(cx,650,'RETINA',size=18,weight=600,fill=A,ls=3)
g.varrow(cx,722,664,w=26,hw=50,hl=16)
# bottom: inbox
g.plat(X,732,W,130,inset=34)
for k,x in enumerate([X+50,X+150]): g.envelope(x,770+k*8,82,54)
for k,(x,l,c) in enumerate([(X+260,'PDF',A),(X+320,'XLS','#12b76a'),(X+380,'DOC','#6172f3')]):
    g.doc(x,752+(k%2)*10,l,color=c,w=50,h=66)
g.text(cx,900,'YOUR INBOX',size=18,weight=600,fill='#344054',ls=3)
open(__file__.rsplit('/',1)[0]+'/s18.svg','w').write(wrap(g.out()))
