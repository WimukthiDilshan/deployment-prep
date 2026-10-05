import json
import os
import sys


def chunk_segments(segments, window_seconds=10):
    if not segments:
        return []

    chunks = {}
    for segment in segments:
        start = float(segment.get("start", 0))
        end = float(segment.get("end", start))
        text = (segment.get("text") or "").strip()
        if not text:
            continue

        chunk_index = int(start // window_seconds)
        chunk_start = chunk_index * window_seconds
        chunk_end = chunk_start + window_seconds

        if chunk_index not in chunks:
            chunks[chunk_index] = {
                "index": chunk_index,
                "startSec": chunk_start,
                "endSec": chunk_end,
                "textParts": [],
            }

        chunks[chunk_index]["textParts"].append(text)
        if end > chunks[chunk_index]["endSec"]:
            chunks[chunk_index]["endSec"] = end

    sorted_keys = sorted(chunks.keys())
    finalized = []
    for key in sorted_keys:
        item = chunks[key]
        finalized.append(
            {
                "index": item["index"],
                "startSec": round(item["startSec"], 2),
                "endSec": round(item["endSec"], 2),
                "text": " ".join(item["textParts"]).strip(),
            }
        )
    return finalized


def main():
    if len(sys.argv) < 2:
        print("Missing video file path", file=sys.stderr)
        sys.exit(1)

    video_path = sys.argv[1]
    model_name = sys.argv[2] if len(sys.argv) > 2 else "base"
    ffmpeg_binary = os.getenv("FFMPEG_BINARY")

    if ffmpeg_binary:
        if not os.path.exists(ffmpeg_binary):
            print(
                f"FFMPEG_BINARY path not found: {ffmpeg_binary}",
                file=sys.stderr,
            )
            sys.exit(1)

        ffmpeg_dir = os.path.dirname(ffmpeg_binary)
        os.environ["PATH"] = ffmpeg_dir + os.pathsep + os.environ.get("PATH", "")

    try:
        import whisper
    except Exception:
        print(
            "Python package 'openai-whisper' is not installed. Run: pip install openai-whisper",
            file=sys.stderr,
        )
        sys.exit(1)

    try:
        model = whisper.load_model(model_name)
        result = model.transcribe(video_path)
        text = (result.get("text") or "").strip()
        chunks = chunk_segments(result.get("segments", []), 30)
        print(json.dumps({"text": text, "chunks": chunks}))
    except Exception as exc:
        print(f"Transcription failed: {str(exc)}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
