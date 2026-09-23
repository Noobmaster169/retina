import math
o=[]
A='#175CD3'
def E(x): o.append(x)
def plat(xlt,xrt,xlb,xrb,yt,yb,d,fill,stroke,side):
    E(f'<polygon points="{xlb},{yb} {xrb},{yb} {xrb},{yb+d} {xlb},{yb+d}" fill="{side}" stroke="{stroke}" stroke-width="1.5"/>')
    E(f'<polygon points="{xlt},{yt} {xrt},{yt} {xrb},{yb} {xlb},{yb}" fill="{fill}" stroke="{stroke}" stroke-width="1.5"/>')
def text(x,y,t,size=16,weight=400,fill='#101828',anchor='middle',font='Inter',ls=0):
    E(f'<text x="{x}" y="{y}" font-family="{font}" font-size="{size}" font-weight="{weight}" fill="{fill}" text-anchor="{anchor}" letter-spacing="{ls}">{t}</text>')
def rect(x,y,w,h,fill,stroke,r=6,sw=1.2,extra=''):
    E(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" {extra}/>')

# background wash
E('<defs><linearGradient id="wash" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".22" stop-color="#eaf2fd"/><stop offset=".6" stop-color="#f6f9fe"/><stop offset="1" stop-color="#ffffff"/></linearGradient>'
  '<radialGradient id="glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffffff"/><stop offset=".7" stop-color="#ffffff"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>'
  '<filter id="sh" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#175CD3" flood-opacity=".18"/></filter></defs>')
E('<rect x="0" y="0" width="1920" height="1080" fill="url(#wash)"/>')

cols=[(540,900),(960,1320),(1380,1740)]

def barrow(x,y1,y2,both=False,w=34,hw=66,hl=22):
    # vertical block arrow pointing from y1 to y2 (y2 > y1 means down)
    d=1 if y2>y1 else -1
    s=w/2; h=hw/2
    tip=y2; base=y2-d*hl
    pts=[(x-s,y1+(d*hl if both else 0)),(x-s,base),(x-h,base),(x,tip),(x+h,base),(x+s,base),(x+s,y1+(d*hl if both else 0))]
    if both:
        b0=y1+d*hl
        pts+= [(x+h,b0),(x,y1),(x-h,b0)]
    E('<polygon points="'+' '.join(f'{px:.0f},{py:.0f}' for px,py in pts)+'" fill="url(#pipe)" stroke="#5b9bf0" stroke-width="1.5" stroke-linejoin="round"/>')
E('<defs><linearGradient id="pipe" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d6e6fc"/><stop offset=".5" stop-color="#f4f8ff"/><stop offset="1" stop-color="#d6e6fc"/></linearGradient></defs>')


# managers and employees
plat(560,1720,540,1740,196,244,8,'#ffffff','#5b9bf0','#dbe7fb')
def person(x,y,c):
    E(f'<circle cx="{x}" cy="{y-7}" r="7" fill="{c}"/><path d="M{x-12} {y+14} Q{x-12} {y+1} {x} {y+1} Q{x+12} {y+1} {x+12} {y+14} Z" fill="{c}"/>')
for k,x in enumerate([700,736,772]): person(x,218,'#175CD3' if k==1 else '#84adec')
for k,x in enumerate([1508,1544,1580]): person(x,218,'#175CD3' if k==1 else '#84adec')
text(1140,229,'MANAGERS &amp; EMPLOYEES',size=22,weight=600,fill='#101828',ls=3)
for (a,b) in cols: barrow((a+b)/2,254,286,w=22,hw=44,hl=14)

E('<g transform="translate(0,56)">')
# top panels
tops=[('REVIEW + REPORTS','list'),('ASK RETINA + AGENTS','chat'),('BROWSE + ANALYTICS','map')]
for (a,b),(lab,kind) in zip(cols,tops):
    text((a+b)/2,248,lab,size=19,weight=600,fill='#344054',ls=2)
    plat(a+30,b-30,a,b,262,392,10,'#ffffff','#b9c6d8','#e8eef7')
    # two little windows
    for j,(wx) in enumerate([a+50,a+195]):
        wy=276+ (0 if j==0 else 10); ww=130; wh=96
        rect(wx,wy,ww,wh,'#fff','#98a2b3',r=4)
        E(f'<line x1="{wx}" y1="{wy+14}" x2="{wx+ww}" y2="{wy+14}" stroke="#d0d5dd"/>')
        for k in range(3): E(f'<circle cx="{wx+ww-10-k*8}" cy="{wy+7}" r="2" fill="#d0d5dd"/>')
        ix,iy=wx+10,wy+24
        if kind=='list' and j==0:
            for r_ in range(4):
                E(f'<rect x="{ix}" y="{iy+r_*16}" width="8" height="8" rx="2" fill="{A if r_!=1 else "#dc6803"}"/>')
                E(f'<rect x="{ix+14}" y="{iy+r_*16+1}" width="{80-r_*9}" height="6" rx="3" fill="#d0d5dd"/>')
        elif kind=='list':
            for r_,(c1,c2) in enumerate([('#d0d5dd','#d0d5dd'),('#d0d5dd','#fec84b'),('#d0d5dd','#d0d5dd'),('#d0d5dd','#fec84b')]):
                E(f'<rect x="{ix}" y="{iy+r_*16}" width="48" height="8" rx="2" fill="{c1}"/><rect x="{ix+56}" y="{iy+r_*16}" width="48" height="8" rx="2" fill="{c2}"/>')
        elif kind=='chat' and j==0:
            E(f'<rect x="{ix+30}" y="{iy}" width="80" height="16" rx="8" fill="{A}"/>')
            E(f'<rect x="{ix}" y="{iy+22}" width="96" height="16" rx="8" fill="#e4ecf9"/>')
            E(f'<rect x="{ix}" y="{iy+44}" width="70" height="16" rx="8" fill="#e4ecf9"/>')
        elif kind=='chat':
            for r_ in range(3):
                E(f'<text x="{ix}" y="{iy+10+r_*20}" font-family="JetBrains Mono" font-size="11" fill="#667085">{["run_sql","find_entity","search_emails"][r_]}</text>')
        elif kind=='map' and j==0:
            E(f'<ellipse cx="{wx+65}" cy="{wy+56}" rx="46" ry="30" fill="#e4ecf9"/>')
            E(f'<path d="M{wx+30} {wy+60} Q{wx+65} {wy+26} {wx+100} {wy+50}" stroke="{A}" stroke-width="2" fill="none"/>')
            E(f'<circle cx="{wx+30}" cy="{wy+60}" r="4" fill="{A}"/><circle cx="{wx+100}" cy="{wy+50}" r="4" fill="{A}"/>')
        else:
            for k,hh in enumerate([30,48,22,56,40]):
                E(f'<rect x="{ix+4+k*22}" y="{iy+62-hh}" width="14" height="{hh}" rx="2" fill="{A if k==3 else "#b2ccf5"}"/>')
E('</g>')

# single connections
for (a,b),chip in zip(cols,['APP','MCP','API']):
    x=(a+b)/2
    barrow(x,462,524,both=True)
    rect(x-30,481,60,24,'#fff','#98a2b3',r=12)
    text(x,498,chip,size=13,font='JetBrains Mono',fill='#344054')
for i,(a,b) in enumerate(cols): barrow((a+b)/2,858,821 if i==1 else 808)

# ontology platform
plat(610,1720,520,1800,524,790,14,'#f5f9ff','#5b9bf0','#dbe7fb')
# grid of faint circuit lines on platform
nodes={
 'Shipments':(660,690),'Documents':(770,575),'Emails':(890,735),
 'Companies':(1010,575),'Commodities':(1060,745),
 'Ports':(1380,575),'Vessels':(1590,630),'Carriers':(1440,740),'People':(1250,748)}
C=(1160,655)
for n,(x,y) in nodes.items():
    E(f'<path d="M{C[0]} {C[1]} L{x} {C[1]} L{x} {y}" stroke="#9cc0f2" stroke-width="2" fill="none" opacity=".7"/>' if abs(y-C[1])>30 else f'<path d="M{C[0]} {C[1]} L{x} {y}" stroke="#9cc0f2" stroke-width="2" fill="none"/>')
rels=[('Shipments','Documents','stated in'),('Documents','Emails','attached to'),('Companies','Ports','ships to'),('Carriers','Vessels','operates'),('Vessels','Ports','calls at')]
for a_,b_,lab in rels:
    (x1,y1),(x2,y2)=nodes[a_],nodes[b_]
    E(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{A}" stroke-width="2" opacity=".55"/>')
    mx,my=(x1+x2)/2,(y1+y2)/2
    w=len(lab)*7.6+18
    rect(mx-w/2,my-12,w,24,'#667085','#667085',r=12)
    text(mx,my+5,lab,size=13,fill='#fff')
# centre
E(f'<ellipse cx="{C[0]}" cy="{C[1]}" rx="190" ry="72" fill="url(#glow)"/>')
rect(C[0]-130,C[1]-42,260,84,'#ffffff','#b2ccf5',r=42,sw=1.5,extra='filter="url(#sh)"')
text(C[0],C[1]-10,'01',size=14,font='JetBrains Mono',fill=A)
text(C[0],C[1]+20,'Business data',size=28,weight=600,fill=A)
for n,(x,y) in nodes.items():
    w=len(n)*11.5+36
    rect(x-w/2,y-20,w,40,A,A,r=20,extra='filter="url(#sh)"')
    text(x,y+7,n,size=19,weight=500,fill='#fff')
# platform tab
rect(1060,784,200,34,'#fff','#344054',r=4,sw=1.4)
text(1160,807,'ONTOLOGY SYSTEM',size=16,weight=600,fill='#101828',ls=1.5)

# bottom panels
bots=[('DATA SOURCES',['Emails','PDF','Word','Excel','Scans','Threads'],'#eef4fd','#b2ccf5',A),
      ('PIPELINE',['1 · Classification','2 · Comparison &amp; Extraction','3 · Ontology Extraction'],'#fff','#d0d5dd','#344054'),
      ('REFERENCE DATA',['UN/LOCODE ports','ISO countries','UN geoscheme','Vessel names*'],'#fff','#d0d5dd','#344054')]
bots[2]=('REFERENCE DATA',['UN/LOCODE','ISO 3166','UN geoscheme','World ports'],'#fff','#d0d5dd','#344054')
for (a,b),(lab,cells,cf,cs,tc) in zip(cols,bots):
    plat(a+20,b-20,a,b,858,968,10,'#ffffff','#b9c6d8','#e8eef7')
    one=len(cells)==3
    cw=(b-a-72) if one else (b-a-80)/2; rows=3 if one else (len(cells)+1)//2; ch=26
    for k,c in enumerate(cells):
        r_,c_=(k,0) if one else divmod(k,2)
        x=a+36+c_*(cw+8); y=870+r_*(ch+6)+ (8 if rows==2 else 0)
        rect(x,y,cw,ch,cf,cs,r=3)
        text(x+cw/2,y+18,c.upper(),size=13,fill=tc,ls=.5)
    text((a+b)/2,1008,lab,size=19,weight=600,fill='#344054',ls=2)
open(__file__.rsplit('/',1)[0]+'/s07.svg','w').write('<svg width="1920" height="1080" viewBox="0 0 1920 1080" style="position:absolute; left:0; top:0">\n'+'\n'.join(o)+'\n  </svg>')
