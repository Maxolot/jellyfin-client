FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 MODEL_CACHE=/opt/describe-model OPENBLAS_NUM_THREADS=1
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY search.py sources.py server.py ./
RUN HF_HUB_DISABLE_XET=1 python -c 'from pathlib import Path; from search import FastEmbedEncoder; FastEmbedEncoder(Path("/opt/describe-model"), offline=False).query("test")' \
    && mkdir -p /data && chown 10001:10001 /data \
    && chmod -R a+rX /opt/describe-model
ENV HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1
USER 10001:10001
EXPOSE 8080
CMD ["python", "server.py"]
