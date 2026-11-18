# Generates public/og-image.png (1200x630) for LinkedIn / WhatsApp / X link previews.
# Re-run after changing the photo or headline:  python3 scripts/make-og-image.py
from PIL import Image, ImageDraw, ImageFont, ImageOps

W, H = 1200, 630
BG, FG, MUTED, MINT, AMBER, WASH, LINE = '#0a0c0f', '#e6edf3', '#9aa5b1', '#7cf2b0', '#f5b94a', '#2a2010', '#1e242c'
inter = '/usr/share/fonts/opentype/inter/Inter-{}.otf'
mono = '/usr/share/fonts/truetype/dejavu/DejaVuSansMono{}.ttf'
f = lambda path, size: ImageFont.truetype(path, size)

img = Image.new('RGB', (W, H), BG)
d = ImageDraw.Draw(img)
for x in range(0, W, 40):  # faint grid, like a dashboard
    d.line([(x, 0), (x, H)], fill='#0e1116')
for y in range(0, H, 40):
    d.line([(0, y), (W, y)], fill='#0e1116')

# photo, rounded
photo = ImageOps.fit(Image.open('public/photo.jpg').convert('RGB'), (360, 360))
mask = Image.new('L', photo.size, 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, 359, 359], 28, fill=255)
img.paste(photo, (W - 360 - 72, (H - 360) // 2), mask)
d.rounded_rectangle([W - 360 - 72, (H - 360) // 2, W - 72 - 1, (H + 360) // 2 - 1], 28, outline=LINE, width=2)

x = 72
d.text((x, 92), '> ask my portfolio', font=f(mono.format(''), 26), fill=MINT)
d.text((x, 150), 'Roop Shankar', font=f(inter.format('Bold'), 64), fill=FG)
d.text((x, 222), 'Voruganti', font=f(inter.format('Bold'), 64), fill=FG)
d.text((x, 312), 'AI Engineer · RAG, retrieval, evals', font=f(inter.format('Medium'), 32), fill=MUTED)

cx, cy = x, 392
for label in ['91% hit@5', '33/34 router accuracy', '10 manuals indexed']:
    font = f(mono.format('-Bold'), 22)
    w = d.textlength(label, font=font)
    if cx + w + 28 > W - 360 - 72 - 32:  # wrap before reaching the photo
        cx, cy = x, cy + 56
    d.rounded_rectangle([cx, cy, cx + w + 28, cy + 44], 8, fill=WASH, outline='#4a3a1a')
    d.text((cx + 14, cy + 10), label, font=font, fill=AMBER)
    cx += w + 40

d.text((x, H - 92), 'roopshankar10.github.io', font=f(mono.format(''), 24), fill=MUTED)
img.save('public/og-image.png', optimize=True)
print('wrote public/og-image.png')
