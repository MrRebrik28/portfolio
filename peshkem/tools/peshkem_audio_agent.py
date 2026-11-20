#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ПешКем — Интеллектуальный агент пакетного озвучивания экскурсий (FreeTTS Audio Agent).
Озвучивание текстов остановок голосом Никиты Калинина через сервис FreeTTS.ru
(или совместимые нейросетевые TTS-движки).
"""

import sys
import os
import re
import json
import time
import argparse
import urllib.request
import socket
import ssl
import base64
import struct

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DATA_FILE = os.path.join(PROJECT_ROOT, 'scripts', 'peshkem-data.js')
OUTPUT_DIR = os.path.join(PROJECT_ROOT, 'assets', 'peshkem', 'audio')

FREETTS_API_HOST = "https://api.freetts.ru"
FREETTS_WS_HOST = "api.freetts.ru"
FREETTS_WS_PATH = "/generate"

# Каталог рекомендуемых мужских голосов (во главе с голосом Никиты Калинина)
RECOMMENDED_VOICES = {
    'kalinin': {
        'id': 'rus_Nikita_Kalinin',
        'name': 'Никита Калинин',
        'desc': 'Основной диктор экскурсий ПешКем: уверенный взрослый мужской тембр, классическое дикторское повествование'
    },
    'leonid': {
        'id': 'rus_Leonid_Vorobev',
        'name': 'Леонид Воробьев',
        'desc': 'Взрослый глубокий баритон'
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
        'desc': 'Нейросетевой диктор эталонного качества'
    }
}

DEFAULT_VOICE_ID = "rus_Nikita_Kalinin"
DEFAULT_VOICE_NAME = "Никита Калинин"


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
    """Парсит все 26 остановок трёх маршрутов из peshkem-data.js с приоритетом audioText"""
    if not os.path.exists(DATA_FILE):
        raise FileNotFoundError(f"Файл данных не найден: {DATA_FILE}")

    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        content = f.read()

    # Парсим блоки остановок
    stop_block_pattern = re.compile(
        r'\{\s*id:\s*"([^"]+)",\s*order:\s*(\d+),\s*title:\s*"([^"]+)",(.*?)\}',
        re.S
    )

    stops = []
    for m in stop_block_pattern.finditer(content):
        stop_id = m.group(1)
        order = int(m.group(2))
        title = m.group(3)
        body = m.group(4)

        # Приоритет: audioText, затем fullText
        audio_text_match = re.search(r'audioText:\s*"([^"]+)"', body)
        full_text_match = re.search(r'fullText:\s*"([^"]+)"', body)

        raw_text = ""
        if audio_text_match:
            raw_text = audio_text_match.group(1)
        elif full_text_match:
            raw_text = full_text_match.group(1)
        else:
            continue

        # Определение маршрута по префиксу ID
        if stop_id.startswith('v-'):
            route_id = 'vesennaya-arbat'
            route_name = 'Кемеровский Арбат & Памятные места'
        elif stop_id.startswith('kg-'):
            route_id = 'krasnaya-gorka'
            route_name = 'Индустриальное рождение: Красная Горка'
        else:
            route_id = 'embankment-legends'
            route_name = 'По набережной Томи и городским легендам'

        stops.append({
            'id': stop_id,
            'order': order,
            'title': title,
            'routeId': route_id,
            'routeName': route_name,
            'rawText': raw_text
        })

    return stops


def normalize_text_for_speech(text, title=None):
    """
    Фонетическая нормализация текста перед отправкой диктору:
    раскрывает сокращения, убирает спецсимволы, добавляет дикторские паузы.
    """
    t = text.strip()

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

    return t.strip()


def synthesize_freetts_pure_ws(text, voice_id, output_path, timeout=20.0):
    """
    Выполняет прямой защищенный WebSocket-запрос к API FreeTTS.ru по RFC 6455
    без сторонних зависимостей. Передает точные браузерные заголовки Origin и User-Agent.
    """
    sock = None
    ssock = None
    try:
        sock = socket.create_connection((FREETTS_WS_HOST, 443), timeout=timeout)
        ctx = ssl.create_default_context()
        ssock = ctx.wrap_socket(sock, server_hostname=FREETTS_WS_HOST)

        sec_key = base64.b64encode(os.urandom(16)).decode('ascii')
        handshake = (
            f"GET {FREETTS_WS_PATH} HTTP/1.1\r\n"
            f"Host: {FREETTS_WS_HOST}\r\n"
            f"Upgrade: websocket\r\n"
            f"Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {sec_key}\r\n"
            f"Sec-WebSocket-Version: 13\r\n"
            f"Origin: https://freetts.ru\r\n"
            f"User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36\r\n"
            f"\r\n"
        )
        ssock.sendall(handshake.encode('utf-8'))

        resp = b""
        while b"\r\n\r\n" not in resp:
            chunk = ssock.recv(4096)
            if not chunk:
                break
            resp += chunk

        if b"101 Switching Protocols" not in resp:
            return False, f"Handshake failed: {resp[:200]}"

        # Отправляем фрейм команды start
        payload_dict = {
            "action": "start",
            "text": text + "\u2063",
            "voiceId": voice_id
        }
        payload_bytes = json.dumps(payload_dict, ensure_ascii=False).encode('utf-8')
        length = len(payload_bytes)
        mask_key = os.urandom(4)

        header = bytearray([0x81])
        if length <= 125:
            header.append(0x80 | length)
        elif length <= 65535:
            header.append(0x80 | 126)
            header.extend(struct.pack("!H", length))
        else:
            header.append(0x80 | 127)
            header.extend(struct.pack("!Q", length))
        header.extend(mask_key)

        masked = bytearray(payload_bytes[i] ^ mask_key[i % 4] for i in range(length))
        ssock.sendall(header + masked)

        audio_chunks = bytearray()
        start_time = time.time()

        while time.time() - start_time < timeout:
            raw_h = ssock.recv(2)
            if not raw_h or len(raw_h) < 2:
                break
            b1, b2 = raw_h[0], raw_h[1]
            opcode = b1 & 0x0F
            is_masked = (b2 & 0x80) != 0
            pay_len = b2 & 0x7F

            if pay_len == 126:
                ext = ssock.recv(2)
                pay_len = struct.unpack("!H", ext)[0]
            elif pay_len == 127:
                ext = ssock.recv(8)
                pay_len = struct.unpack("!Q", ext)[0]

            mkey = ssock.recv(4) if is_masked else None

            data = b""
            while len(data) < pay_len:
                p = ssock.recv(pay_len - len(data))
                if not p:
                    break
                data += p

            if is_masked and mkey:
                data = bytes(data[i] ^ mkey[i % 4] for i in range(len(data)))

            if opcode == 0x01: # Text message
                msg = json.loads(data.decode('utf-8', errors='ignore'))
                if msg.get("status") == "ready":
                    if audio_chunks:
                        with open(output_path, 'wb') as f:
                            f.write(audio_chunks)
                        return True, f"Audio synthesized ({len(audio_chunks)} bytes)"
                    break
                elif msg.get("status") == "error":
                    return False, f"FreeTTS error: {msg.get('message', 'Unknown')}"
            elif opcode == 0x02: # Binary audio chunk
                audio_chunks.extend(data)
            elif opcode == 0x08: # Close frame
                break

        if audio_chunks:
            with open(output_path, 'wb') as f:
                f.write(audio_chunks)
            return True, f"Audio synthesized ({len(audio_chunks)} bytes)"

        return False, "FreeTTS не вернул аудиоданные"
    except Exception as e:
        return False, f"Сетевая ошибка FreeTTS: {e}"
    finally:
        if ssock:
            try:
                ssock.close()
            except:
                pass
        if sock:
            try:
                sock.close()
            except:
                pass


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
    print(f"  Символов: {len(norm_text)}, Слов: {word_count}, Примерный хронометраж: ~{approx_duration} сек.")

    if dry_run:
        print(f"  [DRY-RUN] Текст диктора (Никита Калинин):\n  \"{norm_text[:140]}...\"")
        return True

    print(f"  Отправка в FreeTTS (Голос: {voice_id} — Никита Калинин)...")
    ok, msg = synthesize_freetts_pure_ws(norm_text, voice_id, filepath)

    if ok and os.path.exists(filepath) and os.path.getsize(filepath) > 100:
        size_kb = os.path.getsize(filepath) / 1024
        print(f"  УСПЕХ: Аудиофайл сохранен ({size_kb:.1f} КБ)")
        return True
    else:
        print(f"  Статус FreeTTS: {msg}")
        # Если генерация онлайн временно ограничена бэкендом FreeTTS,
        # сохраняем подготовленный дикторский манифест для мгновенного Web Speech / офлайн воспроизведения
        manifest_path = os.path.join(OUTPUT_DIR, f"{stop['id']}.json")
        with open(manifest_path, 'w', encoding='utf-8') as f:
            json.dump({
                'id': stop['id'],
                'order': stop['order'],
                'title': stop['title'],
                'route': stop['routeName'],
                'narrator': DEFAULT_VOICE_NAME,
                'voiceId': voice_id,
                'normalizedText': norm_text,
                'words': word_count,
                'estDurationSec': approx_duration
            }, f, ensure_ascii=False, indent=2)
        print(f"  Дикторский скрипт сохранен: assets/peshkem/audio/{stop['id']}.json")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Агент автоматической озвучки экскурсий ПешКем голосом Никиты Калинина через FreeTTS.ru"
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
    print(f"Загружено экскурсионных точек из базы данных: {len(stops)}")
    print(f"Выбранный диктор: {DEFAULT_VOICE_NAME} (Voice ID: {args.voice})")

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
                time.sleep(1.0) # Пауза вежливости

        print(f"\nИтог: обработано {len(stops)} остановок (успешно синтезировано в MP3: {success_count}).")
        return

    # По умолчанию запускаем полный прогон всех точек
    for s in stops:
        synthesize_stop(s, voice_id=args.voice, dry_run=False)


if __name__ == '__main__':
    main()
