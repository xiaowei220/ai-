@echo off
chcp 65001 >nul
title AI 硬件架构师 - Blueprint.clone 全栈版 服务器
cd /d "%~dp0"

echo 正在检测服务器状态...
netstat -ano | findstr ":7778 " | findstr "LISTENING" >nul
if %errorlevel%==0 goto already

rem 检查 Node.js 是否安装
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo.
    echo  [错误] 未检测到 Node.js 环境
    echo  请先安装: https://nodejs.org/zh-cn （安装完成后重新双击本文件）
    echo.
    pause
    exit
)

echo 正在启动服务器，请稍候...
start /b node server.js
timeout /t 3 /nobreak >nul

netstat -ano | findstr ":7778 " | findstr "LISTENING" >nul
if %errorlevel% neq 0 (
    echo.
    echo  [错误] 服务器启动失败！
    echo  常见原因: 端口被占用 / 数据损坏（可删除 data 文件夹后重试）
    echo.
    pause
    exit
)

:already
rem 放行防火墙端口（手机访问需要；无管理员权限时自动跳过）
netsh advfirewall firewall add rule name="ai-hardware-7778" dir=in action=allow protocol=TCP localport=7778 >nul 2>nul

echo.
echo  ==============================================
echo    ✅ 服务器运行中！正在自动打开应用...
echo  ==============================================
start "" "http://localhost:7778/"
echo.
echo    前台应用:  http://localhost:7778/
echo    管理后台:  http://localhost:7778/admin  (admin / admin123)
echo    手机访问:  http://本机IP:7778/  (需同一WiFi，如 192.168.0.45:7778)
echo.
echo    ⚠ 请保持本窗口开启！关闭本窗口 = 停止服务器
echo.
pause
