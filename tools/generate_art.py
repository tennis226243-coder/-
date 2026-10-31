#!/usr/bin/env python3
"""キャラクターイラストを ChatGPT（OpenAI）と Gemini に依頼して保存する。

使い方:
  OPENAI_API_KEY=... GEMINI_API_KEY=... python3 tools/generate_art.py [キャラID ...]

出力:
  assets/characters/candidates/<id>_openai.png
  assets/characters/candidates/<id>_gemini.png
気に入った方を assets/characters/<id>.png にコピーすると、ゲームに反映される。
キーが片方しかない場合は、そちらだけ生成する。標準ライブラリのみで動く。
"""
import base64
import json
import os
import sys
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'characters', 'candidates')
OPENAI_MODEL = os.environ.get('OPENAI_IMAGE_MODEL', 'gpt-image-1')
GEMINI_MODEL = os.environ.get('GEMINI_IMAGE_MODEL', 'gemini-2.5-flash-image')


def post(url, body, headers):
    req = urllib.request.Request(url, json.dumps(body).encode(), {'Content-Type': 'application/json', **headers})
    with urllib.request.urlopen(req, timeout=300) as res:
        return json.load(res)


def openai_image(prompt, key):
    res = post('https://api.openai.com/v1/images/generations',
               {'model': OPENAI_MODEL, 'prompt': prompt, 'size': '1024x1536', 'background': 'transparent',
                'output_format': 'png', 'quality': 'high'},
               {'Authorization': f'Bearer {key}'})
    return base64.b64decode(res['data'][0]['b64_json'])


def gemini_image(prompt, key):
    res = post(f'https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent',
               {'contents': [{'parts': [{'text': prompt + ' Portrait orientation, 2:3 aspect ratio.'}]}],
                'generationConfig': {'responseModalities': ['IMAGE']}},
               {'x-goog-api-key': key})
    for part in res['candidates'][0]['content']['parts']:
        data = part.get('inlineData') or part.get('inline_data')
        if data:
            return base64.b64decode(data['data'])
    raise RuntimeError('画像が返ってきませんでした: ' + json.dumps(res)[:300])


def main():
    with open(os.path.join(ROOT, 'tools', 'art_prompts.json'), encoding='utf-8') as f:
        spec = json.load(f)
    only = set(sys.argv[1:])
    providers = [(name, fn, os.environ.get(env)) for name, fn, env in
                 [('openai', openai_image, 'OPENAI_API_KEY'), ('gemini', gemini_image, 'GEMINI_API_KEY')]]
    providers = [p for p in providers if p[2]]
    if not providers:
        sys.exit('OPENAI_API_KEY か GEMINI_API_KEY を設定してください')
    os.makedirs(OUT, exist_ok=True)
    failed = 0
    for ch in spec['characters']:
        if only and ch['id'] not in only:
            continue
        prompt = f"{spec['style']} {ch['prompt']}"
        for name, fn, key in providers:
            path = os.path.join(OUT, f"{ch['id']}_{name}.png")
            try:
                data = fn(prompt, key)
                with open(path, 'wb') as f:
                    f.write(data)
                print('saved', os.path.relpath(path, ROOT))
            except (urllib.error.URLError, KeyError, RuntimeError) as e:
                failed += 1
                detail = e.read().decode()[:300] if isinstance(e, urllib.error.HTTPError) else e
                print(f"FAILED {ch['id']} ({name}): {detail}", file=sys.stderr)
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
