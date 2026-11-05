"""Genera los iconos PNG del lanzador (Android 7.x) con el mismo diseño que el
icono adaptativo vectorial: ruta en serpentina blanca y marcador amarillo sobre
fondo turquesa. Dibujado con primitivas de Pillow (sin imágenes generadas por IA).

Uso: python make_icons.py <carpeta res>
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

SIZES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
TEAL = (0, 130, 149, 255)
DARK = (0, 49, 59, 255)
YELLOW = (255, 235, 59, 255)
WHITE = (255, 255, 255, 255)


def draw(size: int) -> Image.Image:
    s = 4  # sobremuestreo para bordes suaves
    W = size * s
    img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(W * 0.18)
    d.rounded_rectangle([0, 0, W - 1, W - 1], radius=r, fill=TEAL)
    # Coordenadas del diseño vectorial (viewport 108) recortadas a la zona segura 18..90
    k = W / 72.0
    off = 18
    P = lambda x, y: ((x - off) * k, (y - off) * k)
    route = [P(34, 74), P(34, 40), P(44, 40), P(44, 74), P(54, 74), P(54, 40), P(64, 40), P(64, 58)]
    d.line(route, fill=WHITE, width=max(2, int(3.2 * k)), joint="curve")
    # Marcador: círculo + triángulo
    cx, cy = P(70, 46)
    rad = 16 * k
    d.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], fill=YELLOW)
    d.polygon([P(55.5, 52), P(84.5, 52), P(70, 74)], fill=YELLOW)
    rr = 6 * k
    d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=DARK)
    return img.resize((size, size), Image.LANCZOS)


def main(res: Path) -> None:
    for dpi, px in SIZES.items():
        out = res / f"mipmap-{dpi}"
        out.mkdir(parents=True, exist_ok=True)
        draw(px).save(out / "ic_launcher.png", optimize=True)
    draw(512).save(res.parent.parent / "tools" / "icono_512.png")
    print("iconos listos en", res)


if __name__ == "__main__":
    main(Path(sys.argv[1]))
