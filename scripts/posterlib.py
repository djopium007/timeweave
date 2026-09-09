"""Shared bits for the ReelOrder poster packs (used by build-packs.py and fix-wallpapers.py)."""
from PIL import Image, ImageDraw, ImageColor

WALL = (1290, 2796)          # iPhone Pro; the whole poster is fitted inside, never cropped
WALL_WIDTH = 0.90            # poster width as a share of the screen
WALL_Y = 0.62                # vertical position of the poster (0.5 = centred, higher = lower, clears the clock)

def wallpaper(im, accent='#FFFFFF'):
    """Phone wallpaper: the complete poster, letterboxed on black with a thin accent frame,
    sat below the lock-screen clock. Never crops - a 2:3 poster loses ~31% of its width
    if it is cropped to fill a 1290x2796 screen (title and cast text sliced off)."""
    W, H = WALL
    pw = round(W * WALL_WIDTH); ph = round(im.size[1] * pw / im.size[0])
    if ph > H - 140:                                   # keep a margin even for very tall art
        ph = H - 140; pw = round(im.size[0] * ph / im.size[1])
    out = Image.new('RGB', WALL, (0, 0, 0))
    x0, y0 = (W - pw) // 2, round((H - ph) * WALL_Y)
    ImageDraw.Draw(out).rectangle([x0 - 3, y0 - 3, x0 + pw + 2, y0 + ph + 2],
                                  outline=ImageColor.getrgb(accent), width=3)
    out.paste(im.resize((pw, ph), Image.LANCZOS), (x0, y0))
    return out
