from pathlib import Path
from shutil import copyfile
from zipfile import ZipFile, ZIP_DEFLATED
from PIL import Image
import xml.etree.ElementTree as ET

folder=Path(__file__).resolve().parent
source=folder.parent/'loxt-final'
for kind in ['symbol','wordmark','lockup']:
    for ext in ['svg','png']:
        copyfile(source/f'LOXT-{kind}-mono-white.{ext}',folder/f'LOXT-{kind}-white.{ext}')
    ET.parse(folder/f'LOXT-{kind}-white.svg')
    im=Image.open(folder/f'LOXT-{kind}-white.png').convert('RGBA')
    assert im.getchannel('A').getextrema()[0]==0
    assert all((r,g,b)==(255,255,255) for r,g,b,a in im.getdata() if a==255)
(folder/'README.md').write_text('''# LOXT — White Only

선택한 3번 디자인의 흰색(#FFFFFF) 버전만 모았습니다. 도형과 글자 간격은 변경하지 않았습니다.

- LOXT-symbol-white: 파형 O 심볼 단독
- LOXT-wordmark-white: LOXT 글자 로고 단독
- LOXT-lockup-white: 심볼 + LOXT 가로 조합

PNG는 투명 배경입니다. SVG도 배경 없는 실제 벡터이며 Figma에서 편집할 수 있습니다. 흰 배경에서는 보이지 않으므로 어두운 배경 위에서 확인하세요. 글자는 직접 구성한 벡터여서 별도 글꼴이 필요하지 않습니다.
''',encoding='utf-8')
with ZipFile(folder/'LOXT-white-only.zip','w',ZIP_DEFLATED) as z:
    for file in folder.iterdir():
        if file.suffix in ['.svg','.png','.md']:z.write(file,file.name)
print('White-only pack created: 3 SVG, 3 transparent PNG, README. Verified white color and transparency.')
