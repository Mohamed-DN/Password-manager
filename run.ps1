# Script di avvio rapido per M-DN Secure Vault
Write-Host "🚀 Avvio del sistema Secure Vault..." -ForegroundColor Cyan
docker-compose up -d --build
Write-Host "✅ Sistema avviato!" -ForegroundColor Green
Write-Host "🔗 Frontend: http://localhost:5173" -ForegroundColor Yellow
Write-Host "🔗 API Docs: http://localhost:8000/docs" -ForegroundColor Yellow
pause
