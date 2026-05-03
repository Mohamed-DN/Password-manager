#!/bin/bash
echo "🚀 Avvio del sistema Secure Vault con Podman..."
podman-compose up -d --build
echo "✅ Sistema avviato!"
echo "🔗 Frontend: http://localhost:5173"
echo "🔗 API Docs: http://localhost:8000/docs"