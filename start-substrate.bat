@echo off
setlocal

set "DEFAULT_FRONTIER_BINARY=%~dp0substrate-node\target\release\frontier-template-node.exe"
set "FRONTIER_BINARY=%FRONTIER_TEMPLATE_NODE_PATH%"
if "%FRONTIER_BINARY%"=="" set "FRONTIER_BINARY=%DEFAULT_FRONTIER_BINARY%"

echo ===================================================
echo   Frontier Dev Node - Sidechain Bridge
echo ===================================================
echo.
echo   RPC:  http://127.0.0.1:9945
echo   EVM:  http://127.0.0.1:9945
echo   Alith: 0xf24FF3a9CF04c71Dbc94D0b566f7A27B94566cac
echo.

if not exist "%FRONTIER_BINARY%" (
  echo ERROR: Frontier binary not found.
  echo Set FRONTIER_TEMPLATE_NODE_PATH or place the binary at:
  echo   %DEFAULT_FRONTIER_BINARY%
  exit /b 1
)

echo   Binary: %FRONTIER_BINARY%
echo.

REM Port 9945 avoids the common 9944 conflict.
"%FRONTIER_BINARY%" --dev --tmp --rpc-port 9945 --rpc-cors=all --prometheus-port 9616
