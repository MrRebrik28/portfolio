#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ПешКем — Интеллектуальный агент пакетного озвучивания экскурсий (FreeTTS Audio Agent).
Автоматически парсит тексты 26 остановок из peshkem-data.js, выполняет дикторскую
фонетическую нормализацию и синтезирует MP3-аудиогид через сервис FreeTTS.ru
(или совместимые нейросетевые TTS-движки).
"""

import sys
import os
import re
import json
import time
import argparse
import urllib.request
import subprocess

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DATA_FILE = os.path.join(PROJECT_ROOT, 'scripts', 'peshkem-data.js')
OUTPUT_DIR = os.path.join(PROJECT_ROOT, 'assets', 'peshkem', 'audio')

FREETTS_API_HOST = "https://api.freetts.ru"
FREETTS_WS_URL = "wss://api.freetts.ru/generate"

# Каталог рекомендуемых мужских голосов (для дикторского чтения аудиогида)
RECOMMENDED_VOICES = {
    'leonid': {
        'id': 'rus_Leonid_Vorobev',
        'name': 'Леонид Воробьев',
        'desc': 'Взрослый баритон, глубокий солидный тембр (максимально близкий к дикторской манере Александра Дунина)'
    },
    'platon': {
        'id': 'rus_Platon_Martynov',
        'name': 'Платон Мартынов',
        'desc': 'Классический чтец аудиокниг, повествовательный тон'
    },
    'vladimir': {
        'id': 'rus_Vladimir_Nikitin',
        'name': 'Владимир Никитин',
        'desc': 'Уверенный документальный голос для краеведческих рассказов'
    },
    'roman': {
        'id': 'rus_Roman_Gromov',
        'name': 'Роман Громов',
        'desc': 'Энергичный современный диктор'
    },
    'dmitry': {
        'id': 'rus_Dmitry_Microsoft',
        'name': 'Дмитрий (Microsoft Neural)',
        'desc': 'Эталонная нейросеть высокого качества'
    }
}

DEFAULT_VOICE_ID = "rus_Leonid_Vorobev"


def get_russian_voices():
    """Получает актуальный список русских голосов с сервера FreeTTS"""
    url = f"{FREETTS_API_HOST}/voices?lang=rus"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except Exception as e:
        print(f"Ошибка получения списка голосов с {url}: {e}")
        return []


def extract_stops_from_data():
    """Парсит все 26 остановок трёх маршрутов из peshkem-data.js"""
    if not os.path.exists(DATA_FILE):
        raise FileNotFoundError(f"Файл данных не найден: {DATA_FILE}")

    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        content = f.read()

    pattern = re.compile(
        r'id:\s*"([^"]+)",\s*order:\s*(\d+),\s*title:\s*"([^"]+)",.*?fullText:\s*"([^"]+)"',
        re.S
    )

    stops = []
    for m in pattern.finditer(content):
        stop_id = m.group(1)
        order = int(m.group(2))
        title = m.group(3)
        full_text = m.group(4)

        # Определение маршрута по префиксу ID
        if stop_id.startswith('v-'):
            route_id = 'vesennaya-boulevard'
            route_name = 'Улица Весенняя'
        elif stop_id.startswith('kg-'):
            route_id = 'krasnaya-gorka'
            route_name = 'Красная Горка'
        else:
            route_id = 'embankment-legends'
            route_name = 'По набережной Томи'

        stops.append({
            'id': stop_id,
            'order': order,
            'title': title,
            'routeId': route_id,
            'routeName': route_name,
            'rawText': full_text
        })

    return stops


def normalize_text_for_speech(text, title=None):
    """
    Фонетическая нормализация текста перед отправкой диктору:
    раскрывает сокращения, убирает спецсимволы, добавляет паузы.
    """
    t = text.strip()

    # Замена сокращений на полные слова для естественной речи
    replacements = [
        (r'\bгг\.\b', 'годах'),
        (r'\bг\.\b', 'года'),
        (r'\bвв\.\b', 'веков'),
        (r'\bв\.\b', 'века'),
        (r'\bул\.\b', 'улица'),
        (r'\bтыс\.\b', 'тысяч'),
        (r'\bмлн\.\b', 'миллионов'),
        (r'\bкм\b', 'километров'),
        (r'\bм\b(?=[\s\.,])', 'метров'),
        (r'\bим\.\b', 'имени'),
        (r'\bА\.В\.\b', 'Анатолия Васильевича'),
        (r'\bЮ\.В\.\b', 'Юрия Владимировича'),
        (r'\bА\.А\.\b', 'Алексея Архиповича'),
        (r'\bпр\.\b', 'проспект'),
        (r'\bпл\.\b', 'площадь'),
        (r'\bАИК\b', 'А-И-К'),
        (r'«|»|"|\'', ''),
        (r'—|–', ' - '),
        (r'\s+', ' ')
    ]

    for pat, repl in replacements:
        t = re.sub(pat, repl, t)

    # Добавляем вступительный анонс остановки, если передано название
    if title:
        header_intro = f"Остановка. {title}. "
        t = header_intro + t

    return t.strip()


def synthesize_via_node_helper(text, voice_id, output_path):
    """
    Выполняет синтез через нативный WebSocket-клиент Node.js
    для взаимодействия с FreeTTS.ru API.
    """
    helper_code = f"""
    const fs = require('fs');

    const ws = new WebSocket('{FREETTS_WS_URL}', {{
      headers: {{
        'Origin': 'https://freetts.ru',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      }}
    }});

    const chunks = [];
    ws.binaryType = 'arraybuffer';

    const timer = setTimeout(() => {{
      console.error('TIMEOUT');
      ws.close();
      process.exit(1);
    }}, 20000);

    ws.onopen = () => {{
      const payload = JSON.stringify({{
        action: 'start',
        text: {json.dumps(text)} + '\\u2063',
        voiceId: '{voice_id}'
      }});
      ws.send(payload);
    }};

    ws.onmessage = (event) => {{
      if (event.data instanceof ArrayBuffer) {{
        chunks.push(Buffer.from(event.data));
      }} else {{
        try {{
          const msg = JSON.parse(event.data);
          if (msg.status === 'ready') {{
            clearTimeout(timer);
            const total = Buffer.concat(chunks);
            fs.writeFileSync({json.dumps(output_path)}, total);
            console.log('SUCCESS:' + total.length);
            ws.close();
            process.exit(0);
          }} else if (msg.status === 'error') {{
            console.error('FREETTS_ERROR:' + (msg.message || 'Error'));
            ws.close();
            process.exit(2);
          }}
        }} catch(e) {{}}
      }}
    }};

    ws.onerror = (e) => {{
      console.error('WS_ERROR:' + e.message);
      process.exit(3);
    }};
    """

    res = subprocess.run(
        ['node', '-e', helper_code],
        capture_output=True,
        text=True
    )
    return res.returncode == 0, res.stdout, res.stderr


def synthesize_stop(stop, voice_id=DEFAULT_VOICE_ID, dry_run=False):
    """Озвучивает одну конкретную остановку и сохраняет MP3"""
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    filename = f"{stop['id']}.mp3"
    filepath = os.path.join(OUTPUT_DIR, filename)

    norm_text = normalize_text_for_speech(stop['rawText'], title=stop['title'])
    word_count = len(norm_text.split())
    approx_duration = int(word_count / 2.2) # ~130 слов в минуту

    print(f"\n[#{stop['order']}] {stop['title']} ({stop['routeName']})")
    print(f"  Файл: assets/peshkem/audio/{filename}")
    print(f"  Символов: {len(norm_text)}, Слов: {word_count}, Примерная длительность: ~{approx_duration} сек.")

    if dry_run:
        print(f"  [DRY-RUN] Текст подготовлен:\n  \"{norm_text[:140]}...\"")
        return True

    print(f"  Отправка в FreeTTS (Голос: {voice_id})...")
    ok, stdout, stderr = synthesize_via_node_helper(norm_text, voice_id, filepath)

    if ok and os.path.exists(filepath) and os.path.getsize(filepath) > 100:
        size_kb = os.path.getsize(filepath) / 1024
        print(f"  УСПЕХ: Аудиофайл сохранен ({size_kb:.1f} КБ)")
        return True
    else:
        print(f"  Предупреждение: FreeTTS вернул ошибку или ограничение сервера.")
        if stderr:
            print(f"  Детали ошибки: {stderr.strip()}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Агент автоматической озвучки экскурсий ПешКем через FreeTTS.ru"
    )
    parser.add_argument('--all', action='store_true', help='Озвучить все 26 остановок всех маршрутов')
    parser.add_argument('--stop', type=str, help='Озвучить конкретную остановку по ID (например: stop-1-circus)')
    parser.add_argument('--voice', type=str, default=DEFAULT_VOICE_ID, help=f'ID голоса FreeTTS (по умолчанию: {DEFAULT_VOICE_ID})')
    parser.add_argument('--list-voices', action='store_true', help='Показать список всех доступных русских голосов FreeTTS')
    parser.add_argument('--dry-run', action='store_true', help='Подготовить тексты и рассчитать тайминги без отправки запросов')

    args = parser.parse_args()

    if args.list_voices:
        print("=== Рекомендуемые мужские голоса для дикторского чтения «ПешКем» ===")
        for k, v in RECOMMENDED_VOICES.items():
            print(f"  • {v['name']} (ID: {v['id']}):\n    {v['desc']}\n")

        print("=== Все 35 русских голосов на сервере FreeTTS.ru ===")
        voices = get_russian_voices()
        for v in voices:
            tags = ", ".join(v.get('tags', []))
            print(f"  ID: {v.get('id'):<26} | Имя: {v.get('name'):<22} | {tags}")
        return

    stops = extract_stops_from_data()
    print(f"Загружено остановок из базы данных: {len(stops)}")

    if args.stop:
        target = next((s for s in stops if s['id'] == args.stop), None)
        if not target:
            print(f"Ошибка: остановка с ID '{args.stop}' не найдена.")
            sys.exit(1)
        synthesize_stop(target, voice_id=args.voice, dry_run=args.dry_run)
        return

    if args.all or args.dry_run:
        success_count = 0
        for s in stops:
            ok = synthesize_stop(s, voice_id=args.voice, dry_run=args.dry_run)
            if ok:
                success_count += 1
            if not args.dry_run:
                time.sleep(1.5) # Пауза вежливости между запросами к TTS

        print(f"\nИтог: успешно обработано {success_count} из {len(stops)} остановок.")
        return

    # Если параметры не переданы, показываем краткую справку
    parser.print_help()


if __name__ == '__main__':
    main()
