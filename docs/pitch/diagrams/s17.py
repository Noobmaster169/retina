from iso import *
g=SVG(); g.defs()
def label(x,y,t,sub):
    g.text(x,y,t,size=20,weight=600,fill='#101828',ls=2)
    g.text(x,y+28,sub,size=18,fill='#475467')
# centre: built today
g.plat(700,468,520,170,inset=40,d=14,fill='#f5f9ff',stroke='#5b9bf0',side='#dbe7fb')
g.pill(960,512,'Retina ontology',kind='deep',size=21,w=250,h=42)
for x,t in [(810,'Review inbox'),(960,'Ask Retina'),(1110,'BL vs SI check')]:
    g.pill(x,586,t,kind='model',size=16,w=140,h=32)
g.text(820,674,'BUILT TODAY',size=16,weight=600,fill=A,ls=3)
# top: chat that can act
g.plat(600,236,720,104,inset=30,dash=True,stroke='#98a2b3')
g.rect(680,256,250,66,'#fff','#98a2b3',r=6)
g.text(696,280,'Proposed action',size=15,weight=600,anchor='start')
g.rect(696,292,90,22,'#eaecf0','#d0d5dd',r=4); g.text(741,308,'Approve',size=12,fill='#98a2b3')
g.rect(794,292,90,22,'#eaecf0','#d0d5dd',r=4); g.text(839,308,'Reject',size=12,fill='#98a2b3')
g.text(990,284,'A CHAT THAT CAN ACT',size=18,weight=600,anchor='start',ls=1.5)
g.text(990,310,'behind a person\'s approval',size=17,fill='#475467',anchor='start')
g.varrow(960,352,460,both=True,dash=True)
# bottom: lessons
g.plat(600,772,720,104,inset=30,dash=True,stroke='#98a2b3')
for k in range(3):
    g.rect(680+k*44,794+k*6,120,50,'#fff','#98a2b3',r=5)
g.E('<path d="M760 812 h60 M760 824 h40" stroke="#d0d5dd" stroke-width="4" stroke-linecap="round" transform="translate(26 12)"/>')
g.text(940,818,'LESSONS FROM CORRECTIONS',size=18,weight=600,anchor='start',ls=1.5)
g.text(940,844,'approved, and checked on a holdout',size=17,fill='#475467',anchor='start')
g.varrow(960,762,652,dash=True)
# left: real mailbox
g.plat(128,478,440,150,inset=30,dash=True,stroke='#98a2b3')
for k,x in enumerate([206,306,406]): g.envelope(x,510+ (k%2)*10,84,56)
label(348,668,'A REAL MAILBOX','Gmail or Exchange, one adapter')
g.harrow(553,580,690,dash=True)
# right: other document pairs
g.plat(1352,478,440,150,inset=30,dash=True,stroke='#98a2b3')
g.doc(1400,500,'INV',color='#6172f3',w=58,h=74); g.doc(1466,514,'PO',color='#6172f3',w=58,h=74)
g.doc(1600,500,'PACK',color='#12b76a',w=58,h=74); g.doc(1666,514,'BKG',color='#12b76a',w=58,h=74)
g.E('<line x1="1563" y1="504" x2="1563" y2="590" stroke="#d0d5dd" stroke-width="2"/>')
label(1572,668,'OTHER DOCUMENT PAIRS','invoice vs PO, packing list vs booking')
g.harrow(553,1342,1232,dash=True)
# legend
g.rect(128,236,40,24,'#f5f9ff','#5b9bf0',r=4); g.text(180,254,'built',size=18,fill='#344054',anchor='start')
g.E('<rect x="128" y="276" width="40" height="24" rx="4" fill="#fff" stroke="#98a2b3" stroke-dasharray="6 5"/>'); g.text(180,294,'next',size=18,fill='#344054',anchor='start')
open(__file__.rsplit('/',1)[0]+'/s17.svg','w').write(wrap(g.out()))
