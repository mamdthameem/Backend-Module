@echo off
echo ========================================
echo Restarting SSEC-Backend-Service
echo ========================================
echo.

echo Stopping service...
net stop "SSEC-Backend-Service"
if %errorlevel% neq 0 (
    echo Warning: Service may not have been running or stop failed
)

timeout /t 3 /nobreak >nul

echo Starting service...
net start "SSEC-Backend-Service"
if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo Service restarted successfully!
    echo ========================================
) else (
    echo.
    echo ========================================
    echo ERROR: Failed to start service
    echo ========================================
    echo Please check:
    echo 1. You are running as Administrator
    echo 2. Service is installed correctly
    echo 3. Check daemon\ssecbackendservice.err.log for errors
)

pause

