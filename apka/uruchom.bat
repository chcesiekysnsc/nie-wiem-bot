@echo off
title Asystent Czyszczenia i Migracji Dysku
chcp 65001 > nul

echo ===================================================
echo   Asystent Czyszczenia i Migracji Dysku (C: - D:)
echo ===================================================
echo.

:: Sprawdzenie czy Node.js jest zainstalowany
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [BLAD] Node.js nie jest zainstalowany na tym komputerze!
    echo Pobierz i zainstaluj Node.js ze strony https://nodejs.org/
    pause
    exit /b 1
)

echo [1/2] Instalowanie wymaganych bibliotek (Express)...
call npm install

if %errorlevel% neq 0 (
    echo.
    echo [BLAD] Wystapil blad podczas instalacji bibliotek.
    pause
    exit /b 1
)

echo.
echo [2/2] Uruchamianie serwera i otwieranie aplikacji w przegladarce...
echo Serwer zostanie uruchomiony na porcie 3000.
echo.

start http://localhost:3000
call npm start

pause
