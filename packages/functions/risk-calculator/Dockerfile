FROM ghcr.io/openfaas/classic-watchdog:0.2.3 AS watchdog
FROM python:3.11-slim

COPY --from=watchdog /fwatchdog /usr/bin/fwatchdog
RUN chmod +x /usr/bin/fwatchdog

WORKDIR /root/
COPY handler.py .
ENV fprocess="python3 handler.py"

# Healthcheck required by OpenFaaS
HEALTHCHECK --interval=3s CMD [ -e /tmp/.lock ] || exit 1
EXPOSE 8080
CMD ["fwatchdog"]
