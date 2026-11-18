import io
import json
import sys
import warnings

from PIL import Image, ImageOps, UnidentifiedImageError


MIB = 1024 * 1024
MAX_INPUT = 12 * MIB
MAX_OUTPUT = 16 * MIB
MAX_PIXELS = 16 * 1024 * 1024
MAX_SIDE = 8192
FORMATS = frozenset(("PNG", "JPEG", "WEBP"))


class InvalidImage(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


class ImageBuffer(io.BytesIO):
    def write(self, data):
        if self.tell() + len(data) > MAX_OUTPUT:
            raise InvalidImage(413, "The optimized image exceeds 16 MB.")
        return super().write(data)


def check_size(width, height):
    if not (0 < width <= MAX_SIDE and 0 < height <= MAX_SIDE and width * height <= MAX_PIXELS):
        raise InvalidImage(413, "Use an image no larger than 8192 pixels per side and 16 megapixels total.")


def encode(source, kind):
    with Image.open(io.BytesIO(source), formats=[kind]) as image:
        check_size(*image.size)
        if getattr(image, "n_frames", 1) != 1 or getattr(image, "is_animated", False):
            raise InvalidImage(422, "Upload a single-frame image.")
        image.verify()
    with Image.open(io.BytesIO(source), formats=[kind]) as image:
        image.load()
        has_alpha = "A" in image.getbands() or "transparency" in image.info
        rotated = ImageOps.exif_transpose(image)
        prepared = rotated.convert("RGBA" if has_alpha and kind != "JPEG" else "RGB")
        prepared.info.clear()
        check_size(*prepared.size)
        options = {"PNG": {"compress_level": 5}, "JPEG": {"quality": 92, "optimize": True},
                   "WEBP": {"quality": 92, "method": 4}}
        target = ImageBuffer()
        prepared.save(target, kind, **options[kind])
        return prepared.size, target.getbuffer()


def write_metadata(values):
    sys.stdout.buffer.write(json.dumps(values, separators=(",", ":")).encode("ascii") + b"\n")


def main():
    Image.MAX_IMAGE_PIXELS = MAX_PIXELS
    warnings.simplefilter("error", Image.DecompressionBombWarning)
    source = sys.stdin.buffer.read(MAX_INPUT + 1)
    kind = sys.argv[1] if len(sys.argv) == 2 else ""
    try:
        if len(source) > MAX_INPUT:
            raise InvalidImage(413, "The upload exceeds 12 MB.")
        if not source or kind not in FORMATS:
            raise InvalidImage(422, "Choose a PNG, JPEG, or WebP image.")
        (width, height), payload = encode(source, kind)
    except InvalidImage as error:
        write_metadata({"status": error.status, "error": str(error)})
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        write_metadata({"status": 413, "error": "Use an image no larger than 16 megapixels."})
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError, TypeError, IndexError, OverflowError):
        write_metadata({"status": 422, "error": "This file could not be read as the image format in its filename."})
    else:
        if len(payload) > MAX_OUTPUT:
            write_metadata({"status": 413, "error": "The optimized image exceeds 16 MB."})
            return
        write_metadata({"status": 200, "width": width, "height": height})
        sys.stdout.buffer.write(payload)


if __name__ == "__main__":
    main()
