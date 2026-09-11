"""User-authorized, non-destructive alpha extraction and equal-cell atlas packing.

Source images remain unchanged. The small U2Net model is used only offline during
asset preparation, never shipped to or executed inside the game.
"""
import argparse
from pathlib import Path
import json
import numpy as np
import onnxruntime as ort
from PIL import Image, ImageDraw

def infer_alpha(image, session):
    rgb = np.asarray(image.convert('RGB').resize((320, 320), Image.Resampling.LANCZOS), dtype=np.float32) / 255
    inp = ((rgb - np.array([.485, .456, .406], dtype=np.float32)) / np.array([.229, .224, .225], dtype=np.float32)).transpose(2, 0, 1)[None]
    pred = session.run(None, {session.get_inputs()[0].name: inp})[0][0, 0]
    pred = (pred - pred.min()) / max(float(pred.max() - pred.min()), 1e-6)
    mask = Image.fromarray((pred * 255).astype(np.uint8)).resize(image.size, Image.Resampling.LANCZOS)
    # Suppress low-confidence checkerboard remnants without eroding metal edges.
    return mask.point(lambda v: 0 if v < 75 else 255 if v > 230 else int((v-75)*255/155))

def process(source, output, session):
    original = Image.open(source).convert('RGBA')
    w, h = original.size
    # Humanoid feet extend below the nominal top-left quadrant in raw generations.
    boxes = [(0, 0, int(w*.51), int(h*.56)), (int(w*.51), 0, w, int(h*.51)),
             (0, int(h*.57), int(w*.51), h), (int(w*.51), int(h*.51), w, h)]
    canvas = Image.new('RGBA', (1024, 1024))
    report = []
    genuine_alpha = original.getchannel('A').getextrema()[0] == 0
    for index, box in enumerate(boxes):
        piece = original.crop(box)
        alpha = piece.getchannel('A').point(lambda v: 0 if v<12 else v) if genuine_alpha else infer_alpha(piece, session)
        if output.name.startswith('weaver') and index == 3:
            # The anchor's closed handle contains an enclosed background hole.
            ImageDraw.Draw(alpha).ellipse((284,62,322,99), fill=0)
        if output.name.startswith('echo') and index == 3:
            # Preserve blue holographic light while removing baked neutral checks.
            rgb=np.asarray(piece.convert('RGB'),dtype=np.int16)
            values=np.array(alpha)
            height=min(values.shape[0],int(h*.72)-box[1])
            saturation=rgb[:height].max(axis=2)-rgb[:height].min(axis=2)
            values[:height]=(values[:height]*np.clip(saturation/38,0,1)).astype(np.uint8)
            alpha=Image.fromarray(values)
        piece.putalpha(alpha)
        bbox = alpha.getbbox()
        if bbox is None:
            raise RuntimeError(f'No foreground: {source}, cell {index}')
        piece = piece.crop(bbox)
        piece.thumbnail((400, 400), Image.Resampling.LANCZOS)
        x = index % 2 * 512 + (512-piece.width)//2
        y = index // 2 * 512 + (512-piece.height)//2
        canvas.alpha_composite(piece, (x, y))
        report.append({'cell': index, 'sourceBounds': bbox, 'width': piece.width, 'height': piece.height})
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(output, optimize=True)
    preview = Image.new('RGBA', canvas.size, '#132321')
    preview.alpha_composite(canvas)
    preview.convert('RGB').save(output.with_name(output.stem+'-qa.jpg'), quality=92)
    return report

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--model', required=True)
    parser.add_argument('--sources', required=True, help='JSON mapping mech id to absolute source PNG')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    session = ort.InferenceSession(args.model, options, providers=['CPUExecutionProvider'])
    sources = json.loads(Path(args.sources).read_text(encoding='utf-8'))
    report = {name: process(Path(path), Path(args.output)/(name+'-kit-v1.png'), session) for name, path in sources.items()}
    print(json.dumps(report, ensure_ascii=False, indent=2))
