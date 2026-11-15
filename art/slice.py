# Cuts public/cig.png from art/cig-sheet-light.png (a 2x2 sheet from ChatGPT, green screen).
# Keys the green, lines the four panels up on the cigarette, shrinks them to a quarter
# and crops the empty sky. Needs Pillow and numpy: python3 slice.py from the project root.
import json, numpy as np
from PIL import Image
K = 4
im = np.asarray(Image.open('art/cig-sheet-light.png').convert('RGB')).astype(float)
def panel(i):
    y0 = 3 if i < 2 else 630; x0 = 3 if i % 2 == 0 else 630
    return im[y0:y0+620, x0:x0+620]
def green(p):
    r,g,b = p[...,0],p[...,1],p[...,2]
    return (g > 120) & (g > r + 50) & (g > b + 50)
# anchors measured: (cx, finger top) per panel; reference is panel 3, the lit rest frame
anchors = {0: (342.0, 448), 1: (328.0, 448), 2: (340.0, 446), 3: (334.5, 449)}
REF = 3
order = [3, 0, 1, 2]   # rest, lighter up, flame, caught
S = 620; N = S // K
frames = []
for i in order:
    p = panel(i).copy()
    a = ~green(p)
    # despill: no pixel of the hand is allowed to be greener than it is red or blue
    g = p[...,1]; mx = np.maximum(p[...,0], p[...,2])
    p[...,1] = np.where(a & (g > mx), mx, g)
    rgba = np.dstack([p, a.astype(float) * 255])
    dx = int(round(anchors[REF][0] - anchors[i][0])); dy = int(round(anchors[REF][1] - anchors[i][1]))
    # shift, padding the bottom by repeating the last row (the hand runs off the bottom edge)
    out = np.zeros_like(rgba)
    out[max(0, dy):S + min(0, dy), max(0, dx):S + min(0, dx)] = rgba[max(0, -dy):S - max(0, dy), max(0, -dx):S - max(0, dx)]
    if dy < 0: out[S + dy:, max(0, dx):S + min(0, dx)] = rgba[S - 1:S, max(0, -dx):S - max(0, dx)]  # repeat the bottom row
    # premultiplied box downsample
    pm = out.copy(); pm[..., :3] *= out[..., 3:4] / 255
    small = pm.reshape(N, K, N, K, 4).mean(axis=(1, 3))
    alpha = small[..., 3] / 255
    rgb = np.where(alpha[..., None] > 0, small[..., :3] / np.maximum(alpha[..., None], 1e-6), 0)
    hard = (alpha > 0.5).astype(float) * 255
    frame = np.dstack([np.clip(rgb, 0, 255), hard]).astype(np.uint8)
    frames.append(frame)
    print(f'panel {i}: shift ({dx},{dy})')
TOP = 72  # rows above this are empty in every frame
sheet = np.concatenate([f[TOP:] for f in frames], axis=1)
Image.fromarray(sheet, 'RGBA').save('public/cig.png', optimize=True)
# metadata in sprite pixels, from the reference panel
cx, finger = anchors[REF]
meta = {'w': N, 'h': N - TOP, 'frames': len(order), 'tipX': cx / K, 'tipY': 360 / K - TOP, 'tipUnlitY': 373 / K - TOP,
        'finger': finger / K - TOP, 'filter': 576 / K - TOP, 'stickW': 35 / K, 'handTop': 455 / K - TOP}
print(json.dumps(meta))
# a preview at 3x nearest for a look
Image.fromarray(sheet, 'RGBA').resize((sheet.shape[1]*3, sheet.shape[0]*3), Image.NEAREST).save(
    'art/preview.png')
