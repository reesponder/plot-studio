import argparse
import io
import json
import os
import sys
from datetime import datetime
from pathlib import Path
from urllib.parse import urlencode

from PIL import Image
from reportlab.graphics import renderPDF
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas

from engraving import draw_engraving


ROOT = Path(__file__).resolve().parent
PAGE = landscape(letter)
CENTER = 301.5
INK = HexColor("#20252a")
SECONDARY = HexColor("#4a4946")
GOLD = HexColor("#8a6a42")
TIERS = {
    "builder": ("Builder", "responsive design and accessible interfaces."),
    "architect": ("Workflow Architect", "workflows, data integrity, and integrations."),
}


def centered(canvas, value, y, size, font="PLOT Serif", color=INK):
    canvas.setFillColor(color)
    canvas.setFont(font, size)
    canvas.drawCentredString(CENTER, y, value)


def draw_header(canvas, sample):
    title = "PLOT Studio Certificate"
    size = 12
    width = pdfmetrics.stringWidth(title, "PLOT Serif", size)
    mark_size, gap = 28, 9
    mark_x = CENTER - (width + mark_size + gap) / 2
    mark_y = 544.5
    mark_path = ROOT.parent / "public" / "media" / "plot-mark.webp"
    with Image.open(mark_path) as source:
        mark = ImageReader(source.convert("RGBA"))
    canvas.saveState()
    circle = canvas.beginPath()
    circle.circle(mark_x + mark_size / 2, mark_y + mark_size / 2, mark_size / 2)
    canvas.clipPath(circle, stroke=0)
    canvas.setFillColor(HexColor("#000000"))
    canvas.rect(mark_x, mark_y, mark_size, mark_size, stroke=0, fill=1)
    inset = 3
    canvas.drawImage(mark, mark_x + inset, mark_y + inset, mark_size - 2 * inset, mark_size - 2 * inset,
                     preserveAspectRatio=True, mask="auto")
    canvas.restoreState()
    canvas.setFillColor(INK)
    canvas.setFont("PLOT Serif", size)
    canvas.drawString(mark_x + mark_size + gap, 555, title)
    if sample:
        centered(canvas, "Sample credential", 535, 9.5, color=GOLD)


def select_name_font(name):
    for font in ("PLOT Semibold", "PLOT Text"):
        mapping = pdfmetrics.getFont(font).face.charToGlyph
        if all(ord(letter) in mapping or letter.isspace() for letter in name):
            return font

    if any("\u3040" <= char <= "\u30ff" for char in name):
        font = "HeiseiMin-W3"
    elif any("\uac00" <= char <= "\ud7af" for char in name):
        font = "HYSMyeongJo-Medium"
    elif any("\u3400" <= char <= "\u9fff" for char in name):
        font = "STSong-Light"
    else:
        return "PLOT Text"
    pdfmetrics.registerFont(UnicodeCIDFont(font))
    return font


def draw_recipient(canvas, name):
    font = select_name_font(name)
    maximum_size, maximum_width = 45.75, 493
    width = pdfmetrics.stringWidth(name, font, maximum_size)
    size = maximum_size if width <= maximum_width else maximum_size * maximum_width / width
    centered(canvas, name, 405.75 + (maximum_size - size) * .18, size, font)


def draw_qr(canvas, url, size=49):
    qr = QrCodeWidget(url, barLevel="M", barBorder=4, barFillColor=INK)
    x0, y0, x1, y1 = qr.getBounds()
    scale = size / max(x1 - x0, y1 - y0)
    drawing = Drawing(size, size, transform=[scale, 0, 0, scale, -x0 * scale, -y0 * scale])
    drawing.add(qr)
    x, y = CENTER - size / 2, 72.5
    renderPDF.draw(drawing, canvas, x, y)
    canvas.linkURL(url, (x, y, x + size, y + size), relative=0)


def draw_issuer(canvas):
    signature_path = Path(os.environ.get("PLOT_CERTIFICATE_SIGNATURE", ROOT / "issuer-signature.png"))
    if signature_path.is_file():
        with Image.open(signature_path) as source:
            bounds = source.convert("L").point(lambda level: 255 if level < 180 else 0).getbbox()
            signature = source.crop(bounds)
        height = 70
        width = height * signature.width / signature.height
        canvas.drawImage(ImageReader(signature), CENTER - width / 2, 187, width, height)
    centered(canvas, "PLOT Studio Certification Programme", 174, 12, "PLOT Semibold")
    centered(canvas, "CONVRO LTD", 159, 12, color=SECONDARY)


def render(record, sink):
    for name, file in (
        ("PLOT Serif", "CrimsonText-Regular.ttf"),
        ("PLOT Semibold", "CrimsonText-SemiBold.ttf"),
        ("PLOT Text", "NotoSans.ttf"),
    ):
        pdfmetrics.registerFont(TTFont(name, str(ROOT / file)))

    name = record["name"]
    credential = record["id"]
    tier, abilities = TIERS[record["exam"]]
    date = datetime.fromisoformat(record["issuedAt"].replace("Z", "+00:00"))
    verify_url = "https://plotstudio.pro/certification/verify?" + urlencode({"id": credential})

    canvas = Canvas(sink, pagesize=PAGE, pageCompression=1, invariant=1)
    canvas.setTitle("PLOT Studio Certified " + tier)
    canvas.setAuthor("CONVRO LTD")
    canvas.setSubject("PLOT Studio certification")
    draw_engraving(canvas)
    draw_header(canvas, bool(record.get("sample")))
    centered(canvas, "PLOT Studio certifies", 486, 24)
    draw_recipient(canvas, name)
    centered(canvas, f"as a PLOT Studio Certified {tier},", 364.5, 15)
    centered(canvas, "for practical work in " + abilities, 345.75, 15)
    centered(canvas, f"Issued on {date.day} {date:%B %Y}", 292, 15)
    centered(canvas, "Credential ID " + credential, 273, 15)

    draw_issuer(canvas)
    draw_qr(canvas, verify_url)
    centered(canvas, verify_url, 39, 9, color=SECONDARY)
    half_url_width = pdfmetrics.stringWidth(verify_url, "PLOT Serif", 9) / 2
    canvas.linkURL(verify_url, (CENTER - half_url_width, 36, CENTER + half_url_width, 47), relative=0)

    canvas.showPage()
    canvas.save()


def main():
    cli = argparse.ArgumentParser()
    cli.add_argument("--sample", type=Path)
    options = cli.parse_args()
    if options.sample:
        record = json.loads((ROOT / "sample.json").read_text(encoding="utf-8"))
        with options.sample.open("wb") as sink:
            render(record, sink)
    else:
        record = json.load(sys.stdin.buffer)
        output = io.BytesIO()
        render(record, output)
        sys.stdout.buffer.write(output.getvalue())


if __name__ == "__main__":
    main()
