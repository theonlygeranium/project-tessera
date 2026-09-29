"""Reference arithmetic used to keep every number in the gradebook mockups consistent.
Not product code: a scratch check so the artboards and the spec's golden fixtures (GRADEBOOK-SPEC.md) agree. Run: python3 engine_check.py"""
from decimal import Decimal, ROUND_HALF_UP
CATS = {'hw':(15,1),'quiz':(20,1),'mid':(20,0),'proj':(40,0),'part':(5,0)}
KEEP_AT_LEAST = 2
ITEMS = [('hw1','hw',10,0),('hw2','hw',10,0),('hw3','hw',10,0),('hw4','hw',10,0),('ec','hw',5,1),
         ('q1','quiz',20,0),('q2','quiz',20,0),('q3','quiz',20,0),('mid','mid',100,0),('prop','proj',20,0),('draft','proj',40,0)]
ORDER=[i[0] for i in ITEMS]+['hw5','q4','final']
EXTRA = [('hw5','hw',10,0),('q4','quiz',20,0),('final','proj',40,0)]
SCHEME = [(93,'A'),(90,'A-'),(87,'B+'),(83,'B'),(80,'B-'),(77,'C+'),(73,'C'),(70,'C-'),(60,'D'),(0,'F')]
def r1(x): return float(Decimal(str(x)).quantize(Decimal('0.1'), ROUND_HALF_UP))
def letter(p): return next(l for c,l in SCHEME if p >= c)
# cell: number | ('late',raw,days) | 'M' missing | 'EX' | 'TG' to grade | ('ov',score)
def item_score(c, pts):
    if isinstance(c,(int,float)): return c
    if c=='M': return 0
    if isinstance(c,tuple) and c[0]=='late': return round(c[1]*(1-0.1*c[2]),2)
    if isinstance(c,tuple) and c[0]=='ov': return c[1]
    return None  # EX, TG, None
def grade(row, held=('draft',), include_held=False, items=ITEMS):
    out = {}; dropped=set(); tw=0; te=0
    for cat,(w,drop) in CATS.items():
        counted=[]; ec=0
        for (iid,c,pts,isec) in items:
            if c!=cat: continue
            if iid in held and not include_held: continue
            s = item_score(row.get(iid), pts)
            if s is None: continue
            if isec: ec+=s; continue
            counted.append((iid,s,pts,row.get(iid)=='M'))
        droppable=[t for t in counted if not t[3]]  # missing zeros are never dropped (setup default)
        if drop and len(counted)-drop >= KEEP_AT_LEAST:
            for d in sorted(droppable, key=lambda t:(t[1]/t[2], ORDER.index(t[0])))[:drop]: dropped.add(d[0]); counted.remove(d)
        if not counted: out[cat]=None; continue
        e=sum(t[1] for t in counted)+ec; p=sum(t[2] for t in counted)
        pct=min(1.0,e/p); out[cat]=(e,p,pct); tw+=w; te+=w*pct
    tot = te/tw*100
    return r1(tot), letter(r1(tot)), out, dropped, te, tw
ROWS = {
 'Aguilar, Tomás':   dict(hw1=9,hw2=('late',9,2),hw3=8,hw4=9,ec=None,q1=17,q2=15,q3=18,mid=84,prop=17,draft=33),
 'Asante, Kwame':    dict(hw1=8,hw2=7,hw3=9,hw4='TG',ec=2,q1=14,q2='M',q3=16,mid=72,prop=15,draft=29),
 'Bello, Aisha':     dict(hw1=10,hw2=10,hw3=9,hw4=10,ec=5,q1=19,q2=20,q3=18,mid=96,prop=20,draft=38),
 'Brooks, Hannah':   dict(hw1=7,hw2=8,hw3='EX',hw4=8,ec=None,q1=15,q2=16,q3=14,mid=('ov',82),prop=16,draft=31),
 'Ellis, Jordan':    dict(hw1='M',hw2=6,hw3=7,hw4='M',ec=None,q1=11,q2=13,q3=12,mid=61,prop=13,draft=24),
 'Haddad, Fatima':   dict(hw1=9,hw2=9,hw3=10,hw4=8,ec=4,q1=18,q2=17,q3=19,mid=88,prop=18,draft=35),
 'Marchetti, Sofia': dict(hw1=8,hw2=9,hw3=8,hw4=('late',8,1),ec=None,q1=16,q2=17,q3=15,mid=79,prop=17,draft=32),
 'Petrova, Elena':   dict(hw1=10,hw2=9,hw3=9,hw4=9,ec=3,q1='EX',q2=18,q3=19,mid=91,prop=19,draft=36),
 'Ramírez, Diego':   dict(hw1=7,hw2='TG',hw3=8,hw4=7,ec=None,q1=13,q2=15,q3=14,mid=74,prop=('late',16,3),draft=28),
 'Raman, Priya':     dict(hw1=9,hw2=10,hw3=('late',7,1),hw4=7,ec=3,q1=16,q2=18,q3='EX',mid=81,prop=18,draft=34),
 'Whitaker, Noah':   dict(hw1=8,hw2=8,hw3=7,hw4=9,ec=None,q1=15,q2=14,q3='M',mid=77,prop=16,draft=30),
 'Zhao, Lin':        dict(hw1=9,hw2=10,hw3=9,hw4=8,ec=2,q1=18,q2=19,q3=17,mid=90,prop=19,draft=37),
}
if __name__=='__main__':
    for n,r in ROWS.items():
        t,l,out,d,te,tw = grade(r); th,lh,*_ = grade(r,include_held=True)
        print(f"{n:18} {t:5} {l:3} held:{th:5} {lh:3} dropped={sorted(d)}")
    pr = ROWS['Raman, Priya']; t,l,out,d,te,tw = grade(pr)
    print('Priya detail', {k:(None if v is None else (round(v[0],2),v[1],round(v[2]*100,2))) for k,v in out.items()}, round(te,3), tw)
    # class averages per item (released items only, numbers only)
    for iid,_,pts,_ in ITEMS:
        vals=[item_score(r.get(iid),pts) for r in ROWS.values()]; vals=[v for v in vals if v is not None and r.get(iid)!='M']
        print(iid, round(sum(vals)/len(vals),1), len(vals))
    # what-if
    w = dict(pr, hw5=9, q4=17, final=36)
    t,l,out,d,te,tw = grade(w, items=ITEMS+EXTRA); print('whatif', t,l,sorted(d), {k:(None if v is None else round(v[2]*100,2)) for k,v in out.items()}, round(te,3))
    for x10 in range(370,401):
        x=x10/10; t,l,*_ = grade(dict(pr,hw5=9,q4=17,final=x), items=ITEMS+EXTRA)
        if t>=90: print('need final', x, t, l); break
