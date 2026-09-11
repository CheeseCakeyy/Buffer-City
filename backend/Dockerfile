FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY migrations ./migrations
RUN useradd --uid 10001 --create-home city && mkdir /app/data && chown city:city /app/data
USER city
ENV ENVIRONMENT=production DATABASE_PATH=/app/data/visitors.sqlite3
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--no-proxy-headers"]

