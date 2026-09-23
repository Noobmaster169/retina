A='#175CD3'
class SVG:
    def __init__(s): s.o=[]
    def E(s,x): s.o.append(x)
    def out(s): return '\n'.join(s.o)
    def defs(s):
        s.E('<defs><linearGradient id="wash" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".22" stop-color="#eaf2fd"/><stop offset=".6" stop-color="#f6f9fe"/><stop offset="1" stop-color="#ffffff"/></linearGradient>'
            '<linearGradient id="pipe" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d6e6fc"/><stop offset=".5" stop-color="#f4f8ff"/><stop offset="1" stop-color="#d6e6fc"/></linearGradient>'
            '<linearGradient id="pipev" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d6e6fc"/><stop offset=".5" stop-color="#f4f8ff"/><stop offset="1" stop-color="#d6e6fc"/></linearGradient>'
            '<radialGradient id="glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff"/><stop offset=".7" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>'
            '<filter id="sh" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#175CD3" flood-opacity=".18"/></filter></defs>')
        s.E('<rect x="0" y="0" width="1920" height="1080" fill="url(#wash)"/>')
    def plat(s,x,y,w,h,inset=30,d=10,fill='#fff',stroke='#b9c6d8',side='#e8eef7',dash=False):
        da=' stroke-dasharray="8 6"' if dash else ''
        s.E(f'<polygon points="{x},{y+h} {x+w},{y+h} {x+w},{y+h+d} {x},{y+h+d}" fill="{side}" stroke="{stroke}" stroke-width="1.5"{da}/>')
        s.E(f'<polygon points="{x+inset},{y} {x+w-inset},{y} {x+w},{y+h} {x},{y+h}" fill="{fill}" stroke="{stroke}" stroke-width="1.5"{da}/>')
    def text(s,x,y,t,size=16,weight=400,fill='#101828',anchor='middle',font='Inter',ls=0):
        s.E(f'<text x="{x}" y="{y}" font-family="{font}" font-size="{size}" font-weight="{weight}" fill="{fill}" text-anchor="{anchor}" letter-spacing="{ls}">{t}</text>')
    def rect(s,x,y,w,h,fill,stroke,r=6,sw=1.2,extra=''):
        s.E(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" {extra}/>')
    def pill(s,x,y,t,kind='model',size=18,w=None,h=38):
        w=w or len(t)*size*0.6+34
        if kind=='model': s.rect(x-w/2,y-h/2,w,h,A,A,r=h/2,extra='filter="url(#sh)"'); c='#fff'
        elif kind=='deep': s.rect(x-w/2,y-h/2,w,h,'#0f3f94','#0f3f94',r=h/2,extra='filter="url(#sh)"'); c='#fff'
        else: s.rect(x-w/2,y-h/2,w,h,'#fff','#98a2b3',r=h/2,sw=1.4); c='#101828'
        s.text(x,y+size*0.36,t,size=size,weight=500,fill=c)
        return w
    def chip(s,x,y,t,dark=False,size=13):
        w=len(t)*size*0.62+20
        if dark: s.rect(x-w/2,y-12,w,24,'#667085','#667085',r=12); s.text(x,y+5,t,size=size,fill='#fff')
        else: s.rect(x-w/2,y-12,w,24,'#fff','#98a2b3',r=12); s.text(x,y+5,t,size=size,font='JetBrains Mono',fill='#344054')
    def varrow(s,x,y1,y2,both=False,w=34,hw=66,hl=22,dash=False):
        d=1 if y2>y1 else -1; h=hw/2; a=w/2
        base=y2-d*hl; start=y1+(d*hl if both else 0)
        pts=[(x-a,start),(x-a,base),(x-h,base),(x,y2),(x+h,base),(x+a,base),(x+a,start)]
        if both: pts+=[(x+h,start),(x,y1),(x-h,start)]
        da=' stroke-dasharray="6 5"' if dash else ''
        s.E('<polygon points="'+' '.join(f'{p:.0f},{q:.0f}' for p,q in pts)+f'" fill="url(#pipe)" stroke="#5b9bf0" stroke-width="1.5" stroke-linejoin="round"{da}/>')
    def harrow(s,y,x1,x2,both=False,w=34,hw=66,hl=22,dash=False):
        d=1 if x2>x1 else -1; h=hw/2; a=w/2
        base=x2-d*hl; start=x1+(d*hl if both else 0)
        pts=[(start,y-a),(base,y-a),(base,y-h),(x2,y),(base,y+h),(base,y+a),(start,y+a)]
        if both: pts+=[(start,y+h),(x1,y),(start,y-h)]
        da=' stroke-dasharray="6 5"' if dash else ''
        s.E('<polygon points="'+' '.join(f'{p:.0f},{q:.0f}' for p,q in pts)+f'" fill="url(#pipev)" stroke="#5b9bf0" stroke-width="1.5" stroke-linejoin="round"{da}/>')
    def person(s,x,y,c):
        s.E(f'<circle cx="{x}" cy="{y-7}" r="7" fill="{c}"/><path d="M{x-12} {y+14} Q{x-12} {y+1} {x} {y+1} Q{x+12} {y+1} {x+12} {y+14} Z" fill="{c}"/>')
    def people_strip(s,x,y,w,label,h=48):
        s.plat(x,y,w,h,inset=20,d=8,stroke='#5b9bf0',side='#dbe7fb')
        cx=x+w/2
        for k,px in enumerate([x+120,x+156,x+192]): s.person(px,y+22,A if k==1 else '#84adec')
        for k,px in enumerate([x+w-192,x+w-156,x+w-120]): s.person(px,y+22,A if k==1 else '#84adec')
        s.text(cx,y+33,label,size=22,weight=600,ls=3)
    def window(s,x,y,w,h):
        s.rect(x,y,w,h,'#fff','#98a2b3',r=4)
        s.E(f'<line x1="{x}" y1="{y+14}" x2="{x+w}" y2="{y+14}" stroke="#d0d5dd"/>')
        for k in range(3): s.E(f'<circle cx="{x+w-10-k*8}" cy="{y+7}" r="2" fill="#d0d5dd"/>')
    def doc(s,x,y,label,color=A,w=64,h=80):
        f=14
        s.E(f'<path d="M{x} {y} H{x+w-f} L{x+w} {y+f} V{y+h} H{x} Z" fill="#fff" stroke="#98a2b3" stroke-width="1.3"/>')
        s.E(f'<path d="M{x+w-f} {y} V{y+f} H{x+w}" fill="none" stroke="#98a2b3" stroke-width="1.3"/>')
        for k in range(3): s.E(f'<rect x="{x+10}" y="{y+22+k*10}" width="{w-26-k*6}" height="4" rx="2" fill="#d0d5dd"/>')
        s.rect(x+6,y+h-22,w-12,16,color,color,r=3)
        s.text(x+w/2,y+h-10,label,size=11,weight=600,fill='#fff',font='JetBrains Mono')
    def envelope(s,x,y,w=84,h=56,stroke='#98a2b3'):
        s.rect(x,y,w,h,'#fff',stroke,r=5,sw=1.4)
        s.E(f'<path d="M{x+2} {y+3} L{x+w/2} {y+h*0.55} L{x+w-2} {y+3}" fill="none" stroke="{stroke}" stroke-width="1.4"/>')
def wrap(svg):
    return '<svg width="1920" height="1080" viewBox="0 0 1920 1080" style="position:absolute; left:0; top:0">\n'+svg+'\n  </svg>'
def logo_path(slug):
    import re,os
    svg=open(os.path.join(os.path.dirname(__file__),'logos',slug+'.svg')).read()
    return re.search(r'<path d="([^"]+)"',svg).group(1)
def logo(g,slug,x,y,size,fill):
    # Simple Icons draw on a 24 x 24 box; (x, y) is the top-left corner
    g.E(f'<path transform="translate({x} {y}) scale({size/24:.4f})" d="{logo_path(slug)}" fill="{fill}"/>')
