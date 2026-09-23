from iso import *
g=SVG(); g.defs()
# chart panel
PX,PY,PW,PH=128,262,1080,640
g.rect(PX,PY,PW,PH,'#fff','#d0d5dd',r=12)
g.text(PX+36,PY+52,'Scores against the answer key, 0 to 1',size=24,weight=600,anchor='start')
g.text(PX+36,PY+82,"the organisers' formula, run on all 520 emails",size=18,fill='#667085',anchor='start')
LX=PX+300; RX=PX+PW-150; BW=RX-LX
top=PY+130
for v,t in [(0,'0'),(0.25,'0.25'),(0.5,'0.5'),(0.75,'0.75'),(1,'1.0')]:
    x=LX+v*BW
    g.E(f'<line x1="{x:.0f}" y1="{top-14}" x2="{x:.0f}" y2="{PY+PH-58}" stroke="#eaecf0" stroke-width="1"/>')
    g.text(x,PY+PH-30,t,size=15,fill='#98a2b3',font='JetBrains Mono')
rows=[('Final score',0.9975,'0.9975',True),('Baseline in the kit',0.55,'0.55',False),
      ('End to end',1.0,'1.0000',True),('Right category',519/520,'519 / 520',True),
      ('Defect F1',0.9892,'0.9892',True),('Edge cases parked',19/20,'19 / 20',True)]
y=top
for i,(lab,v,vt,ours) in enumerate(rows):
    h=34 if i==0 else 26
    if i==2: y+=30
    col=A if ours else '#98a2b3'
    g.text(LX-20,y+h/2+6,lab,size=19 if i<2 else 18,weight=600 if i==0 else 400,fill='#101828' if ours else '#667085',anchor='end')
    w=v*BW
    g.E(f'<path d="M{LX} {y} H{LX+w-4} Q{LX+w} {y} {LX+w} {y+4} V{y+h-4} Q{LX+w} {y+h} {LX+w-4} {y+h} H{LX} Z" fill="{col}"/>')
    g.text(LX+w+12,y+h/2+7,vt,size=20 if i==0 else 18,weight=600 if i==0 else 500,fill='#101828',anchor='start',font='JetBrains Mono')
    y+=h+(16 if i==0 else 50)
g.E(f'<line x1="{LX}" y1="{top-14}" x2="{LX}" y2="{PY+PH-58}" stroke="#98a2b3" stroke-width="1.5"/>')
open(__file__.rsplit('/',1)[0]+'/s16.svg','w').write(wrap(g.out()))
