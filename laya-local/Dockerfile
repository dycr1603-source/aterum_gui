FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/home/laya/.cache/huggingface

RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir "laya[serve]==0.4.6" \
    && useradd --uid 10001 --create-home laya \
    && mkdir -p /home/laya/.cache/huggingface \
    && chown -R 10001:10001 /home/laya

USER 10001:10001
EXPOSE 8000
CMD ["laya-serve"]
