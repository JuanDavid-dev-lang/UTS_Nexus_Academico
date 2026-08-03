# Servicio de riesgo y de lectura de planillas.
#
# La imagen base es `slim` y no `alpine`: numpy, scikit-learn y OpenCV publican
# ruedas precompiladas para glibc pero no para musl, y en alpine habría que
# compilarlas desde el código fuente —media hora de build y un compilador de C++
# dentro de la imagen final—.

FROM python:3.12-slim AS runtime

WORKDIR /app

# OpenCV necesita estas dos aunque se use la variante headless.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Los modelos entrenados van a un volumen: si vivieran en la imagen, cada
# despliegue borraría el modelo aprendido con los datos reales de la institución
# y el sistema volvería al de arranque, derivado de reglas.
RUN mkdir -p models && useradd --create-home --uid 1001 servicio \
    && chown -R servicio:servicio /app
USER servicio

EXPOSE 8100

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8100/health',timeout=4).status==200 else 1)"

# Un solo worker a propósito: el modelo y el lector de OCR se cargan en memoria,
# y varios workers multiplicarían ese consumo en una instancia pequeña.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8100", "--workers", "1"]
