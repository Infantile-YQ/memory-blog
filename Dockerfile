FROM python:3.12-slim

WORKDIR /app

COPY . /app

ENV HOST=0.0.0.0
ENV PORT=8000
ENV BLOG_DATA_DIR=/app/data

EXPOSE 8000

CMD ["python", "main.py"]
