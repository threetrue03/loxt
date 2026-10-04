from pathlib import Path
from html import escape
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
W, H, SCALE = 1600, 1080, 2
image = Image.new('RGB', (W*SCALE, H*SCALE), '#F5F4F0')
draw = ImageDraw.Draw(image)
elements = []

def box(x,y,w,h,c,r=0,name='shape'):
    draw.rounded_rectangle((x*SCALE,y*SCALE,(x+w)*SCALE,(y+h)*SCALE),radius=r*SCALE,fill=c)
    elements.append(f'<rect id="{name}" x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{c}"/>')

def line(x1,y1,x2,y2,c,width,name='stroke'):
    draw.line((x1*SCALE,y1*SCALE,x2*SCALE,y2*SCALE),fill=c,width=round(width*SCALE))
    for x,y in [(x1,y1),(x2,y2)]:
        draw.ellipse(((x-width/2)*SCALE,(y-width/2)*SCALE,(x+width/2)*SCALE,(y+width/2)*SCALE),fill=c)
    elements.append(f'<path id="{name}" d="M{x1} {y1}L{x2} {y2}" stroke="{c}" stroke-width="{width}" stroke-linecap="round" fill="none"/>')

def text(x,y,value,size,c='#292A2A',bold=False):
    font=ImageFont.truetype('C:/Windows/Fonts/'+('malgunbd.ttf' if bold else 'malgun.ttf'),round(size*SCALE))
    draw.text((x*SCALE,y*SCALE),value,font=font,fill=c)
    elements.append(f'<text x="{x}" y="{y+size}" font-family="Malgun Gothic, sans-serif" font-weight="{700 if bold else 400}" font-size="{size}" fill="{c}">{escape(value)}</text>')

def symbol(kind,x,y,size,c):
    s=size/100
    def b(a,z,w,h,r=5,n='bar'):box(x+a*s,y+z*s,w*s,h*s,c,r*s,n)
    def l(a,z,e,f,width=12,n='stroke'):line(x+a*s,y+z*s,x+e*s,y+f*s,c,width*s,n)
    elements.append(f'<g id="concept-{kind}-symbol">')
    if kind==1:
        b(5,37,12,26,6,'wave-short');b(26,17,12,66,6,'wave-long')
        l(53,29,53,45,12,'wave-turn');l(53,45,89,45,12,'text-first')
        l(53,64,89,64,12,'text-second');l(53,83,76,83,12,'text-third')
    elif kind==2:
        l(18,17,18,80,14,'L-vertical');l(18,80,81,80,14,'L-base')
        l(39,20,81,62,14,'X-descending');l(39,62,81,20,14,'X-ascending')
    else:
        l(25,17,75,17,12,'O-top');l(25,83,75,83,12,'O-bottom')
        l(19,30,19,70,12,'O-left');l(81,30,81,70,12,'O-right')
        l(40,41,40,59,8,'wave-short');l(59,30,59,70,8,'wave-long')
    elements.append('</g>')

def wordmark(x,y,height,c,pulse=False):
    s=height/80
    def l(a,z,e,f,n):line(x+a*s,y+z*s,x+e*s,y+f*s,c,9*s,n)
    elements.append('<g id="LOXT-custom-wordmark">')
    l(4,4,4,76,'L-stem');l(4,76,44,76,'L-foot')
    l(68,4,103,4,'O-top');l(68,76,103,76,'O-bottom')
    l(60,13,60,67,'O-left');l(111,13,111,67,'O-right')
    if pulse:
        l(79,34,79,46,'O-wave-short');l(93,25,93,55,'O-wave-long')
    l(136,4,181,76,'X-down');l(136,76,181,4,'X-up')
    l(203,4,255,4,'T-top');l(229,4,229,76,'T-stem')
    elements.append('</g>')

text(56,35,'LOXT / BRAND EXPLORATIONS',15,'#5C5547',True)
text(56,71,'소리를 기록으로, 내 PC 안에서.',34,bold=True)
text(1170,87,'VECTOR CONCEPTS 01—03',14,'#77776E')
names=['소리 → 글줄','LX 모노그램','Pulse 워드마크']
descriptions=[['세로 파형이 가로 글줄로 전환됩니다.','음성 전사 기능을 가장 직접적으로 표현합니다.'],['L의 받침 안에 X를 단단하게 결합했습니다.','로컬 작업 공간과 LOXT의 이니셜을 담았습니다.'],['LOXT의 O 안에 작은 파형을 담았습니다.','이름 자체를 로고로 쓰고 O를 아이콘으로 분리합니다.']]
for i in range(3):
    k=i+1;x=56+i*504
    elements.append(f'<g id="concept-{k}-presentation">')
    box(x,155,480,412,'#1E1E1E',18,'dark-background')
    text(x+25,177,f'0{k} / DARK',12,'#A5A5A3')
    if k==3:
        wordmark(x+80,259,96,'#D9D1BD',True)
        symbol(k,x+209,407,62,'#D9D1BD')
    else:
        symbol(k,x+174,230,132,'#D9D1BD')
        symbol(k,x+79,423,48,'#D9D1BD');wordmark(x+146,424,47,'#D9D1BD')
    box(x,587,480,213,'#FDFDFC',14,'light-background')
    text(x+25,609,'LIGHT / ONE COLOR',12,'#87877F')
    symbol(k,x+65,664,70,'#5C5547');wordmark(x+160,671,55,'#5C5547',k==3)
    text(x,824,names[i],23,bold=True)
    for j,d in enumerate(descriptions[i]):text(x,866+j*25,d,14,'#74746D')
    text(x,947,'16 px        24 px        APP TILE',11,'#87877F')
    symbol(k,x+4,978,16,'#5C5547');symbol(k,x+85,974,24,'#5C5547')
    box(x+181,960,56,56,'#D9D1BD',12,'app-tile');symbol(k,x+189,968,40,'#5C5547')
    elements.append('</g>')
text(56,1043,'#1E1E1E CHARCOAL   /   #D9D1BD SAND   /   #5C5547 INK',12,'#74746D')
text(1110,1043,'LOXT lettering: custom vector geometry',12,'#74746D')
svg='<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1080" viewBox="0 0 1600 1080"><title>LOXT — three logo concepts</title><rect width="1600" height="1080" fill="#F5F4F0"/>'+''.join(elements)+'</svg>'
(ROOT/'LOXT-concepts.svg').write_text(svg,encoding='utf-8')
image.resize((W,H),Image.Resampling.LANCZOS).save(ROOT/'LOXT-concepts.png')
print('Created LOXT-concepts.svg and LOXT-concepts.png')
