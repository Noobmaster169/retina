# usage: put.py <marker comment> <svg file> : replace or insert full-slide svg as first child of that slide
import sys,re
p='/root/ai/fiber/retina/docs/pitch/deck.html'
marker,svgf=sys.argv[1],sys.argv[2]
s=open(p).read()
a=s.index(marker); b=s.index('</section>',a)
seg=s[a:b]
svg=open(svgf).read()
if 'viewBox="0 0 1920 1080" style="position:absolute; left:0; top:0">' in seg:
    i=seg.index('<svg width="1920" height="1080"'); j=seg.index('</svg>',i)+len('</svg>')
    seg=seg[:i]+svg+seg[j:]
else:
    k=seg.index('>',seg.index('<section'))+1
    seg=seg[:k]+'\n  '+svg+seg[k:]
s=s[:a]+seg+s[b:]
open(p,'w').write(s)
