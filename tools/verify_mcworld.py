# Independent reader for a Worldsmith Minecraft export (Bedrock): zip -> level.dat, LevelDB manifest + log -> chunks.
# It shares no code with the exporter in the page and fails with an AssertionError on anything malformed.
#
#   python3 tools/verify_mcworld.py WORLD.zip [--quiet] [--images PREFIX] [--section Z]
#
#   --quiet          print only the final OK
#   --images PREFIX  also draw PREFIX_top.png (top blocks) and PREFIX_biome.png; needs Pillow
#   --section Z      with --images, also draw a vertical cross-section along block row Z
import sys,zipfile,struct,io,collections,argparse
ap=argparse.ArgumentParser();ap.add_argument('path');ap.add_argument('--quiet',action='store_true');ap.add_argument('--images');ap.add_argument('--section',type=int)
args=ap.parse_args()
path=args.path;tag=args.images
if args.quiet:
    import builtins;_print=builtins.print;print=lambda *a,**k:None
z=zipfile.ZipFile(path); assert z.testzip() is None, 'zip crc failure'
print('zip entries:',[(i.filename,i.file_size,i.compress_size,i.compress_type) for i in z.infolist()])

class R:
    def __init__(s,b,p=0): s.b=b; s.p=p
    def u8(s): v=s.b[s.p]; s.p+=1; return v
    def take(s,n): v=s.b[s.p:s.p+n]; assert len(v)==n,'short read'; s.p+=n; return v
    def i16(s): return struct.unpack('<h',s.take(2))[0]
    def u16(s): return struct.unpack('<H',s.take(2))[0]
    def i32(s): return struct.unpack('<i',s.take(4))[0]
    def u32(s): return struct.unpack('<I',s.take(4))[0]
    def i64(s): return struct.unpack('<q',s.take(8))[0]
    def f32(s): return struct.unpack('<f',s.take(4))[0]
    def var(s):
        v=0;sh=0
        while True:
            c=s.u8(); v|=(c&127)<<sh; sh+=7
            if c<128: return v
    def s(s): return s.take(s.u16()).decode('utf8')
def nbt_payload(r,t):
    if t==1: return r.u8()
    if t==2: return r.i16()
    if t==3: return r.i32()
    if t==4: return r.i64()
    if t==5: return r.f32()
    if t==8: return r.s()
    if t==9:
        et=r.u8(); n=r.i32(); return [nbt_payload(r,et) for _ in range(n)]
    if t==10:
        d={}
        while True:
            tt=r.u8()
            if tt==0: return d
            nm=r.s(); d[nm]=nbt_payload(r,tt)
    raise Exception('bad nbt tag %d'%t)
def nbt_root(r):
    t=r.u8(); assert t==10; nm=r.s(); return nbt_payload(r,10)

# level.dat
ld=z.read('level.dat'); r=R(ld); ver=r.i32(); ln=r.i32(); assert ln==len(ld)-8,(ln,len(ld))
lvl=nbt_root(r); assert r.p==len(ld)
print('level.dat v%d:'%ver,lvl)
print('levelname:',z.read('levelname.txt').decode())

# crc32c, bitwise (independent of the table version in the page)
def crc32c(data,crc=0):
    crc^=0xFFFFFFFF
    for b in data:
        crc^=b
        for _ in range(8): crc=(crc>>1)^(0x82F63B78 if crc&1 else 0)
    return crc^0xFFFFFFFF
assert crc32c(b'123456789')==0xE3069283
_t=[]
for i in range(256):
    c=i
    for _ in range(8): c=(c>>1)^(0x82F63B78 if c&1 else 0)
    _t.append(c)
def crc32c_fast(data):
    c=0xFFFFFFFF
    for b in data: c=_t[(c^b)&255]^(c>>8)
    return c^0xFFFFFFFF
assert crc32c_fast(b'123456789')==0xE3069283
def unmask(m): 
    rot=(m-0xa282ead8)&0xFFFFFFFF
    return ((rot>>17)|(rot<<15))&0xFFFFFFFF
def log_records(data):
    out=[];cur=None;p=0;n=len(data)
    while p<n:
        left=32768-p%32768
        if left<7: 
            assert data[p:p+left]==bytes(left),'trailer not zero'; p+=left; continue
        crc,ln,ty=struct.unpack('<IHB',data[p:p+7]); frag=data[p+7:p+7+ln]; assert len(frag)==ln and ln<=left-7
        assert unmask(crc)==crc32c_fast(bytes([ty])+frag),'crc mismatch at %d'%p
        p+=7+ln
        if ty==1: assert cur is None; out.append(frag)
        elif ty==2: assert cur is None; cur=[frag]
        elif ty==3: cur.append(frag)
        elif ty==4: cur.append(frag); out.append(b''.join(cur)); cur=None
        else: raise Exception('bad record type %d'%ty)
    assert cur is None
    return out
assert z.read('db/CURRENT')==b'MANIFEST-000002\n'
mrec=log_records(z.read('db/MANIFEST-000002')); assert len(mrec)==1
r=R(mrec[0]); edit={}
while r.p<len(mrec[0]):
    t=r.var()
    if t==1: edit['comparator']=r.take(r.var()).decode()
    elif t==2: edit['log']=r.var()
    elif t==9: edit['prevlog']=r.var()
    elif t==3: edit['next']=r.var()
    elif t==4: edit['lastseq']=r.var()
    else: raise Exception('manifest tag %d'%t)
print('manifest:',edit); assert edit=={'comparator':'leveldb.BytewiseComparator','log':3,'prevlog':0,'next':4,'lastseq':0}

log=z.read('db/000003.log'); recs=log_records(log); print('log bytes',len(log),'batches',len(recs))
db={}; seq_expect=1
for rec in recs:
    r=R(rec); seq=r.i64(); cnt=r.u32(); assert seq==seq_expect,(seq,seq_expect); seq_expect+=cnt
    for _ in range(cnt):
        assert r.u8()==1; k=r.take(r.var()); v=r.take(r.var()); assert k not in db; db[k]=v
    assert r.p==len(rec)
print('keys',len(db))
chunks=collections.defaultdict(dict)
for k,v in db.items():
    assert len(k) in (9,10); x,zc,t=struct.unpack('<iiB',k[:9]); sub=struct.unpack('<b',k[9:])[0] if len(k)==10 else None
    chunks[(x,zc)][(t,sub)]=v
xs=[c[0] for c in chunks]; zs=[c[1] for c in chunks]
x0,x1,z0,z1=min(xs),max(xs),min(zs),max(zs); print('chunk range x',x0,x1,'z',z0,z1,'count',len(chunks)); assert len(chunks)==(x1-x0+1)*(z1-z0+1)
Wb=(x1-x0+1)*16; Hb=(z1-z0+1)*16
top_id={}; names=collections.Counter(); palettes=set()
import array
topY=[[0]*Wb for _ in range(Hb)]; topB=[[None]*Wb for _ in range(Hb)]; biomeM=[[0]*Wb for _ in range(Hb)]
ALLOWED={1,2,3,4,5,6,8,16}
col=collections.defaultdict(dict)  # full columns for a cross-section row
secz=args.section if tag else None
for (cx,cz),recs in chunks.items():
    assert recs[(0x2C,None)]==b'\x28' and recs[(0x36,None)]==b'\x02\x00\x00\x00'
    d=recs[(0x2B,None)]; r=R(d); hm=[r.i16() for _ in range(256)]
    # biomes
    prev=None;bl=[]
    for n in range(25):
        hd=r.u8()
        if hd==0xFF: assert prev is not None; bl.append(prev); continue
        assert hd&1==1; bits=hd>>1
        if bits==0: prev=[r.i32()]*4096
        else:
            assert bits in ALLOWED; per=32//bits; nw=-(-4096//per); words=[r.u32() for _ in range(nw)]; np_=r.i32(); pal=[r.i32() for _ in range(np_)]
            prev=[pal[(words[p//per]>>((p%per)*bits))&((1<<bits)-1)] for p in range(4096)]
        bl.append(prev)
    assert r.p==len(d),'Data3D trailing bytes'
    subs={}
    for (t,sub),v in recs.items():
        if t!=0x2F: continue
        r=R(v); assert r.u8()==9; assert r.u8()==1; yi=struct.unpack('<b',bytes([r.u8()]))[0]; assert yi==sub and -4<=sub<=19
        hd=r.u8(); assert hd&1==0; bits=hd>>1; assert bits in ALLOWED
        per=32//bits; nw=-(-4096//per); words=struct.unpack('<%dI'%nw,r.take(nw*4)); np_=r.i32(); assert 1<=np_<=1<<bits
        pal=[]
        for _ in range(np_):
            e=nbt_root(r); assert set(e)=={'name','states','version'} and e['version']==17959425
            key=e['name']+str(sorted(e['states'].items())); pal.append(key); palettes.add(key)
        assert r.p==len(v),'subchunk trailing bytes'
        mask=(1<<bits)-1
        blk=[pal[(words[p//per]>>((p%per)*bits))&mask] for p in range(4096)]  # index error if out of palette
        subs[sub]=blk
    for lx in range(16):
        for lz in range(16):
            gx=(cx-x0)*16+lx; gz=(cz-z0)*16+lz
            ty=None
            for sub in sorted(subs,reverse=True):
                blk=subs[sub]
                for y in range(15,-1,-1):
                    b=blk[lx*256+lz*16+y]
                    if not b.startswith('minecraft:air'): ty=sub*16+y; tb=b; break
                if ty is not None: break
            assert ty is not None
            assert hm[lz*16+lx]==ty+65,(hm[lz*16+lx],ty)
            topY[gz][gx]=ty; topB[gz][gx]=tb; biomeM[gz][gx]=bl[0][lx*256+lz*16]; names[tb.split('[')[0]]+=1
            # column must be solid from bedrock up to somewhere: check y=-64 is bedrock
            assert subs[-4][lx*256+lz*16+0].startswith('minecraft:bedrock')
            if secz is not None and gz==secz:
                c={}
                for sub,blk in subs.items():
                    for y in range(16): c[sub*16+y]=blk[lx*256+lz*16+y]
                col[gx]=c
print('distinct block states used:',len(palettes))
for p in sorted(palettes): print('   ',p)
print('top blocks:',names.most_common())
print('height range',min(map(min,topY)),max(map(max,topY)))
COL={'water':(46,98,150),'ice':(190,215,235),'grass':(106,150,76),'sand':(222,205,150),'stone':(128,128,128),'gravel':(140,134,130),'snow':(245,247,250),'snow_layer':(235,240,245),
 'leaves':(48,104,48),'leaves2':(98,128,50),'log':(100,76,50),'log2':(110,90,70),'podzol':(110,82,48),'dirt':(134,96,67),'tallgrass':(120,165,85),'cactus':(60,140,60),'deadbush':(150,120,70),
 'planks':(190,150,90),'cobblestone':(105,105,105),'stonebrick':(90,90,96),'glowstone':(255,220,90),'glass':(200,230,240),'packed_ice':(160,190,230),'sandstone':(215,200,150),'deepslate':(70,70,74),'bedrock':(30,30,30),'air':(170,205,240)}
if not tag:
    (_print if args.quiet else print)('OK'); sys.exit(0)
from PIL import Image
def colour(b):
    n=b.split(':')[1].split('[')[0]; return COL.get(n,(255,0,255))
img=Image.new('RGB',(Wb,Hb))
px=img.load()
for zz in range(Hb):
    for xx in range(Wb):
        c=colour(topB[zz][xx]); y=topY[zz][xx]
        yl=topY[zz][xx-1] if xx>0 else y; yu=topY[zz-1][xx] if zz>0 else y
        f=1+max(-0.35,min(0.35,((y-yl)+(y-yu))*0.09))
        if 'water' in topB[zz][xx]: f=1
        px[xx,zz]=tuple(max(0,min(255,int(v*f))) for v in c)
img.save(tag+'_top.png')
bimg=Image.new('RGB',(Wb,Hb)); bp=bimg.load(); import colorsys
ids=sorted({v for row in biomeM for v in row}); print('biome ids:',ids)
for zz in range(Hb):
    for xx in range(Wb):
        i=ids.index(biomeM[zz][xx]); bp[xx,zz]=tuple(int(v*255) for v in colorsys.hsv_to_rgb(i/len(ids),0.6,0.9))
bimg.save(tag+'_biome.png')
if secz is not None:
    simg=Image.new('RGB',(Wb,384)); sp=simg.load()
    for xx in range(Wb):
        c=col[xx]
        for y in range(-64,320):
            sp[xx,319-y]=colour(c.get(y,'minecraft:air'))
    simg.save(tag+'_section.png')
(_print if args.quiet else print)('OK')
