"""Crop Abroadster stamp mark tightly for favicon use."""
from pathlib import Path

from PIL import Image, ImageFilter

SRC = Path(
    r"C:\Users\SamiM\.cursor\projects\c-Users-SamiM-AbroadsterSummerGO\assets"
    r"\c__Users_SamiM_AppData_Roaming_Cursor_User_workspaceStorage_"
    r"9faa86d915beb3ab254b90b1b1adaf20_images_image-e7b5827d-74f2-49cf-b15c-3ca4f7f3258a.png"
)
OUT = Path(__file__).resolve().parents[1] / "public"
APP = Path(__file__).resolve().parents[1] / "app"
TEAL = (23, 88, 100)


def cream_or_red(r: int, g: int, b: int) -> bool:
    if r > 240 and g > 240 and b > 240:
        return False
    cream = (
        r > 200
        and g > 180
        and 140 < b < 230
        and (r - b) > 15
        and (r + g + b) > 520
    )
    red = r > 180 and g < 110 and b < 110
    return cream or red


def mark_bbox(im: Image.Image) -> tuple[int, int, int, int]:
    pixels = im.load()
    w, h = im.size
    left, top, right, bottom = w, h, 0, 0
    found = False
    for y in range(h):
        for x in range(w):
            r, g, b, *_ = pixels[x, y]
            if cream_or_red(r, g, b):
                found = True
                left = min(left, x)
                top = min(top, y)
                right = max(right, x)
                bottom = max(bottom, y)
    if not found:
        return 0, 0, w, h
    # Pad for 3D extrusion / grain (more on bottom-left where depth sits)
    bw = right - left + 1
    bh = bottom - top + 1
    return (
        max(0, left - int(bw * 0.10)),
        max(0, top - int(bh * 0.08)),
        min(w, right + 1 + int(bw * 0.06)),
        min(h, bottom + 1 + int(bh * 0.12)),
    )


def main() -> None:
    im = Image.open(SRC).convert("RGBA")
    left, top, right, bottom = mark_bbox(im)
    print("mark bbox", left, top, right, bottom, "wh", right - left, bottom - top)

    cropped = im.crop((left, top, right, bottom))
    px = cropped.load()
    cw, ch = cropped.size
    for y in range(ch):
        for x in range(cw):
            r, g, b, a = px[x, y]
            if r > 240 and g > 240 and b > 240:
                px[x, y] = (*TEAL, 255)

    side = max(cw, ch)
    canvas = int(side * 1.04)
    square = Image.new("RGBA", (canvas, canvas), (*TEAL, 255))
    square.paste(cropped, ((canvas - cw) // 2, (canvas - ch) // 2), cropped)

    master = square.resize((512, 512), Image.Resampling.LANCZOS)
    master = master.filter(ImageFilter.UnsharpMask(radius=1.2, percent=125, threshold=2))
    opaque = Image.new("RGB", master.size, TEAL)
    opaque.paste(master, (0, 0), master)

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "figma").mkdir(parents=True, exist_ok=True)
    APP.mkdir(parents=True, exist_ok=True)

    opaque.save(OUT / "figma" / "favicon-stamp.png", "PNG", optimize=True)
    opaque.resize((32, 32), Image.Resampling.LANCZOS).save(OUT / "favicon-32.png", "PNG")
    opaque.resize((48, 48), Image.Resampling.LANCZOS).save(OUT / "favicon.png", "PNG")
    opaque.resize((180, 180), Image.Resampling.LANCZOS).save(
        OUT / "apple-touch-icon.png", "PNG", optimize=True
    )

    ico_sizes = [(16, 16), (32, 32), (48, 48)]
    ico_images = [opaque.resize(s, Image.Resampling.LANCZOS) for s in ico_sizes]
    ico_images[0].save(
        OUT / "favicon.ico",
        format="ICO",
        sizes=ico_sizes,
        append_images=ico_images[1:],
    )

    opaque.resize((32, 32), Image.Resampling.LANCZOS).save(APP / "icon.png", "PNG")
    opaque.resize((180, 180), Image.Resampling.LANCZOS).save(APP / "apple-icon.png", "PNG")
    print("done")


if __name__ == "__main__":
    main()
